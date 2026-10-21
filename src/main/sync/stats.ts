/**
 * Примерное число игроков (этап 12): data/stats.json — раз в календарный день, после
 * успешной синхронизации. jsDelivr считает запросы файла, по ним stats.yml и считает число,
 * поэтому запрос строго один в день: повтор только если ни один источник не ответил.
 * Ошибки не влияют на синхронизацию и не показываются. Без Electron — тестируется в vitest.
 */
import { type Stats, StatsSchema } from '@shared/schema';
import type { Db } from '../db';
import { getMeta, setMeta } from '../db/repo';
import type { Fetcher } from './central';

export type StatsOptions = {
  db: Db;
  fetch: Fetcher;
  bases: string[];
  now?: Date;
  timeoutMs?: number;
  log?: (msg: string) => void;
};

/** Календарный день по местному времени: «сегодня уже спрашивали» */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** → новые данные, если сегодня ещё не запрашивали и источник ответил; иначе null */
export async function fetchStatsDaily(opts: StatsOptions): Promise<Stats | null> {
  const { db, fetch, bases, now = new Date(), timeoutMs = 15_000, log } = opts;
  const today = localDay(now);
  if (getMeta(db, 'stats_fetched_on') === today) return null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/stats.json`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stats = StatsSchema.parse(JSON.parse(await res.text()));
      setMeta(db, 'stats_json', JSON.stringify(stats));
      setMeta(db, 'stats_fetched_on', today);
      return stats;
    } catch (e) {
      log?.(`stats: ${base}: ${(e as Error).message}`);
    }
  }
  return null;
}
