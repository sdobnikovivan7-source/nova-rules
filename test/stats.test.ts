/** Оценка числа игроков по статистике jsDelivr (этап 12) */
import { describe, expect, it } from 'vitest';
import { computeStats, type JsdelivrFiles, STATS_FILE } from '../src/scraper/stats';

const NOW = new Date('2026-10-21T04:30:00.000Z');

/** Дни до NOW: 0 — сегодня, 1 — вчера… → число запросов */
function files(byAgo: Record<number, number>, name = STATS_FILE): JsdelivrFiles {
  const dates: Record<string, number> = {};
  for (let ago = 0; ago < 30; ago++) {
    const d = new Date(NOW.getTime() - ago * 86_400_000).toISOString().slice(0, 10);
    dates[d] = byAgo[ago] ?? 0;
  }
  return [
    { name: '/data/manifest.json', hits: { dates } },
    { name, hits: { dates } },
  ];
}

describe('computeStats', () => {
  it('среднее за 7 полных дней; сегодня и вчера (ещё не досчитаны) не входят', () => {
    const s = computeStats(
      files({ 0: 900, 1: 500, 2: 100, 3: 120, 4: 80, 5: 100, 6: 110, 7: 90, 8: 100, 9: 5000 }),
      NOW,
    );
    expect(s).toEqual({ players: 100, days: 7, updatedAt: NOW.toISOString() });
  });

  it('файл начали запрашивать недавно — дни до первого запроса не считаются', () => {
    const s = computeStats(files({ 2: 30, 3: 10 }), NOW);
    expect(s).toMatchObject({ players: 20, days: 2 });
  });

  it('запросов ещё не было — 0 игроков', () => {
    expect(computeStats(files({}), NOW)).toMatchObject({ players: 0, days: 0 });
  });

  it('файла нет в статистике — null', () => {
    expect(computeStats(files({ 2: 10 }, '/data/other.json'), NOW)).toBeNull();
  });

  it('округление до целого', () => {
    expect(computeStats(files({ 2: 1, 3: 2 }), NOW)).toMatchObject({ players: 2, days: 2 });
  });
});
