/**
 * HTML темы → метаданные + первый пост.
 * Правила лежат только в первом посте. Остальные посты — журналы правок
 * администрации («Редакция правил от …», «Было / Стало»), они сохраняются
 * отдельно и в правила не попадают.
 */
import * as cheerio from 'cheerio';

export type OfficialNote = {
  author: string;
  date: string;
  /** Сырой HTML поста (очищается позже, если понадобится) */
  html: string;
};

export type ThreadPage = {
  id: number;
  title: string;
  important: boolean;
  author: string;
  createdAt: string;
  editedAt?: string;
  /** Сырой HTML первого поста (содержимое .bbWrapper) */
  html: string;
  officialNotes: OfficialNote[];
};

export class ThreadParseError extends Error {}

function isoOf(dt: string | undefined): string | undefined {
  if (!dt) return undefined;
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseThread(html: string, id: number): ThreadPage {
  const $ = cheerio.load(html);
  const h1 = $('h1.p-title-value').first();
  const labels = h1.find('.label').map((_, l) => $(l).text().trim().toLowerCase()).get();
  h1.find('.label, .label-append').remove();
  const title = h1.text().replace(/\s+/g, ' ').trim();

  const posts = $('article.message');
  const first = posts.first();
  const body = first.find('.message-body .bbWrapper').first();
  if (!first.length || !body.length) throw new ThreadParseError(`тема ${id}: не найден первый пост`);

  const createdAt = isoOf(first.find('.message-attribution-main time').first().attr('datetime')) ?? '';
  const editedAt = isoOf(first.find('.message-lastEdit time').first().attr('datetime'));

  const officialNotes: OfficialNote[] = posts
    .slice(1)
    .map((_, p) => ({
      author: $(p).attr('data-author') ?? '',
      date: isoOf($(p).find('.message-attribution-main time').first().attr('datetime')) ?? '',
      html: $(p).find('.message-body .bbWrapper').first().html() ?? '',
    }))
    .get();

  return {
    id,
    title,
    important: labels.includes('важно'),
    author: first.attr('data-author') ?? '',
    createdAt,
    editedAt,
    html: body.html() ?? '',
    officialNotes,
  };
}

export function threadUrl(baseUrl: string, id: number): string {
  return `${baseUrl}/threads/${id}/`;
}
