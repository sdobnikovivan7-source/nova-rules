/**
 * Снимок данных для первого запуска приложения (§7.4): data/ → resources/seed/.
 *
 *   pnpm seed                    — из out/data (результат `pnpm scrape`)
 *   pnpm seed --from prev/data   — из любого каталога с manifest.json
 *
 * Перед копированием данные проверяются так же, как в приложении: sha1 по манифесту + zod.
 * Пока форум закрыт антибот-проверкой: `pnpm scrape --offline --out out/data && pnpm seed`.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readDataDir } from '../src/main/data';

const root = path.resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({ options: { from: { type: 'string', default: 'out/data' } } });

const from = path.resolve(args.from);
const to = path.join(root, 'resources', 'seed');

const data = await readDataDir(from);
const manifest = JSON.parse(await readFile(path.join(from, 'manifest.json'), 'utf8')) as {
  files: Record<string, string>;
};

await rm(to, { recursive: true, force: true });
await mkdir(path.join(to, 'docs'), { recursive: true });
await writeFile(path.join(to, '.gitkeep'), '');
for (const name of ['manifest.json', ...Object.keys(manifest.files)])
  await copyFile(path.join(from, name), path.join(to, name));

const rules = data.docs.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.rules.length, 0), 0);
console.log(
  `Seed: версия ${data.meta!.version}, тем ${data.docs.length}, пунктов ${rules} → ${to}`,
);
