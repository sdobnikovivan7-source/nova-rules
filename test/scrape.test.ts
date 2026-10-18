import { describe, expect, it } from 'vitest';
import type { RuleDoc, SourcesConfig } from '@shared/schema';
import { SourcesConfigSchema } from '@shared/schema';
import { runScrape } from '../src/scraper';
import { BlockedError, HttpError } from '../src/scraper/http';
import { fixtureFetcher } from '../src/scraper/offline';
import { fixture, fixturesDir } from './helpers';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sources: SourcesConfig = SourcesConfigSchema.parse(
  JSON.parse(readFileSync(path.resolve(fixturesDir, '../../config/sources.json'), 'utf8')),
);

describe('runScrape', () => {
  it('собирает все 40 тем из фикстур без предупреждений', async () => {
    const r = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
    expect(r.warnings).toEqual([]);
    expect(r.docs).toHaveLength(40);
    expect(r.stats).toMatchObject({ threads: 40, fetched: 40, reused: 0 });
    const byCat = Object.fromEntries(r.categories.map((c) => [c.id, c.docIds.length]));
    expect(byCat).toEqual({ general: 6, events: 22, crime: 5, gov: 3, families: 3, forum: 1 });
    expect(r.officialNotes[406242]).toHaveLength(3);
  });

  it('сломанная вёрстка темы → прошлая версия + предупреждение', async () => {
    const first = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
    const prev = { docs: new Map<number, RuleDoc>(first.docs.map((d) => [d.id, d])) };
    // форум «поменял вёрстку»: первый пост стал пустым
    const broken = fixture('threads/406244.html').replace(
      /(<div class="bbWrapper">)[\s\S]*?(<\/div>\s*<div class="js-selectToQuote)/,
      '$1Правила временно недоступны$2',
    );
    const r = await runScrape({
      sources,
      prev,
      fetchText: fixtureFetcher(fixturesDir, { '/threads/406244/': broken }),
    });
    expect(r.warnings.some((w) => w.includes('406244') && w.includes('поломку'))).toBe(true);
    expect(r.docs.find((d) => d.id === 406244)).toBe(prev.docs.get(406244));
    expect(r.stats.reused).toBe(1);
  });

  it('недоступная тема → прошлая версия', async () => {
    const first = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
    const prev = { docs: new Map<number, RuleDoc>(first.docs.map((d) => [d.id, d])) };
    const base = fixtureFetcher(fixturesDir);
    const r = await runScrape({
      sources,
      prev,
      fetchText: async (url) => {
        if (url.endsWith('/threads/402991/')) throw new Error('HTTP 502');
        return base(url);
      },
    });
    expect(r.docs).toHaveLength(40);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/402991.*HTTP 502.*прошлая версия/);
  });

  it('недоступный список раздела → документы раздела из прошлой версии', async () => {
    const first = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
    const prev = { docs: new Map<number, RuleDoc>(first.docs.map((d) => [d.id, d])) };
    const base = fixtureFetcher(fixturesDir);
    const r = await runScrape({
      sources,
      prev,
      fetchText: async (url) => {
        if (/\/forums\/896\/$/.test(url)) throw new Error('HTTP 503');
        return base(url);
      },
    });
    expect(r.docs).toHaveLength(40);
    expect(r.categories.find((c) => c.id === 'crime')!.docIds).toHaveLength(5);
    expect(r.warnings[0]).toMatch(/crime: не удалось получить список/);
  });

  it('пустой список раздела без прошлой версии → предупреждение, а не «0 тем»', async () => {
    const base = fixtureFetcher(fixturesDir);
    const r = await runScrape({
      sources,
      fetchText: async (url) => (url.includes('/forums/896/') ? '<html><body></body></html>' : base(url)),
    });
    expect(r.docs).toHaveLength(35);
    expect(r.warnings.some((w) => /crime: .*список тем пуст/.test(w))).toBe(true);
  });

  it('страница «Проверка браузера» → прогон прерывается BlockedError', async () => {
    const challenge =
      '<!doctype html><title>Checking your browser / Проверка браузера</title><div id="l7-config" hidden></div>';
    await expect(runScrape({ sources, fetchText: async () => challenge })).rejects.toBeInstanceOf(BlockedError);
  });

  it('401 от форума → BlockedError', async () => {
    const base = fixtureFetcher(fixturesDir);
    const r = runScrape({
      sources,
      fetchText: async (url) => {
        if (url.includes('/threads/402991/')) throw new HttpError(401, url);
        return base(url);
      },
    });
    await expect(r).rejects.toBeInstanceOf(BlockedError);
  });
});
