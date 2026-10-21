/** stats.json в приложении: раз в календарный день, ошибки не мешают (этап 12) */
import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/main/db';
import { getStats } from '../src/main/db/repo';
import { fetchStatsDaily, localDay } from '../src/main/sync/stats';

const CDN = 'https://cdn.test/data';
const MIRROR = 'https://mirror.test/data';
const STATS = { players: 120, days: 7, downloads: 54, updatedAt: '2026-10-21T04:37:00.000Z' };

function fetcher(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string) => {
    const r = routes[url];
    if (!r) throw new Error(`net::ERR_NAME_NOT_RESOLVED ${url}`);
    return r();
  });
}
const json =
  (v: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(v), { status });

describe('fetchStatsDaily', () => {
  it('первый раз за день — запрос и сохранение; второй раз в тот же день — без запроса', async () => {
    const db = openDb(':memory:');
    const fetch = fetcher({ [`${CDN}/stats.json`]: json(STATS) });
    const morning = new Date(2026, 9, 21, 9, 0);
    expect(await fetchStatsDaily({ db, fetch, bases: [CDN], now: morning })).toEqual(STATS);
    expect(getStats(db)).toEqual(STATS);
    expect(
      await fetchStatsDaily({ db, fetch, bases: [CDN], now: new Date(2026, 9, 21, 23, 59) }),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('новый день по местному времени — снова запрос', async () => {
    const db = openDb(':memory:');
    const fetch = fetcher({ [`${CDN}/stats.json`]: json(STATS) });
    await fetchStatsDaily({ db, fetch, bases: [CDN], now: new Date(2026, 9, 21, 23, 59) });
    await fetchStatsDaily({ db, fetch, bases: [CDN], now: new Date(2026, 9, 22, 0, 1) });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('сегодня уже получен ответ без скачиваний (1.0.4–1.0.5) — можно запросить ещё раз', async () => {
    const db = openDb(':memory:');
    const now = new Date(2026, 9, 21, 9, 0);
    const { downloads, ...old } = STATS;
    void downloads;
    await fetchStatsDaily({
      db,
      fetch: fetcher({ [`${CDN}/stats.json`]: json(old) }),
      bases: [CDN],
      now,
    });
    const fetch = fetcher({ [`${CDN}/stats.json`]: json(STATS) });
    expect(await fetchStatsDaily({ db, fetch, bases: [CDN], now })).toEqual(STATS);
    expect(await fetchStatsDaily({ db, fetch, bases: [CDN], now })).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('CDN недоступен — с зеркала', async () => {
    const db = openDb(':memory:');
    const fetch = fetcher({
      [`${CDN}/stats.json`]: json({}, 503),
      [`${MIRROR}/stats.json`]: json(STATS),
    });
    expect(await fetchStatsDaily({ db, fetch, bases: [CDN, MIRROR] })).toEqual(STATS);
  });

  it('битый ответ или нет сети — null, прошлое число остаётся, повтор в тот же день разрешён', async () => {
    const db = openDb(':memory:');
    const now = new Date(2026, 9, 21, 9, 0);
    await fetchStatsDaily({
      db,
      fetch: fetcher({ [`${CDN}/stats.json`]: json(STATS) }),
      bases: [CDN],
      now: new Date(2026, 9, 20),
    });
    expect(
      await fetchStatsDaily({
        db,
        fetch: fetcher({ [`${CDN}/stats.json`]: json({ players: -1 }) }),
        bases: [CDN],
        now,
      }),
    ).toBeNull();
    expect(await fetchStatsDaily({ db, fetch: fetcher({}), bases: [CDN], now })).toBeNull();
    expect(getStats(db)).toEqual(STATS);
    const ok = fetcher({ [`${CDN}/stats.json`]: json({ ...STATS, players: 130 }) });
    expect(await fetchStatsDaily({ db, fetch: ok, bases: [CDN], now })).toMatchObject({
      players: 130,
    });
  });

  it('localDay — местная дата', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
