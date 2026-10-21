/**
 * Оценка числа игроков по статистике jsDelivr (этап 12). Каждое приложение запрашивает
 * data/stats.json один раз за календарный день, поэтому запросы этого файла за день ≈ игроки,
 * открывавшие программу в этот день. Берётся среднее за последние полные дни.
 */
import type { Stats } from '@shared/schema';

export const STATS_FILE = '/data/stats.json';
/** За сколько дней усреднять */
export const WINDOW_DAYS = 7;
/** jsDelivr публикует статистику с задержкой: сегодня и вчера ещё не досчитаны */
export const LAG_DAYS = 2;

/** Ответ data.jsdelivr.com/v1/stats/packages/gh/<owner>/<repo>@<branch>/files */
export type JsdelivrFiles = { name: string; hits: { dates: Record<string, number> } }[];

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Ответ api.github.com/repos/<owner>/<repo>/releases — нужные поля */
export type GithubReleases = {
  draft: boolean;
  assets: { name: string; download_count: number }[];
}[];

/** Скачивания установщика во всех опубликованных релизах (.blockmap и latest.yml не считаются) */
export function sumDownloads(releases: GithubReleases): number {
  return releases
    .filter((r) => !r.draft)
    .flatMap((r) => r.assets)
    .filter((a) => a.name.endsWith('.exe'))
    .reduce((n, a) => n + a.download_count, 0);
}

/** null — статистики по файлу ещё нет (никто не запрашивал) */
export function computeStats(files: JsdelivrFiles, now: Date): Stats | null {
  const dates = files.find((f) => f.name === STATS_FILE)?.hits.dates;
  if (!dates) return null;
  const last = new Date(now.getTime() - LAG_DAYS * 86_400_000);
  // дни окна — от самого раннего к последнему досчитанному; до первого запроса не считаем
  const window: number[] = [];
  for (let i = WINDOW_DAYS; i >= 1; i--) {
    const key = day(new Date(last.getTime() - (i - 1) * 86_400_000));
    if (key in dates) window.push(dates[key]!);
  }
  const first = window.findIndex((n) => n > 0);
  if (first < 0) return { players: 0, days: 0, updatedAt: now.toISOString() };
  const used = window.slice(first);
  const players = Math.round(used.reduce((a, b) => a + b, 0) / used.length);
  return { players, days: used.length, updatedAt: now.toISOString() };
}
