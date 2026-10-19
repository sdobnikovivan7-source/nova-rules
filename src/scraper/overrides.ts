/**
 * Поправки к пунктам из config/overrides.json (см. RuleOverrideSchema).
 * Применяются к свежеразобранной теме до проверки схемы и diff — поэтому
 * правка попадает в ленту изменений как обычное изменение пункта.
 */
import type { Overrides, RuleDoc } from '@shared/schema';
import { docHash } from './parse/doc';
import { parsePunishment } from './parse/punishment';
import { ruleHash } from './parse/structure';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type OverrideReport = { applied: string[]; obsolete: string[]; warnings: string[] };

/** Изменяет doc на месте. obsolete — поправки, которые уже внесены в первый пост (их можно удалить). */
export function applyOverrides(doc: RuleDoc, overrides: Overrides | undefined): OverrideReport {
  const report: OverrideReport = { applied: [], obsolete: [], warnings: [] };
  const mine = overrides?.rules.filter((o) => o.id.startsWith(`${doc.id}:`)) ?? [];
  if (!mine.length) return report;

  for (const o of mine) {
    const rule = doc.sections.flatMap((s) => s.rules).find((r) => r.id === o.id);
    if (!rule) {
      report.warnings.push(`поправка ${o.id}: пункт не найден — не применена`);
      continue;
    }
    if (rule.text !== o.expect) {
      if (rule.text === o.text) report.obsolete.push(o.id);
      else
        report.warnings.push(`поправка ${o.id}: текст пункта на форуме изменился — не применена`);
      continue;
    }
    rule.text = o.text;
    rule.html = escapeHtml(o.text);
    if (o.punishment) {
      const p = parsePunishment(o.punishment);
      if (p) rule.punishment = p;
      else delete rule.punishment;
    }
    if (o.notes) {
      const notes = o.notes.map((n) => ({ type: n.type, html: escapeHtml(n.text), text: n.text }));
      if (notes.length) rule.notes = notes;
      else delete rule.notes;
    }
    rule.hash = ruleHash(rule.text, rule.punishment?.raw, rule.notes ?? []);
    report.applied.push(o.id);
  }
  if (report.applied.length) doc.hash = docHash(doc.title, doc.sections);
  return report;
}
