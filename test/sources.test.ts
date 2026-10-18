import { describe, expect, it } from 'vitest';
import { parseForumList } from '../src/scraper/sources/forumList';
import { parseRss } from '../src/scraper/sources/rss';
import { fixture } from './helpers';

describe('parseForumList', () => {
  it('разбирает список тем раздела', () => {
    const page = parseForumList(fixture('lists/896-p1.html'));
    expect(page.lastPage).toBe(1);
    expect(page.threads.map((t) => t.id)).toContain(406244);
    const t = page.threads.find((x) => x.id === 406244)!;
    expect(t.title).toBe('Правила криминальных организаций');
    expect(t.important).toBe(true);
    expect(t.createdAt).toMatch(/^2025-12-06T/);
  });

  it('видит вторую страницу мероприятий', () => {
    const p1 = parseForumList(fixture('lists/1243-p1.html'));
    const p2 = parseForumList(fixture('lists/1243-p2.html'));
    expect(p1.lastPage).toBe(2);
    expect(p1.threads.length + p2.threads.length).toBe(22);
    const ids = new Set([...p1.threads, ...p2.threads].map((t) => t.id));
    expect(ids.size).toBe(22);
  });
});

describe('parseRss', () => {
  it('разбирает RSS', () => {
    const items = parseRss(fixture('rss/896.xml'));
    expect(items).toHaveLength(5);
    const first = items.find((i) => i.id === 406244)!;
    expect(first.title).toBe('Правила криминальных организаций');
    expect(first.author).toBe('Jonny Makalister');
    expect(first.url).toBe('https://forum.grand-rp.su/threads/406244/');
    expect(first.pubDate).toBe('2026-08-25T14:17:39.000Z');
  });

  it('RSS мероприятий обрезан до 20', () => {
    expect(parseRss(fixture('rss/1243.xml'))).toHaveLength(20);
  });
});
