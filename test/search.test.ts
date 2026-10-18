/** Поиск (§10.4) на реальных данных из resources/seed */
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { SearchRow } from '@shared/ipc';
import { readDataDir } from '../src/main/data';
import { openDb } from '../src/main/db';
import * as repo from '../src/main/db/repo';
import { matchRanges, readable, SearchEngine } from '../src/renderer/src/search/engine';
import {
  applyFilters,
  countByCategory,
  groupByDoc,
  NO_FILTERS,
} from '../src/renderer/src/search/filters';
import { processTerm } from '../src/renderer/src/search/stem';

let engine: SearchEngine;
let rows: SearchRow[];
let buildMs: number;

beforeAll(async () => {
  const db = openDb(':memory:');
  repo.applyData(db, await readDataDir(path.resolve(import.meta.dirname, '../resources/seed')));
  rows = repo.getSearchCorpus(db);
  const t0 = performance.now();
  engine = new SearchEngine(rows, repo.getSynonyms(db), repo.getCategories(db));
  buildMs = performance.now() - t0;
});

const run = (q: string) => engine.search(q);
const ids = (q: string) => run(q).hits.map((h) => h.row.id);

describe('токенайзер', () => {
  it('нижний регистр, ё → е, одна основа у форм слова', () => {
    expect(processTerm('Ограбление')).toBe(processTerm('ограбления'));
    expect(processTerm('зелёной')).toBe(processTerm('зеленой'));
    expect(processTerm('и')).toBeNull();
    expect(processTerm('DM')).toBe('dm');
  });
});

describe('поиск по словам', () => {
  it('индекс строится быстро', () => {
    expect(rows.length).toBeGreaterThan(1000);
    // §10.4: < 200 мс в приложении; в тестах запас на холодный JIT
    console.log(`индекс: ${rows.length} пунктов за ${Math.round(buildMs)} мс`);
    expect(buildMs).toBeLessThan(1000);
  });

  it('словоформы: ограбление / ограбления / ограбить находят одно и то же', () => {
    const a = ids('ограбление');
    expect(a).toContain('404708:1.8'); // «Ограбления должны проходить…»
    expect(ids('ограбления')).toEqual(a);
    expect(ids('ограбить')).toEqual(expect.arrayContaining(a));
    expect(run('ограбление').explain.forms).toBe(true);
  });

  it('опечатка находит то же слово и отмечается в пояснении', () => {
    const r = run('огрбление');
    expect(r.explain.typos).toBe(true);
    expect(r.hits.map((h) => h.row.id)).toContain('404708:1.8');
  });

  it('без опечатки нечёткий поиск не включается', () => {
    expect(run('ограбление').explain.typos).toBe(false);
  });

  it('сленг: дм → deathmatch, рк → возврат на место смерти', () => {
    const dm = run('дм');
    expect(dm.hits.map((h) => h.row.id)).toContain('406242:4.1');
    expect(dm.explain.synonyms.map((s) => s.shown)).toContain('deathmatch');
    expect(ids('рк')).toContain('402988:1.6');
  });

  it('синоним полностью — как в словаре, основа со * — словами из правил', () => {
    const capt = run('капт');
    expect(capt.explain.synonyms[0]?.shown).toBe('война за территорию');
    expect(readable('полици*', run('лспд').hits)).toMatch(/^полиц\S+$/);
    expect(readable('полици*', [])).toBe('полици');
  });

  it('несколько слов — все должны встретиться', () => {
    for (const h of run('зеленая зона оружие').hits) {
      const stems = h.terms;
      expect(stems.some((t) => t.startsWith('зелен'))).toBe(true);
      expect(stems.some((t) => t.startsWith('оруж'))).toBe(true);
    }
  });

  it('заголовок документа не тянет за собой все его пункты', () => {
    const war = rows.filter((r) => r.docTitle === 'Правила войны за территории').length;
    expect(war).toBeGreaterThan(50);
    expect(run('война').hits.length).toBeLessThan(war);
  });

  it('пустой запрос и одни стоп-слова не падают', () => {
    expect(run('').hits).toEqual([]);
    expect(run('   ').hits).toEqual([]);
    expect(() => run('и в на')).not.toThrow();
  });
});

describe('поиск по номеру', () => {
  it('«1.2» — точное совпадение номера во всех документах', () => {
    const r = run('1.2');
    expect(r.explain.mode).toBe('number');
    expect(r.hits.length).toBe(rows.filter((x) => x.number === '1.2').length);
    expect(r.hits.every((h) => h.row.number === '1.2')).toBe(true);
    expect(ids('1.2.')).toEqual(ids('1.2'));
  });

  it('«крайм 1.2» и «гос 1.1» — номер с категорией', () => {
    const r = run('крайм 1.2');
    expect(r.explain.scope).toBe('Криминальные');
    expect(r.hits.map((h) => h.row.id)).toContain('402991:1.2');
    expect(r.hits.every((h) => h.row.categoryId === 'crime' && h.row.number === '1.2')).toBe(true);
    expect(run('гос 1.1').hits.every((h) => h.row.categoryId === 'gov')).toBe(true);
    expect(run('криминальные 1.2').hits.length).toBe(r.hits.length);
  });

  it('несуществующий номер — обычный текстовый поиск', () => {
    expect(run('99.99').explain.mode).toBe('text');
  });
});

describe('фильтры и группировка', () => {
  it('фильтр наказания: всё, за что бан', () => {
    const hits = run('дм').hits;
    const ban = applyFilters(hits, { ...NO_FILTERS, punish: 'ban' });
    expect(ban.length).toBeGreaterThan(0);
    expect(ban.length).toBeLessThan(hits.length);
    expect(ban.every((h) => h.row.punishKinds.includes('ban'))).toBe(true);
    const none = applyFilters(hits, { ...NO_FILTERS, punish: 'none' });
    expect(none.every((h) => h.row.punishKinds.length === 0)).toBe(true);
  });

  it('категория и счётчики чипов', () => {
    const hits = run('ограбление').hits;
    const counts = countByCategory(hits, NO_FILTERS);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(hits.length);
    const events = applyFilters(hits, { ...NO_FILTERS, category: 'events' });
    expect(events.length).toBe(counts.get('events'));
  });

  it('«только важное»', () => {
    const hits = run('ограбление').hits;
    const imp = applyFilters(hits, { ...NO_FILTERS, importantOnly: true });
    expect(imp.every((h) => h.row.important)).toBe(true);
  });

  it('группы по документам, внутри — порядок документа', () => {
    const groups = groupByDoc(run('капт').hits);
    expect(new Set(groups.map((g) => g.docId)).size).toBe(groups.length);
    for (const g of groups) {
      const order = g.hits.map((h) => h.order);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

describe('подсветка', () => {
  it('подсвечиваются слова в любой форме', () => {
    const hit = run('капт').hits.find((h) => h.row.id === '402991:1.2')!;
    const ranges = matchRanges(hit.row.text, hit.terms);
    expect(ranges.map(([s, e]) => hit.row.text.slice(s, e))).toContain('Капты');
  });
});
