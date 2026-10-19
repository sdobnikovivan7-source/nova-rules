import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OverridesSchema, type RuleDoc, SourcesConfigSchema } from '@shared/schema';
import { runScrape } from '../src/scraper';
import { diffDocs } from '../src/scraper/diff';
import { fixtureFetcher } from '../src/scraper/offline';
import { applyOverrides } from '../src/scraper/overrides';
import { fixturesDir } from './helpers';

const root = path.resolve(fixturesDir, '../..');
const sources = SourcesConfigSchema.parse(
  JSON.parse(readFileSync(path.join(root, 'config/sources.json'), 'utf8')),
);

const docFrom = async (id: number) => {
  const r = await runScrape({
    sources: {
      ...sources,
      categories: [{ ...sources.categories[0]!, forumId: undefined, threadIds: [id] }],
    },
    fetchText: fixtureFetcher(fixturesDir),
  });
  return r.docs[0]!;
};
const rule = (doc: RuleDoc, id: string) =>
  doc.sections.flatMap((s) => s.rules).find((r) => r.id === id)!;

const override = {
  id: '406242:2.11',
  source: 'https://forum.grand-rp.su/threads/406242/post-1',
  expect:
    'Запрещено дарить игровое имущество(Бизнесы/дома/квартиры/автомобили) другому игроку без полноценной продажи.',
  text: 'Запрещено дарить игровое имущество(Бизнесы/дома/квартиры) другому игроку без полноценной продажи.',
};

describe('applyOverrides', () => {
  it('подменяет текст, пересчитывает хеши; diff видит изменение', async () => {
    const before = await docFrom(406242);
    const after = structuredClone(before);
    const r = applyOverrides(after, { rules: [{ ...override, punishment: 'BAN на 3 дня' }] });
    expect(r).toEqual({ applied: ['406242:2.11'], obsolete: [], warnings: [] });
    const ru = rule(after, '406242:2.11');
    expect(ru.text).toBe(override.text);
    expect(ru.punishment).toMatchObject({ kind: 'ban' });
    expect(ru.hash).not.toBe(rule(before, '406242:2.11').hash);
    expect(after.hash).not.toBe(before.hash);
    const changes = diffDocs(new Map([[before.id, before]]), [after], '2026-10-19T00:00:00Z');
    expect(changes.map((c) => [c.type, c.ruleId])).toEqual([['changed', '406242:2.11']]);
  });

  it('не применяется, если первый пост уже исправлен или текст другой', async () => {
    const doc = await docFrom(406242);
    const hash = doc.hash;
    const fixed = { ...override, expect: 'старый текст', text: rule(doc, '406242:2.11').text };
    expect(applyOverrides(doc, { rules: [fixed] }).obsolete).toEqual(['406242:2.11']);
    const other = { ...override, expect: 'старый текст' };
    expect(applyOverrides(doc, { rules: [other] }).warnings).toHaveLength(1);
    expect(
      applyOverrides(doc, { rules: [{ ...override, id: '406242:99.9' }] }).warnings,
    ).toHaveLength(1);
    expect(doc.hash).toBe(hash);
  });

  it('config/overrides.json проходит схему', () => {
    OverridesSchema.parse(
      JSON.parse(readFileSync(path.join(root, 'config/overrides.json'), 'utf8')),
    );
  });
});
