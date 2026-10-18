/**
 * RSS раздела XenForo → список тем. Дополнительная сверка к HTML-списку:
 * отдаёт не больше 20 записей, а pubDate ненадёжен (то создание, то правка).
 */
import { XMLParser } from 'fast-xml-parser';

export type RssItem = {
  id: number;
  title: string;
  url: string;
  author: string;
  /** pubDate из RSS, ISO (ненадёжен) */
  pubDate: string;
};

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });

export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: Record<string, unknown> | Record<string, unknown>[] } };
  };
  const raw = doc.rss?.channel?.item;
  const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];

  return items.flatMap((it) => {
    const url = String(it.link ?? '');
    const id = Number(it.guid ?? /\/threads\/(\d+)/.exec(url)?.[1]);
    if (!id) return [];
    const pub = new Date(String(it.pubDate ?? ''));
    return [
      {
        id,
        title: String(it.title ?? '').trim(),
        url,
        author: String(it['dc:creator'] ?? ''),
        pubDate: Number.isNaN(pub.getTime()) ? '' : pub.toISOString(),
      },
    ];
  });
}

export function rssUrl(baseUrl: string, forumId: number): string {
  return `${baseUrl}/forums/${forumId}/index.rss`;
}
