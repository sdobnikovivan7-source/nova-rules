/** Текст уведомления о новых изменениях (§10.8). Без Electron — тестируется в vitest. */
import { count, DOCS, RULES } from '@shared/plural';
import type { ChangeEntry } from '@shared/schema';

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function changesMessage(changes: ChangeEntry[]): { title: string; body: string } | null {
  if (!changes.length) return null;
  const docs = new Map<number, string>();
  for (const c of changes) docs.set(c.docId, c.docTitle);
  const rules = changes.filter((c) => c.ruleId).length;
  const newDocs = changes.filter((c) => c.type === 'doc_added');

  if (docs.size === 1) {
    const [title] = docs.values();
    if (newDocs.length) return { title: 'Новый документ в правилах', body: title! };
    if (changes.every((c) => c.type === 'doc_removed')) {
      return { title: 'Документ убран из правил', body: title! };
    }
    // «Правила криминальных организаций» → «Изменены правила криминальных организаций»
    const head = /^правила/i.test(title!) ? lcFirst(title!) : `правила «${title}»`;
    return { title: `Изменены ${head}`, body: count(rules, RULES) };
  }
  const parts = [count(docs.size, DOCS)];
  if (rules) parts.push(count(rules, RULES));
  return { title: 'Обновлены правила', body: parts.join(', ') };
}
