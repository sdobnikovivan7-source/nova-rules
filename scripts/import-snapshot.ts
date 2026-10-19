/**
 * Распаковывает nova-snapshot.json (из scripts/browser-snapshot.js) в папку
 * с раскладкой test/fixtures — для `pnpm scrape --from <папка>`.
 *
 *   pnpm import-snapshot <nova-snapshot.json> [--out .cache/snapshot]
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string', default: '.cache/snapshot' } },
});
if (!positionals[0]) throw new Error('Укажите путь к nova-snapshot.json');

const snap: { fetchedAt: string; ids: number[]; files: Record<string, string> } = JSON.parse(
  await readFile(path.resolve(positionals[0]), 'utf8'),
);
const out = path.resolve(args.out);
await rm(out, { recursive: true, force: true });

for (const [rel, body] of Object.entries(snap.files)) {
  // только ожидаемые пути: rss/<n>.xml, lists/<n>-p<n>.html, threads/<n>.html
  if (!/^(rss\/\d+\.xml|lists\/\d+-p\d+\.html|threads\/\d+\.html)$/.test(rel)) {
    throw new Error(`неожиданный путь в снимке: ${rel}`);
  }
  const file = path.join(out, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
console.log(
  `Снимок от ${snap.fetchedAt}: ${Object.keys(snap.files).length} файлов, тем ${snap.ids.length} → ${out}`,
);
