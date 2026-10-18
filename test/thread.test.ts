import { describe, expect, it } from 'vitest';
import { parseThread } from '../src/scraper/parse/thread';
import { fixture } from './helpers';

describe('parseThread', () => {
  it('берёт метаданные и первый пост', () => {
    const t = parseThread(fixture('threads/406244.html'), 406244);
    expect(t.title).toBe('Правила криминальных организаций');
    expect(t.important).toBe(true);
    expect(t.author).toBe('Jonny Makalister');
    expect(t.createdAt).toMatch(/^2025-12-06T/);
    expect(t.editedAt).toBeDefined();
    expect(t.html).toContain('Гетто');
  });

  it('последующие посты — журналы правок, не правила', () => {
    const t = parseThread(fixture('threads/406242.html'), 406242);
    expect(t.officialNotes).toHaveLength(3);
    expect(t.officialNotes[0]!.author).toBe('Velorium');
    expect(t.officialNotes[0]!.html).toContain('Редакция правил');
    expect(t.html).not.toContain('Редакция правил от 09.05.2026');
  });

  it('дата правки берётся из атрибута, а не из «Вчера в …»', () => {
    const t = parseThread(fixture('threads/406242.html'), 406242);
    expect(t.editedAt).toBe(new Date('2026-10-17T11:45:01+0300').toISOString());
  });

  it('тема без правок и без журналов', () => {
    const t = parseThread(fixture('threads/403002.html'), 403002);
    expect(t.title).toBe('Правила форума');
    expect(t.important).toBe(true);
    expect(t.officialNotes).toHaveLength(0);
    expect(t.editedAt).toBeUndefined();
  });

  it('все фикстуры разбираются', () => {
    const index = JSON.parse(fixture('index.json')) as { threads: { id: number }[] };
    for (const { id } of index.threads) {
      const t = parseThread(fixture(`threads/${id}.html`), id);
      expect(t.title, String(id)).not.toBe('');
      expect(t.html.length, String(id)).toBeGreaterThan(300);
      expect(t.createdAt, String(id)).not.toBe('');
    }
  });
});
