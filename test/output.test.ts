import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RuleDoc, SourcesConfig } from '@shared/schema';
import { ManifestSchema, SourcesConfigSchema } from '@shared/schema';
import { runScrape, type ScrapeResult } from '../src/scraper';
import { diffDocs, mergeChanges } from '../src/scraper/diff';
import { fixtureFetcher } from '../src/scraper/offline';
import { readPrevMeta, writeData } from '../src/scraper/output';
import { fixture, fixturesDir } from './helpers';

const root = path.resolve(fixturesDir, '../..');
let sources: SourcesConfig;
let synonyms: string;
let base: ScrapeResult;

beforeAll(async () => {
  sources = SourcesConfigSchema.parse(JSON.parse(await readFile(path.join(root, 'config/sources.json'), 'utf8')));
  synonyms = await readFile(path.join(root, 'config/synonyms.json'), 'utf8');
  base = await runScrape({ sources, fetchText: fixtureFetcher(fixturesDir) });
});

/** Один «ежедневный» прогон: prevDir → outDir */
async function day(prevDir: string | null, outDir: string, now: Date, overrides: Record<string, string> = {}) {
  const prevDocs = new Map<number, RuleDoc>();
  const meta = prevDir ? await readPrevMeta(prevDir) : { changes: [] };
  if (prevDir)
    for (const f of await readdir(path.join(prevDir, 'docs'))) {
      const d = JSON.parse(await readFile(path.join(prevDir, 'docs', f), 'utf8')) as RuleDoc;
      prevDocs.set(d.id, d);
    }
  const r = await runScrape({ sources, prev: { docs: prevDocs }, fetchText: fixtureFetcher(fixturesDir, overrides) });
  const fresh = diffDocs(prevDocs, r.docs, now.toISOString());
  const out = await writeData(outDir, {
    categories: r.categories,
    docs: r.docs,
    changes: mergeChanges(meta.changes, fresh, now),
    synonyms,
    officialNotes: r.officialNotes,
    warnings: r.warnings,
    prevManifest: meta.manifest,
    now,
  });
  return { ...out, fresh };
}

describe('writeData + ежедневный цикл', () => {
  it('первый прогон, повтор без изменений, затем правка пункта', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'nova-data-'));
    const d1 = path.join(tmp, 'd1');
    const d2 = path.join(tmp, 'd2');
    const d3 = path.join(tmp, 'd3');

    // день 1: первый прогон
    const r1 = await day(null, d1, new Date('2026-10-18T03:07:00Z'));
    expect(r1.changed).toBe(true);
    expect(r1.manifest.version).toBe(1);
    expect(r1.fresh).toEqual([]);
    expect(Object.keys(r1.manifest.files)).toHaveLength(43); // 40 docs + categories + changes + synonyms
    expect((await readdir(path.join(d1, 'docs'))).length).toBe(base.docs.length);

    // sha1 в манифесте совпадает с содержимым файлов
    const m1 = ManifestSchema.parse(JSON.parse(await readFile(path.join(d1, 'manifest.json'), 'utf8')));
    for (const [p, h] of Object.entries(m1.files)) {
      const body = await readFile(path.join(d1, p), 'utf8');
      expect(createHash('sha1').update(body).digest('hex'), p).toBe(h);
    }

    // день 2: ничего не поменялось — версия та же, builtAt тот же, checkedAt новый
    const r2 = await day(d1, d2, new Date('2026-10-19T03:07:00Z'));
    expect(r2.changed).toBe(false);
    expect(r2.manifest.version).toBe(1);
    expect(r2.manifest.builtAt).toBe(r1.manifest.builtAt);
    expect(r2.manifest.checkedAt).toBe('2026-10-19T03:07:00.000Z');
    expect(r2.manifest.files).toEqual(r1.manifest.files);

    // день 3: на форуме изменили наказание в 406244 п. 1.1
    const edited = fixture('threads/406244.html').replace('Письменный выговор лидеру.', 'WARN.');
    const r3 = await day(d2, d3, new Date('2026-10-20T03:07:00Z'), { '/threads/406244/': edited });
    expect(r3.changed).toBe(true);
    expect(r3.manifest.version).toBe(2);
    expect(r3.fresh).toEqual([
      expect.objectContaining({
        type: 'changed',
        docId: 406244,
        ruleId: '406244:1.1',
        before: expect.stringContaining('| Письменный выговор лидеру.'),
        after: expect.stringContaining('| WARN.'),
      }),
    ]);
    const changedFiles = Object.keys(r3.manifest.files).filter((p) => r3.manifest.files[p] !== r2.manifest.files[p]);
    expect(changedFiles.sort()).toEqual(['changes.json', 'docs/406244.json']);
    const changes = JSON.parse(await readFile(path.join(d3, 'changes.json'), 'utf8'));
    expect(changes).toHaveLength(1);
  });
});
