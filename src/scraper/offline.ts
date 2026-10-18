/**
 * Загрузчик страниц из сохранённых фикстур (test/fixtures) вместо форума.
 * Для тестов и `pnpm scrape --offline`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function fixtureFetcher(dir: string, overrides: Record<string, string> = {}) {
  return async (url: string): Promise<string> => {
    const p = new URL(url).pathname;
    if (overrides[p] !== undefined) return overrides[p]!;
    let rel: string | undefined;
    let m: RegExpExecArray | null;
    if ((m = /^\/forums\/(\d+)\/index\.rss$/.exec(p))) rel = `rss/${m[1]}.xml`;
    else if ((m = /^\/forums\/(\d+)\/(?:page-(\d+))?$/.exec(p))) rel = `lists/${m[1]}-p${m[2] ?? 1}.html`;
    else if ((m = /^\/threads\/(\d+)\/$/.exec(p))) rel = `threads/${m[1]}.html`;
    if (!rel) throw new Error(`нет фикстуры для ${url}`);
    return readFile(path.join(dir, rel), 'utf8');
  };
}
