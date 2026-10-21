/**
 * Пересчёт data/stats.json (этап 12, .github/workflows/stats.yml).
 *
 *   pnpm stats --out <путь к data/stats.json>
 *
 * Ошибка API jsDelivr или нет статистики — файл не трогается (код 0: игроки увидят прошлое число).
 * Файла ещё нет — создаётся с нулём.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { StatsSchema } from '../src/shared/schema';
import { computeStats, type JsdelivrFiles } from '../src/scraper/stats';

const API =
  'https://data.jsdelivr.com/v1/stats/packages/gh/sdobnikovivan7-source/nova-rules@data/files?period=month';

const { values: args } = parseArgs({ options: { out: { type: 'string' } } });
if (!args.out) throw new Error('Укажите --out <путь к stats.json>');
const out = path.resolve(args.out);

async function main(): Promise<string> {
  let files: JsdelivrFiles;
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    files = (await res.json()) as JsdelivrFiles;
  } catch (e) {
    return `Статистика jsDelivr недоступна (${(e as Error).message}) — stats.json не меняется`;
  }

  const now = new Date();
  const prev = await readFile(out, 'utf8')
    .then((t) => StatsSchema.parse(JSON.parse(t)))
    .catch(() => null);
  // запросов ещё нет: файла нет на CDN — создаём с нулём, иначе его некому запрашивать
  const stats =
    computeStats(files, now) ??
    (prev ? null : { players: 0, days: 0, updatedAt: now.toISOString() });
  if (!stats) return 'Запросов stats.json ещё нет — stats.json не меняется';
  if (prev && prev.players === stats.players && prev.days === stats.days)
    return `Без изменений: ≈ ${stats.players} игроков за ${stats.days} дн.`;
  await writeFile(out, JSON.stringify(StatsSchema.parse(stats)));
  return `stats.json: ≈ ${stats.players} игроков за ${stats.days} дн. → ${out}`;
}

console.log(await main());
