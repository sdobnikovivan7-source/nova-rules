import type { RuleView } from '@shared/ipc';

/**
 * Пункт для жалобы (§10.6):
 *
 *   Правила криминальных организаций, п. 1.2:
 *   Капты разрешено забивать в … | Возврат территории
 *   https://forum.grand-rp.su/threads/402991/
 */
export function formatRuleForCopy(rule: RuleView): string {
  const head = rule.number ? `${rule.docTitle}, п. ${rule.number}:` : `${rule.docTitle}:`;
  const body = rule.punishment ? `${rule.text} | ${rule.punishment.raw}` : rule.text;
  return `${head}\n${body}\n${rule.docUrl}`;
}
