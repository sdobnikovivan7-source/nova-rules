import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RuleDoc, SourcesConfig } from '@shared/schema';
import { SourcesConfigSchema } from '@shared/schema';
import { parseData, sha1 } from '../src/main/data';
import { migrate, openDb } from '../src/main/db';
import * as repo from '../src/main/db/repo';
import { formatRuleForCopy } from '../src/main/format';
import { isAllowedExternal } from '../src/main/urls';
import { runScrape, type ScrapeResult } from '../src/scraper';
import { fixtureFetcher } from '../src/scraper/offline';
import { buildManifest, serializeData } from '../src/scraper/output';
import { fixturesDir } from './helpers';

const sources: SourcesConfig = SourcesConfigSchema.parse(
  JSON.parse(readFileSync(path.resolve(fixturesDir, '../../config/sources.json'), 'utf8')),
);

let scraped: ScrapeResult;
beforeAll(async () => {
  scraped = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
});

const full = (docs: RuleDoc[] = scraped.docs): repo.DataInput => ({
  categories: scraped.categories,
  docs,
  changes: [],
  synonyms: { дм: ['deathmatch'] },
  meta: { version: 1, builtAt: '2026-10-18T03:07:00.000Z' },
});

function seeded() {
  const db = openDb(':memory:');
  repo.applyData(db, full());
  return db;
}

describe('db: миграции и запись', () => {
  it('миграции применяются один раз', () => {
    const db = openDb(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('документ после записи и чтения совпадает с исходным', () => {
    const db = seeded();
    for (const doc of scraped.docs) expect(repo.getDoc(db, doc.id)).toEqual(doc);
    expect(repo.getDataVersion(db)).toBe(1);
  });

  it('категории, документы, корпус поиска', () => {
    const db = seeded();
    const cats = repo.getCategories(db);
    expect(cats.map((c) => [c.id, c.docCount])).toEqual([
      ['general', 6],
      ['events', 22],
      ['crime', 5],
      ['gov', 3],
      ['families', 3],
      ['forum', 1],
    ]);
    const crime = repo.getDocs(db, 'crime');
    expect(crime.map((d) => d.id)).toEqual(
      scraped.categories.find((c) => c.id === 'crime')!.docIds,
    );
    expect(crime.every((d) => d.ruleCount > 0)).toBe(true);
    const corpus = repo.getSearchCorpus(db);
    expect(corpus).toHaveLength(1059);
    expect(corpus.some((r) => r.punishKinds.length > 1)).toBe(true);
    expect(repo.getSynonyms(db)).toEqual({ дм: ['deathmatch'] });
  });

  it('getRule: контекст и путь', () => {
    const db = seeded();
    const r = repo.getRule(db, '402991:1.2')!;
    expect(r.docTitle).toBe('Правила войны за территории');
    expect(r.path).toBe('Правила войны за территории › Общее положение');
    expect(r.punishment?.kind).toBe('territory');
    expect(repo.getRule(db, 'нет:такого')).toBeNull();
  });

  it('HTML повторно санитизируется перед записью', () => {
    const doc = structuredClone(scraped.docs[0]!);
    const rule = doc.sections[0]!.rules[0]!;
    rule.html =
      '<b>ok</b><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>';
    const db = openDb(':memory:');
    repo.applyData(db, full([doc]));
    const html = repo.getRule(db, rule.id)!.html;
    expect(html).toContain('<b>ok</b>');
    expect(html).not.toMatch(/script|onerror|javascript:/);
  });

  it('частичное обновление: замена документа, удаление исчезнувших', () => {
    const db = seeded();
    const [first, second] = scraped.docs;
    const changed = structuredClone(first!);
    changed.title = 'Новое название';
    repo.applyData(db, {
      ...full([changed]),
      allDocIds: scraped.docs.filter((d) => d.id !== second!.id).map((d) => d.id),
    });
    expect(repo.getDoc(db, first!.id)!.title).toBe('Новое название');
    expect(repo.getDoc(db, second!.id)).toBeNull();
    expect(repo.getRule(db, second!.sections[0]!.rules[0]!.id)).toBeNull();
    expect(repo.getSearchCorpus(db).length).toBeLessThan(1059);
  });

  it('избранное и просмотренные изменения переживают обновление данных', () => {
    const db = seeded();
    const changes = [
      {
        id: 'c1',
        date: '2026-10-17T03:00:00.000Z',
        docId: 402991,
        docTitle: 'x',
        categoryId: 'crime',
        type: 'changed' as const,
      },
      {
        id: 'c2',
        date: '2026-08-01T03:00:00.000Z',
        docId: 402991,
        docTitle: 'x',
        categoryId: 'crime',
        type: 'added' as const,
      },
    ];
    repo.applyData(db, { ...full(), changes });
    expect(repo.toggleFavorite(db, '402991:1.2')).toBe(true);
    repo.markChangesSeen(db, ['c1']);
    expect(repo.countUnseenChanges(db)).toBe(1);

    // новая версия: пункт 1.2 изменился
    const docs = structuredClone(scraped.docs);
    const r = docs
      .find((d) => d.id === 402991)!
      .sections[0]!.rules.find((x) => x.number === '1.2')!;
    r.text += ' (новая редакция)';
    r.hash = 'другой';
    repo.applyData(db, { ...full(docs), changes });

    const [fav] = repo.getFavorites(db);
    expect(fav).toMatchObject({ ruleId: '402991:1.2', changed: true });
    expect(fav!.snapshot).not.toContain('новая редакция');
    expect(repo.getChanges(db).map((c) => [c.id, c.seen])).toEqual([
      ['c1', true],
      ['c2', false],
    ]);
    expect(
      repo.getChanges(db, { days: 30 }, new Date('2026-10-18T12:00:00Z')).map((c) => c.id),
    ).toEqual(['c1']);
    repo.markChangesSeen(db);
    expect(repo.countUnseenChanges(db)).toBe(0);

    // пункт удалён — закладка остаётся со снимком
    repo.applyData(db, { ...full(scraped.docs.filter((d) => d.id !== 402991)), changes });
    expect(repo.getFavorites(db)[0]).toMatchObject({
      ruleId: '402991:1.2',
      rule: null,
      changed: false,
    });
    expect(repo.toggleFavorite(db, '402991:1.2')).toBe(false);
    expect(repo.getFavorites(db)).toEqual([]);
  });
});

describe('data: чтение опубликованных данных', () => {
  const files = () =>
    serializeData({
      categories: scraped.categories,
      docs: scraped.docs,
      changes: [],
      synonyms: '{"дм":"deathmatch"}',
      warnings: [],
      now: new Date('2026-10-18T03:07:00Z'),
    });

  it('манифест → DataInput', () => {
    const f = files();
    const { manifest } = buildManifest(f, {
      categories: [],
      docs: [],
      changes: [],
      synonyms: '{}',
      warnings: [],
      now: new Date(),
    });
    const data = parseData(manifest, f);
    expect(data.docs).toHaveLength(40);
    expect(data.allDocIds).toHaveLength(40);
    expect(data.synonyms).toEqual({ дм: ['deathmatch'] });
    expect(data.meta?.version).toBe(1);
  });

  it('несовпадение sha1 → ошибка', () => {
    const f = files();
    const { manifest } = buildManifest(f, {
      categories: [],
      docs: [],
      changes: [],
      synonyms: '{}',
      warnings: [],
      now: new Date(),
    });
    f.set('categories.json', f.get('categories.json')!.replace('Общие', 'Подмена'));
    expect(() => parseData(manifest, f)).toThrow(/sha1/);
    expect(sha1('a')).toHaveLength(40);
  });

  it('чужая schemaVersion → ошибка', () => {
    const f = files();
    const { manifest } = buildManifest(f, {
      categories: [],
      docs: [],
      changes: [],
      synonyms: '{}',
      warnings: [],
      now: new Date(),
    });
    expect(() => parseData({ ...manifest, schemaVersion: 99 }, f)).toThrow(/schemaVersion/);
  });
});

describe('main: копирование и ссылки', () => {
  it('формат пункта для жалобы (§10.6)', async () => {
    const db = seeded();
    expect(formatRuleForCopy(repo.getRule(db, '402991:1.2')!)).toBe(
      'Правила войны за территории, п. 1.2:\n' +
        'Капты разрешено забивать в Понедельник/Среда/Пятница/Воскресенье. | Возврат территории (если капт был сыгран).\n' +
        'https://forum.grand-rp.su/threads/402991/',
    );
  });

  it('белый список внешних ссылок', () => {
    expect(isAllowedExternal('https://forum.grand-rp.su/threads/402991/')).toBe(true);
    expect(
      isAllowedExternal('https://github.com/sdobnikovivan7-source/nova-rules/issues/new?title=x'),
    ).toBe(true);
    expect(isAllowedExternal('https://github.com/sdobnikovivan7-source/nova-rules-evil')).toBe(
      false,
    );
    expect(isAllowedExternal('https://github.com/other/repo')).toBe(false);
    expect(isAllowedExternal('http://forum.grand-rp.su/')).toBe(false);
    expect(isAllowedExternal('https://forum.grand-rp.su.evil.com/')).toBe(false);
    expect(isAllowedExternal('https://user@forum.grand-rp.su/')).toBe(false);
    expect(isAllowedExternal('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAllowedExternal('не ссылка')).toBe(false);
  });
});
