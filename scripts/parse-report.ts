/** Отчёт о качестве разбора всех тем из фикстур: pnpm parse-report */
import { readFileSync } from 'node:fs';
import { parseThread } from '../src/scraper/parse/thread';
import { linearize } from '../src/scraper/parse/clean';
import { buildStructure } from '../src/scraper/parse/structure';
const index = JSON.parse(readFileSync('test/fixtures/index.json', 'utf8')) as { threads: { id: number; categoryId: string }[] };
let tot = 0, totP = 0;
for (const { id, categoryId } of index.threads) {
  const t = parseThread(readFileSync(`test/fixtures/threads/${id}.html`, 'utf8'), id);
  const r = buildStructure(linearize(t.html, 'https://forum.grand-rp.su'), id);
  const rules = r.sections.flatMap((s) => s.rules);
  const pun = rules.filter((x) => x.punishment).length;
  const other = rules.filter((x) => x.punishment?.kind === 'other').length;
  const long = rules.filter((x) => x.text.length > 700).length;
  const pipes = rules.filter((x) => x.text.includes('|')).length;
  const dups = rules.filter((x) => x.id.includes('~')).length;
  const empty = r.sections.filter((s) => !s.rules.length && !s.intro).length;
  tot += rules.length; totP += pun;
  const flags = [long && `long=${long}`, pipes && `pipe=${pipes}`, dups && `dup=${dups}`, empty && `emptySec=${empty}`, other && `other=${other}`].filter(Boolean).join(' ');
  console.log(`${categoryId.padEnd(8)} ${id} sec=${String(r.sections.length).padStart(2)} rules=${String(rules.length).padStart(3)} num=${String(r.numbered).padStart(3)} pun=${String(pun).padStart(3)} ${r.paragraphMode ? 'PARA' : '    '} ${flags}  ${t.title.slice(0, 40)}`);
}
console.log('total rules', tot, 'with punishment', totP);
