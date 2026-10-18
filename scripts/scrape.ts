/**
 * CLI сборщика.
 *
 *   pnpm scrape --out out/data                    — с форума
 *   pnpm scrape --prev prev/data --out out/data   — с прошлой версией (защита от поломки)
 *   pnpm scrape --offline --out out/data          — из test/fixtures, без сети
 *
 * Код выхода 1, если есть предупреждения (в GitHub Actions это письмо владельцу).
 * Запись manifest.json и changes.json — этап 2 (diff / output).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { type RuleDoc, RuleDocSchema, SourcesConfigSchema } from '../src/shared/schema';
import { runScrape } from '../src/scraper';
import { fixtureFetcher } from '../src/scraper/offline';

const root = path.resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    prev: { type: 'string' },
    out: { type: 'string', default: 'out/data' },
    offline: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
});

async function readPrev(dir: string | undefined): Promise<Map<number, RuleDoc>> {
  const docs = new Map<number, RuleDoc>();
  if (!dir) return docs;
  const docsDir = path.resolve(dir, 'docs');
  let files: string[];
  try {
    files = await readdir(docsDir);
  } catch {
    console.log(`Прошлой версии нет (${docsDir}) — первый прогон`);
    return docs;
  }
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const parsed = RuleDocSchema.safeParse(JSON.parse(await readFile(path.join(docsDir, f), 'utf8')));
    if (parsed.success) docs.set(parsed.data.id, parsed.data);
    else console.warn(`Прошлая версия ${f} не читается — пропущена`);
  }
  return docs;
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const sources = SourcesConfigSchema.parse(
  JSON.parse(await readFile(path.join(root, 'config', 'sources.json'), 'utf8')),
);
const prev = await readPrev(args.prev);
const started = Date.now();

const result = await runScrape({
  sources,
  prev: { docs: prev },
  fetchText: args.offline ? fixtureFetcher(path.join(root, 'test', 'fixtures')) : undefined,
  log: args.quiet ? undefined : (m) => console.log(m),
});

const out = path.resolve(args.out);
await rm(path.join(out, 'docs'), { recursive: true, force: true });
await mkdir(path.join(out, 'docs'), { recursive: true });
for (const doc of result.docs) await writeFile(path.join(out, 'docs', `${doc.id}.json`), json(doc));
await writeFile(path.join(out, 'categories.json'), json(result.categories));
await writeFile(path.join(out, 'official-notes.json'), json(result.officialNotes));
await writeFile(
  path.join(out, 'synonyms.json'),
  await readFile(path.join(root, 'config', 'synonyms.json'), 'utf8'),
);

const rules = result.docs.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.rules.length, 0), 0);
console.log(
  `\nГотово за ${((Date.now() - started) / 1000).toFixed(0)} с: тем ${result.stats.threads}, ` +
    `обновлено ${result.stats.fetched}, из прошлой версии ${result.stats.reused}, ` +
    `пунктов ${rules}, запросов ${result.stats.requests} → ${out}`,
);
if (result.warnings.length) {
  console.error(`\nПредупреждения (${result.warnings.length}):\n- ${result.warnings.join('\n- ')}`);
  process.exitCode = 1;
}
