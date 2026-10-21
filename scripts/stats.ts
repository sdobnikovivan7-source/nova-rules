/**
 * Пересчёт data/stats.json (этап 12, .github/workflows/stats.yml).
 *
 *   pnpm stats --out <путь к data/stats.json>
 *
 * Игроки — по статистике jsDelivr, скачивания — по GitHub Releases. Источник недоступен —
 * берётся прошлое значение; недоступны оба — файл не трогается (код 0). Файла ещё нет — создаётся.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { type Stats, StatsSchema } from '../src/shared/schema';
import {
  computeStats,
  type GithubReleases,
  type JsdelivrFiles,
  sumDownloads,
} from '../src/scraper/stats';

const REPO = 'sdobnikovivan7-source/nova-rules';
const JSDELIVR = `https://data.jsdelivr.com/v1/stats/packages/gh/${REPO}@data/files?period=month`;
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=100`;

const { values: args } = parseArgs({ options: { out: { type: 'string' } } });
if (!args.out) throw new Error('Укажите --out <путь к stats.json>');
const out = path.resolve(args.out);

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.log(`${url}: ${(e as Error).message}`);
    return null;
  }
}

async function main(): Promise<string> {
  const token = process.env['GITHUB_TOKEN'];
  const [files, releases] = await Promise.all([
    getJson<JsdelivrFiles>(JSDELIVR),
    getJson<GithubReleases>(RELEASES, token ? { authorization: `Bearer ${token}` } : {}),
  ]);
  const prev = await readFile(out, 'utf8')
    .then((t) => StatsSchema.parse(JSON.parse(t)))
    .catch(() => null);
  if (!files && !releases && prev) return 'jsDelivr и GitHub недоступны — stats.json не меняется';

  const now = new Date();
  // запросов stats.json ещё нет в статистике — остаётся прошлое число (или 0)
  const players = (files && computeStats(files, now)) ?? {
    players: prev?.players ?? 0,
    days: prev?.days ?? 0,
  };
  const downloads = releases ? sumDownloads(releases) : prev?.downloads;
  const next: Stats = {
    players: players.players,
    days: players.days,
    ...(downloads !== undefined ? { downloads } : {}),
    updatedAt: now.toISOString(),
  };
  const summary = `≈ ${next.players} игроков за ${next.days} дн., скачиваний ${next.downloads ?? '—'}`;
  if (
    prev &&
    prev.players === next.players &&
    prev.days === next.days &&
    prev.downloads === next.downloads
  )
    return `Без изменений: ${summary}`;
  await writeFile(out, JSON.stringify(StatsSchema.parse(next)));
  return `stats.json: ${summary} → ${out}`;
}

console.log(await main());
