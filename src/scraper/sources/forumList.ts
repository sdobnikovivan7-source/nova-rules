/**
 * HTML-страница раздела XenForo → список тем и число страниц.
 * Основной источник списка тем: RSS обрезан до 20 записей.
 */
import * as cheerio from 'cheerio';

export type ThreadListItem = {
  id: number;
  title: string;
  important: boolean;
  author: string;
  /** Дата создания темы, ISO */
  createdAt?: string;
};

export type ForumListPage = {
  threads: ThreadListItem[];
  lastPage: number;
};

export function parseForumList(html: string): ForumListPage {
  const $ = cheerio.load(html);
  const threads: ThreadListItem[] = [];

  $('.structItem--thread').each((_, el) => {
    const item = $(el);
    const id = Number(/js-threadListItem-(\d+)/.exec(item.attr('class') ?? '')?.[1]);
    if (!id) return;
    const titleBox = item.find('.structItem-title');
    const link = titleBox.find('a[data-tp-primary]').first();
    const title = (link.length ? link : titleBox.find('a[href^="/threads/"]').last()).text().trim();
    const labels = titleBox.find('.label').map((_, l) => $(l).text().trim().toLowerCase()).get();
    threads.push({
      id,
      title,
      important: labels.includes('важно'),
      author: item.attr('data-author') ?? '',
      createdAt: item.find('.structItem-startDate time').attr('datetime') ?? undefined,
    });
  });

  return { threads, lastPage: lastPageOf($) };
}

export function lastPageOf($: cheerio.CheerioAPI): number {
  const pages = $('.pageNav-page a')
    .map((_, a) => Number($(a).text().trim()))
    .get()
    .filter((n) => Number.isFinite(n) && n > 0);
  return pages.length ? Math.max(...pages) : 1;
}

export function forumPageUrl(baseUrl: string, forumId: number, page: number): string {
  return `${baseUrl}/forums/${forumId}/${page > 1 ? `page-${page}` : ''}`;
}
