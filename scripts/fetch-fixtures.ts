/**
 * Скачивает с форума RSS, списки тем и сами темы правил в test/fixtures/.
 * Одноразовый инструмент разведки: вежливые паузы, честный User-Agent.
 *
 *   pnpm fixtures            — всё
 *   pnpm fixtures --only 896 — один раздел
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

type Category = { id: string; forumId?: number; threadIds?: number[] };
type Sources = { baseUrl: string; userAgent: string; categories: Category[] };

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'test', 'fixtures');
const sources: Sources = JSON.parse(await readFile(path.join(root, 'config', 'sources.json'), 'utf8'));
const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;

const PAUSE_MS = 1500;
let lastRequest = 0;

async function get(url: string): Promise<string> {
  const wait = lastRequest + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': sources.userAgent } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function save(rel: string, body: string) {
  const file = path.join(outDir, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

function lastPage($: cheerio.CheerioAPI): number {
  const pages = $('.pageNav-page a')
    .map((_, a) => Number($(a).text().trim()))
    .get()
    .filter(Number.isFinite);
  return pages.length ? Math.max(...pages) : 1;
}

type ThreadRef = { id: number; categoryId: string; title: string };
const threads = new Map<number, ThreadRef>();

for (const cat of sources.categories) {
  if (only && cat.forumId !== only) continue;

  if (cat.forumId) {
    const rss = await get(`${sources.baseUrl}/forums/${cat.forumId}/index.rss`);
    await save(`rss/${cat.forumId}.xml`, rss);

    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const suffix = page === 1 ? '' : `page-${page}`;
      const html = await get(`${sources.baseUrl}/forums/${cat.forumId}/${suffix}`);
      await save(`lists/${cat.forumId}-p${page}.html`, html);
      const $ = cheerio.load(html);
      if (page === 1) pages = lastPage($);
      $('.structItem--thread').each((_, el) => {
        const cls = $(el).attr('class') ?? '';
        const id = Number(/js-threadListItem-(\d+)/.exec(cls)?.[1]);
        if (!id) return;
        const title = $(el).find('.structItem-title a[href^="/threads/"]').last().text().trim();
        threads.set(id, { id, categoryId: cat.id, title });
      });
    }
  }

  for (const id of cat.threadIds ?? []) threads.set(id, { id, categoryId: cat.id, title: '' });
}

const index: (ThreadRef & { pages: number })[] = [];
for (const t of threads.values()) {
  const html = await get(`${sources.baseUrl}/threads/${t.id}/`);
  await save(`threads/${t.id}.html`, html);
  const $ = cheerio.load(html);
  const pages = lastPage($);
  if (!t.title) t.title = $('h1.p-title-value').text().trim();
  // длинные правила иногда продолжаются на 2-й странице постами автора
  if (pages > 1) await save(`threads/${t.id}-p2.html`, await get(`${sources.baseUrl}/threads/${t.id}/page-2`));
  index.push({ ...t, pages });
  console.log(`${t.categoryId}\t${t.id}\t${pages}p\t${t.title}`);
}

await save('index.json', JSON.stringify({ fetchedAt: new Date().toISOString(), threads: index }, null, 2) + '\n');
console.log(`Готово: ${index.length} тем`);
