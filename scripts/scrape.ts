/**
 * CLI сборщика.
 *
 *   pnpm scrape --out out/data                    — с форума, первый прогон
 *   pnpm scrape --prev prev/data --out out/data   — с прошлой версией: diff, защита от поломки
 *   pnpm scrape --offline --out out/data          — из test/fixtures, без сети
 *   pnpm scrape --from <dir> --prev ... --out ... — из папки со страницами, сохранёнными вручную
 *                                                   (та же раскладка, что у test/fixtures)
 *
 * Код выхода 1, если есть предупреждения (в GitHub Actions это письмо владельцу).
 * Данные при этом всё равно записываются: сломанные темы заменены прошлой версией.
 * Код 2 и никакой записи — форум закрыт антибот-проверкой или не получено ни одной темы.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  OverridesSchema,
  type RuleDoc,
  RuleDocSchema,
  SourcesConfigSchema,
} from '../src/shared/schema';
import { runScrape, type ScrapeResult } from '../src/scraper';
import { BlockedError } from '../src/scraper/http';
import { diffDocs, mergeChanges } from '../src/scraper/diff';
import { fixtureFetcher } from '../src/scraper/offline';
import { readPrevMeta, writeData } from '../src/scraper/output';

const root = path.resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    prev: { type: 'string' },
    out: { type: 'string', default: 'out/data' },
    offline: { type: 'boolean', default: false },
    from: { type: 'string' },
    quiet: { type: 'boolean', default: false },
  },
});

async function readPrevDocs(dir: string | undefined): Promise<Map<number, RuleDoc>> {
  const docs = new Map<number, RuleDoc>();
  if (!dir) return docs;
  let files: string[];
  try {
    files = await readdir(path.resolve(dir, 'docs'));
  } catch {
    console.log(`Прошлой версии нет (${dir}) — первый прогон`);
    return docs;
  }
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(await readFile(path.resolve(dir, 'docs', f), 'utf8'));
    const parsed = RuleDocSchema.safeParse(raw);
    if (parsed.success) docs.set(parsed.data.id, parsed.data);
    else console.warn(`Прошлая версия ${f} не читается — пропущена`);
  }
  return docs;
}

const sources = SourcesConfigSchema.parse(
  JSON.parse(await readFile(path.join(root, 'config', 'sources.json'), 'utf8')),
);
const overrides = OverridesSchema.parse(
  JSON.parse(await readFile(path.join(root, 'config', 'overrides.json'), 'utf8')),
);
const prevDocs = await readPrevDocs(args.prev);
const prevMeta = args.prev ? await readPrevMeta(path.resolve(args.prev)) : { changes: [] };
const started = new Date();

async function scrape(): Promise<ScrapeResult | null> {
  try {
    return await runScrape({
      sources,
      prev: { docs: prevDocs },
      overrides,
      fetchText: args.from
        ? fixtureFetcher(path.resolve(args.from))
        : args.offline
          ? fixtureFetcher(path.join(root, 'test', 'fixtures'))
          : undefined,
      log: args.quiet ? undefined : (m) => console.log(m),
    });
  } catch (e) {
    if (!(e instanceof BlockedError)) throw e;
    console.error(`\n${e.message}\nДанные не записаны — остаётся прошлая версия.`);
    return null;
  }
}

async function publish(result: ScrapeResult) {
  const fresh = diffDocs(prevDocs, result.docs, started.toISOString());
  const out = path.resolve(args.out);
  const { manifest, changed } = await writeData(out, {
    categories: result.categories,
    docs: result.docs,
    changes: mergeChanges(prevMeta.changes, fresh, started),
    synonyms: await readFile(path.join(root, 'config', 'synonyms.json'), 'utf8'),
    officialNotes: result.officialNotes,
    warnings: result.warnings,
    prevManifest: prevMeta.manifest,
    now: started,
  });

  const rules = result.docs.reduce(
    (n, d) => n + d.sections.reduce((m, s) => m + s.rules.length, 0),
    0,
  );
  const byType = fresh.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }),
    {},
  );
  console.log(
    `\nГотово за ${((Date.now() - started.getTime()) / 1000).toFixed(0)} с: тем ${result.stats.threads}, ` +
      `разобрано ${result.stats.fetched}, из прошлой версии ${result.stats.reused}, пунктов ${rules}, ` +
      `запросов ${result.stats.requests}.\n` +
      `Данные ${changed ? `изменились → версия ${manifest.version}` : `без изменений (версия ${manifest.version})`}` +
      `${fresh.length ? `, новых записей в ленте: ${fresh.length} ${JSON.stringify(byType)}` : ''} → ${out}`,
  );
  if (result.warnings.length) {
    console.error(
      `\nПредупреждения (${result.warnings.length}):\n- ${result.warnings.join('\n- ')}`,
    );
    process.exitCode = 1;
  }
}

// process.exit() на Windows роняет Node при незакрытых сокетах fetch — только exitCode
const result = await scrape();
if (!result) process.exitCode = 2;
else if (!result.docs.length) {
  console.error(
    `\nНи одной темы не получено — данные не записаны.\n- ${result.warnings.join('\n- ')}`,
  );
  process.exitCode = 2;
} else await publish(result);
