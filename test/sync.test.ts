/**
 * Синхронизация на локальном HTTP-сервере: два «источника» (/cdn и /pages) отдают
 * опубликованные данные, собранные из фикстур форума.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SyncStatus } from '@shared/ipc';
import { type Manifest, type RuleDoc, SourcesConfigSchema } from '@shared/schema';
import { parseData, SchemaVersionError } from '../src/main/data';
import { type Db, openDb } from '../src/main/db';
import * as repo from '../src/main/db/repo';
import { SyncService, DIRECT_FALLBACK_AFTER } from '../src/main/sync';
import {
  AppOutdatedError,
  CentralUnavailableError,
  compareVersions,
  type FetchCache,
  fetchCentral,
} from '../src/main/sync/central';
import { scrapeDirect } from '../src/main/sync/direct';
import { runScrape, type ScrapeResult } from '../src/scraper';
import { BlockedError } from '../src/scraper/http';
import { fixtureFetcher } from '../src/scraper/offline';
import { buildManifest, serializeData } from '../src/scraper/output';
import { fixturesDir } from './helpers';

const sources = SourcesConfigSchema.parse(
  JSON.parse(readFileSync(path.resolve(fixturesDir, '../../config/sources.json'), 'utf8')),
);

// ---------- публикация и сервер

type Published = { manifest: Manifest; files: Map<string, string> };

function publish(docs: RuleDoc[], prev?: Manifest, extra: Partial<Manifest> = {}): Published {
  const input = {
    categories: scraped.categories,
    docs,
    changes: [],
    synonyms: '{"дм":["deathmatch"]}',
    warnings: [],
    prevManifest: prev,
    now: new Date('2026-10-18T03:07:00Z'),
  };
  const files = serializeData(input);
  const { manifest } = buildManifest(files, input);
  return { manifest: { ...manifest, ...extra }, files };
}

/** Что отдаёт каждый источник; null — источник «лежит» (503) */
const sites: Record<'cdn' | 'pages', Published | null> = { cdn: null, pages: null };
/** Подмена отдельных файлов: «site/путь» → тело */
const overrides = new Map<string, string>();
const requests: string[] = [];

let server: Server;
let base = '';
let scraped: ScrapeResult;

beforeAll(async () => {
  scraped = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
  server = createServer((req, res) => {
    const url = req.url ?? '';
    requests.push(url);
    const [, site, ...rest] = url.split('/');
    const file = rest.join('/');
    const pub = sites[site as 'cdn' | 'pages'];
    if (!pub) return void res.writeHead(503).end();
    const body =
      overrides.get(`${site}/${file}`) ??
      (file === 'manifest.json' ? JSON.stringify(pub.manifest) : pub.files.get(file));
    if (body === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const bases = () => [`${base}/cdn`, `${base}/pages`];

function reset(pub: Published | null, pages: Published | null = pub) {
  sites.cdn = pub;
  sites.pages = pages;
  overrides.clear();
  requests.length = 0;
}

/** БД, наполненная версией pub (как после seed) */
function dbWith(pub: Published): Db {
  const db = openDb(':memory:');
  repo.applyData(db, parseData(pub.manifest, pub.files));
  return db;
}

const central = (db: Db, appVersion = '1.0.0') =>
  fetchCentral({ db, fetch, bases: bases(), appVersion, timeoutMs: 5000 });

function changedDocs(): RuleDoc[] {
  const docs = structuredClone(scraped.docs);
  const doc = docs.find((d) => d.id === 402991)!;
  const rule = doc.sections[0]!.rules[0]!;
  rule.text += ' (новая редакция)';
  rule.hash = 'изменён';
  doc.hash = 'изменён';
  return docs;
}

// ---------- central

describe('sync central', () => {
  it('версия та же → качается только manifest', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const db = dbWith(v1);
    const res = await central(db);
    expect(res.kind).toBe('unchanged');
    expect(requests).toEqual(['/cdn/manifest.json']);
  });

  it('все запросы — со сверкой с сервером (не из HTTP-кеша: jsDelivr даёт max-age 7 дней)', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const spy = vi.fn((url: string, init?: { cache?: FetchCache }) => fetch(url, init));
    await fetchCentral({
      db: openDb(':memory:'),
      fetch: spy,
      bases: bases(),
      appVersion: '1.0.0',
      timeoutMs: 5000,
    });
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of spy.mock.calls) expect(init?.cache).toBe('no-cache');
  });

  it('частичная докачка: только изменившийся документ (+ categories.json)', async () => {
    const v1 = publish(scraped.docs);
    const v2 = publish(changedDocs(), v1.manifest);
    expect(v2.manifest.version).toBe(2);
    reset(v2);
    const db = dbWith(v1);

    const res = await central(db);
    expect(res.kind).toBe('updated');
    if (res.kind !== 'updated') return;
    expect(res.downloaded.sort()).toEqual(['categories.json', 'docs/402991.json']);
    expect(requests.sort()).toEqual([
      '/cdn/categories.json',
      '/cdn/docs/402991.json',
      '/cdn/manifest.json',
    ]);

    repo.applyData(db, res.data);
    expect(repo.getDataVersion(db)).toBe(2);
    expect(repo.getRule(db, '402991:1.1')!.text).toContain('новая редакция');
    expect(repo.getSearchCorpus(db)).toHaveLength(1059); // остальные документы на месте
    expect(repo.getDataFiles(db)).toEqual(v2.manifest.files);
  });

  it('неверный sha1 на CDN → файл берётся с зеркала', async () => {
    const v1 = publish(scraped.docs);
    const v2 = publish(changedDocs(), v1.manifest);
    reset(v2);
    overrides.set('cdn/docs/402991.json', v1.files.get('docs/402991.json')!); // устаревший кеш CDN
    const db = dbWith(v1);
    const res = await central(db);
    expect(res.kind).toBe('updated');
    expect(requests).toContain('/pages/docs/402991.json');
  });

  it('неверный sha1 везде → ошибка, БД не тронута', async () => {
    const v1 = publish(scraped.docs);
    const v2 = publish(changedDocs(), v1.manifest);
    reset(v2);
    overrides.set('cdn/docs/402991.json', '{"подмена":true}');
    overrides.set('pages/docs/402991.json', '{"подмена":true}');
    const db = dbWith(v1);
    await expect(central(db)).rejects.toThrow(/sha1/);
    expect(repo.getDataVersion(db)).toBe(1);
  });

  it('CDN недоступен → данные с зеркала', async () => {
    const v1 = publish(scraped.docs);
    const v2 = publish(changedDocs(), v1.manifest);
    reset(null, v2);
    const db = dbWith(v1);
    const res = await central(db);
    expect(res.kind).toBe('updated');
    expect(requests.filter((r) => r.startsWith('/pages/')).sort()).toEqual([
      '/pages/categories.json',
      '/pages/docs/402991.json',
      '/pages/manifest.json',
    ]);
  });

  it('оба источника недоступны → CentralUnavailableError', async () => {
    const v1 = publish(scraped.docs);
    reset(null, null);
    await expect(central(dbWith(v1))).rejects.toMatchObject({
      constructor: CentralUnavailableError,
      reachable: true, // серверы ответили 503 — сеть есть
    });
    const err = await fetchCentral({
      db: dbWith(v1),
      fetch,
      bases: ['http://127.0.0.1:1/data'],
      appVersion: '1.0.0',
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ constructor: CentralUnavailableError, reachable: false });
  });

  it('несовместимая schemaVersion → SchemaVersionError', async () => {
    const v1 = publish(scraped.docs);
    reset(publish(scraped.docs, v1.manifest, { schemaVersion: 2, version: 5 }));
    await expect(central(dbWith(v1))).rejects.toBeInstanceOf(SchemaVersionError);
  });

  it('minAppVersion выше текущей → AppOutdatedError', async () => {
    const v1 = publish(scraped.docs);
    reset(publish(changedDocs(), v1.manifest, { minAppVersion: '1.2.0' }));
    await expect(central(dbWith(v1), '1.1.9')).rejects.toBeInstanceOf(AppOutdatedError);
    await expect(central(dbWith(v1), '1.2.0')).resolves.toMatchObject({ kind: 'updated' });
  });

  it('после direct central перекачивает всё', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const db = dbWith(v1);
    repo.setMeta(db, 'data_source', 'direct');
    const res = await central(db);
    expect(res.kind).toBe('updated');
    if (res.kind === 'updated')
      expect(res.downloaded).toHaveLength(Object.keys(v1.manifest.files).length);
  });

  it('compareVersions', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
  });
});

// ---------- SyncService

function service(
  db: Db,
  opts: { now?: Date; mode?: 'auto' | 'direct'; direct?: () => Promise<repo.DataInput> } = {},
) {
  const statuses: SyncStatus[] = [];
  const updates: number[] = [];
  let directCalls = 0;
  const sync = new SyncService({
    db,
    fetch,
    bases: bases(),
    appVersion: '1.0.0',
    getMode: () => opts.mode ?? 'auto',
    direct: async () => {
      directCalls++;
      if (opts.direct) return opts.direct();
      throw new BlockedError('https://forum.grand-rp.su/');
    },
    emit: (s) => statuses.push(s),
    onUpdated: ({ newChanges }) => updates.push(newChanges.length),
    now: () => opts.now ?? new Date('2026-10-18T12:00:00Z'),
  });
  return { sync, statuses, updates, directCalls: () => directCalls };
}

describe('SyncService', () => {
  it('обновление: статусы checking → idle, событие data:updated', async () => {
    const v1 = publish(scraped.docs);
    reset(publish(changedDocs(), v1.manifest));
    const db = dbWith(v1);
    const s = service(db);
    await s.sync.run();
    expect(s.statuses.map((x) => x.state)).toEqual(['checking', 'idle']);
    expect(s.updates).toEqual([0]);
    expect(s.sync.status()).toMatchObject({ state: 'idle', mode: 'central', dataVersion: 2 });
    expect(s.sync.status().lastSuccessAt).toBe('2026-10-18T12:00:00.000Z');
  });

  it('одна синхронизация одновременно', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const s = service(dbWith(v1));
    await Promise.all([s.sync.run(), s.sync.run(), s.sync.run({ manual: true })]);
    expect(requests.filter((r) => r.endsWith('manifest.json'))).toHaveLength(1);
  });

  it('нет сети < 3 суток → offline, форум не трогаем', async () => {
    const v1 = publish(scraped.docs);
    reset(null, null);
    const db = dbWith(v1);
    const s = service(db);
    await s.sync.run();
    expect(s.sync.status()).toMatchObject({ state: 'offline', mode: 'central' });
    expect(s.directCalls()).toBe(0);
    expect(repo.getMeta(db, 'central_failing_since')).toBe('2026-10-18T12:00:00.000Z');
  });

  it('нет central > 3 суток → direct; закрытый форум → понятная ошибка', async () => {
    const v1 = publish(scraped.docs);
    reset(null, null);
    const db = dbWith(v1);
    repo.setMeta(
      db,
      'central_failing_since',
      new Date(Date.parse('2026-10-18T12:00:00Z') - DIRECT_FALLBACK_AFTER - 1).toISOString(),
    );
    const s = service(db);
    await s.sync.run();
    expect(s.directCalls()).toBe(1);
    expect(s.sync.status()).toMatchObject({
      state: 'error',
      mode: 'direct',
      error: 'Форум закрыт проверкой браузера',
    });
    // второй запуск в тот же день форум не дёргает
    await s.sync.run();
    expect(s.directCalls()).toBe(1);
    expect(s.sync.status()).toMatchObject({ state: 'offline', mode: 'direct' });
  });

  it('central снова доступен → сброс счётчика недоступности', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const db = dbWith(v1);
    repo.setMeta(db, 'central_failing_since', '2026-10-01T00:00:00.000Z');
    await service(db).sync.run();
    expect(repo.getMeta(db, 'central_failing_since')).toBeUndefined();
  });

  it('несовместимые данные → appOutdated', async () => {
    const v1 = publish(scraped.docs);
    reset(publish(scraped.docs, v1.manifest, { schemaVersion: 9, version: 2 }));
    const s = service(dbWith(v1));
    await s.sync.run();
    expect(s.sync.status()).toMatchObject({ state: 'error', appOutdated: true });
  });

  it('режим direct: данные с форума, новые записи в ленте', async () => {
    const v1 = publish(scraped.docs);
    reset(v1);
    const db = dbWith(v1);
    const s = service(db, {
      mode: 'direct',
      direct: () =>
        scrapeDirect({
          db,
          sources,
          now: new Date('2026-10-18T12:00:00Z'),
          fetchText: fixtureFetcher(fixturesDir, {
            '/threads/402991/': readFileSync(
              path.join(fixturesDir, 'threads/402991.html'),
              'utf8',
            ).replaceAll('Лидер имеет право', 'Лидер обязан'),
          }),
        }),
    });
    await s.sync.run({ manual: true });
    expect(requests).toEqual([]); // central не запрашивался
    expect(s.sync.status()).toMatchObject({ state: 'idle', mode: 'direct' });
    expect(s.updates[0]).toBeGreaterThan(0);
    expect(repo.getRule(db, '402991:1.1')!.text).toContain('Лидер обязан');
    expect(repo.getChanges(db)[0]).toMatchObject({ docId: 402991, type: 'changed', seen: false });
    expect(repo.getMeta(db, 'data_source')).toBe('direct');
  });
});
