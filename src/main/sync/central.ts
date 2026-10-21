/**
 * Режим central (§7.2): manifest.json с jsDelivr, при ошибке — с зеркала GitHub Pages.
 * Если версия та же — ничего не качаем. Иначе докачиваем только файлы с изменившимся sha1
 * (categories.json — всегда, он маленький и нужен для порядка документов) и сверяем sha1
 * каждого. Устаревший файл на CDN (кеш jsDelivr) → берём тот же файл с зеркала.
 *
 * Без Electron: fetch передаётся снаружи (в приложении — net.fetch с системным прокси).
 */
import { ZodError } from 'zod';
import { type Manifest, ManifestSchema, SCHEMA_VERSION } from '@shared/schema';
import { IntegrityError, parseData, SchemaVersionError, sha1 } from '../data';
import type { Db } from '../db';
import { type DataInput, getDataFiles, getDataVersion, getMeta } from '../db/repo';

/** Режим HTTP-кеша fetch (RequestCache из DOM — в tsconfig main его нет) */
export type FetchCache = 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache';

export type Fetcher = (
  url: string,
  init?: { signal?: AbortSignal; cache?: FetchCache },
) => Promise<Response>;

/**
 * jsDelivr разрешает хранить файлы 7 дней (max-age=604800), и net.fetch брал бы manifest.json
 * из HTTP-кеша Chromium, не спрашивая сервер: новые правила не видны неделю, а изменившийся
 * docs/*.json не сходится по sha1. no-cache — всегда сверка с сервером (не изменилось — 304).
 */
export const DATA_FETCH_CACHE: FetchCache = 'no-cache';

/**
 * Все источники данных недоступны. `reachable` — хотя бы один сервер ответил по HTTP
 * (сеть есть, но данных нет или сервер сбоит), иначе — похоже, нет сети.
 */
export class CentralUnavailableError extends Error {
  constructor(
    message: string,
    readonly reachable: boolean,
  ) {
    super(message);
  }
}

class HttpStatusError extends Error {}

/** Данные требуют более новой версии приложения */
export class AppOutdatedError extends Error {
  constructor(readonly minAppVersion: string) {
    super(`данные требуют версию приложения ${minAppVersion} или новее`);
  }
}

export type CentralOptions = {
  db: Db;
  fetch: Fetcher;
  /** Базовые адреса каталога data/ в порядке приоритета: CDN, зеркало */
  bases: string[];
  appVersion: string;
  timeoutMs?: number;
};

export type CentralResult =
  | { kind: 'unchanged'; manifest: Manifest }
  | { kind: 'updated'; manifest: Manifest; data: DataInput; downloaded: string[] };

/** semver без пре-релизов: a < b → отрицательное */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function getText(fetch: Fetcher, url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: DATA_FETCH_CACHE,
  });
  if (!res.ok) throw new HttpStatusError(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export async function fetchCentral(opts: CentralOptions): Promise<CentralResult> {
  const { db, fetch, bases, appVersion, timeoutMs = 15_000 } = opts;

  // 1. манифест — с первого источника, который ответил корректным JSON
  let manifest: Manifest | undefined;
  let primary = 0;
  const errors: string[] = [];
  let reachable = false;
  for (const [i, base] of bases.entries()) {
    try {
      const raw = JSON.parse(await getText(fetch, `${base}/manifest.json`, timeoutMs)) as unknown;
      manifest = ManifestSchema.parse(raw);
      primary = i;
      break;
    } catch (e) {
      errors.push(`${base}: ${(e as Error).message}`);
      // ответил с ошибкой или прислал не то — сервер, значит, доступен
      if (e instanceof HttpStatusError || e instanceof SyntaxError || e instanceof ZodError)
        reachable = true;
    }
  }
  if (!manifest)
    throw new CentralUnavailableError(`данные недоступны (${errors.join('; ')})`, reachable);

  // 2. совместимость
  if (manifest.schemaVersion !== SCHEMA_VERSION)
    throw new SchemaVersionError(manifest.schemaVersion);
  if (manifest.minAppVersion && compareVersions(appVersion, manifest.minAppVersion) < 0)
    throw new AppOutdatedError(manifest.minAppVersion);

  // 3. та же версия — выходим. После direct-режима central — эталон: качаем всё заново.
  const fromDirect = getMeta(db, 'data_source') === 'direct';
  if (!fromDirect && manifest.version === getDataVersion(db))
    return { kind: 'unchanged', manifest };

  // 4. только изменившиеся файлы; источники — начиная с ответившего, затем остальные
  const local = fromDirect ? {} : getDataFiles(db);
  const need = Object.entries(manifest.files)
    .filter(([name, hash]) => name === 'categories.json' || local[name] !== hash)
    .map(([name]) => name);
  const order = [...bases.slice(primary), ...bases.slice(0, primary)];

  const files = new Map<string, string>();
  for (const name of need) {
    const expected = manifest.files[name]!;
    const problems: string[] = [];
    for (const base of order) {
      try {
        const text = await getText(fetch, `${base}/${name}`, timeoutMs);
        if (sha1(text) !== expected) {
          problems.push(`${base}: sha1 не совпадает`);
          continue;
        }
        files.set(name, text);
        break;
      } catch (e) {
        problems.push(`${base}: ${(e as Error).message}`);
      }
    }
    if (!files.has(name)) {
      const msg = `файл ${name} не получен (${problems.join('; ')})`;
      throw problems.every((p) => p.includes('sha1'))
        ? new IntegrityError(msg)
        : new CentralUnavailableError(msg, true);
    }
  }

  // 5. разбор и проверка схемой; запись — у вызывающего, одной транзакцией
  const data = parseData(manifest, files, { partial: true });
  data.meta = { ...data.meta!, source: 'central' };
  return { kind: 'updated', manifest, data, downloaded: need };
}
