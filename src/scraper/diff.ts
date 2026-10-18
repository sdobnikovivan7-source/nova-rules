/**
 * Сравнение двух версий правил → записи ленты «Что изменилось».
 *
 * Пункты сопоставляются в несколько шагов, чтобы вставка пункта в середину
 * не превращалась в каскад ложных «изменён»:
 *   1. одинаковое содержимое (hash) — пара; если сменился только номер, это не изменение;
 *   2. тот же id и похожий текст (Дайс ≥ 0.5) — «изменён»;
 *   3. остальные по похожести текста (Дайс ≥ 0.8) — «изменён» + renumbered;
 *   4. без пары — «удалён» / «добавлен».
 */
import type { ChangeEntry, Note, Rule, RuleDoc } from '@shared/schema';
import { sha1 } from './parse/structure';

export const CHANGES_RETENTION_DAYS = 180;
const SAME_ID_MIN = 0.5;
const RENUMBER_MIN = 0.8;

const NOTE_LABEL: Record<Note['type'], string> = {
  note: 'Примечание',
  exception: 'Исключение',
  example: 'Пример',
  clarification: 'Пояснение',
  addition: 'Дополнение',
};

/** Текст пункта для «было / стало»: текст | наказание + примечания */
export function ruleSummary(r: Rule): string {
  let s = r.text;
  if (r.punishment) s += ` | ${r.punishment.raw}`;
  for (const n of r.notes ?? []) s += `\n${NOTE_LABEL[n.type]}: ${n.text}`;
  return s;
}

function bigrams(s: string): Map<string, number> {
  const t = s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Коэффициент Дайса по символьным биграммам: 0…1 */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let total = 0;
  let common = 0;
  for (const n of A.values()) total += n;
  for (const [g, n] of B) {
    total += n;
    common += Math.min(n, A.get(g) ?? 0);
  }
  return total ? (2 * common) / total : 0;
}

const rulesOf = (d: RuleDoc) => d.sections.flatMap((s) => s.rules);

type Draft = Omit<ChangeEntry, 'id' | 'date' | 'docId' | 'docTitle' | 'categoryId'>;

export function diffRules(prev: Rule[], next: Rule[]): Draft[] {
  const out: Draft[] = [];
  const restPrev = new Set(prev);
  const restNext = new Set(next);
  const pair = (a: Rule, b: Rule) => {
    restPrev.delete(a);
    restNext.delete(b);
  };

  // 1. одинаковое содержимое; сначала с тем же id, потом с любым
  const nextById = new Map(next.map((r) => [r.id, r]));
  for (const a of prev) {
    const b = nextById.get(a.id);
    if (b && b.hash === a.hash) pair(a, b);
  }
  const nextByHash = new Map<string, Rule[]>();
  for (const b of restNext) nextByHash.set(b.hash, [...(nextByHash.get(b.hash) ?? []), b]);
  for (const a of [...restPrev]) {
    const b = nextByHash.get(a.hash)?.find((x) => restNext.has(x));
    if (b) pair(a, b);
  }

  // 2. тот же id, текст похож
  for (const a of [...restPrev]) {
    const b = nextById.get(a.id);
    if (!b || !restNext.has(b)) continue;
    const before = ruleSummary(a);
    const after = ruleSummary(b);
    if (dice(before, after) < SAME_ID_MIN) continue;
    pair(a, b);
    out.push({ type: 'changed', ruleId: b.id, ruleNumber: b.number ?? undefined, before, after });
  }

  // 3. перенумерованные: лучшие пары по похожести
  const candidates: { a: Rule; b: Rule; score: number }[] = [];
  for (const a of restPrev)
    for (const b of restNext) {
      const score = dice(ruleSummary(a), ruleSummary(b));
      if (score >= RENUMBER_MIN) candidates.push({ a, b, score });
    }
  candidates.sort((x, y) => y.score - x.score);
  for (const { a, b } of candidates) {
    if (!restPrev.has(a) || !restNext.has(b)) continue;
    pair(a, b);
    out.push({
      type: 'changed',
      ruleId: b.id,
      ruleNumber: b.number ?? undefined,
      before: ruleSummary(a),
      after: ruleSummary(b),
      renumbered: true,
    });
  }

  // 4. без пары
  for (const a of restPrev)
    out.push({ type: 'removed', ruleId: a.id, ruleNumber: a.number ?? undefined, before: ruleSummary(a) });
  for (const b of restNext)
    out.push({ type: 'added', ruleId: b.id, ruleNumber: b.number ?? undefined, after: ruleSummary(b) });

  // порядок — как пункты идут в документе
  const order = new Map([...prev, ...next].map((r, i) => [r.id, i]));
  return out.sort((x, y) => (order.get(x.ruleId!) ?? 0) - (order.get(y.ruleId!) ?? 0));
}

function changeId(e: Omit<ChangeEntry, 'id'>): string {
  return sha1([e.date.slice(0, 10), e.docId, e.type, e.ruleId ?? '', e.before ?? '', e.after ?? ''].join('\u0001')).slice(0, 16);
}

/**
 * Новые записи изменений между версиями. Пустой prev = первый прогон → изменений нет.
 */
export function diffDocs(prev: Map<number, RuleDoc>, next: RuleDoc[], date: string): ChangeEntry[] {
  if (!prev.size) return [];
  const drafts: Omit<ChangeEntry, 'id'>[] = [];
  const base = (d: RuleDoc) => ({ date, docId: d.id, docTitle: d.title, categoryId: d.categoryId });
  const nextIds = new Set(next.map((d) => d.id));

  for (const d of next) {
    const old = prev.get(d.id);
    if (!old) {
      drafts.push({ ...base(d), type: 'doc_added' });
      continue;
    }
    if (old.hash === d.hash) continue;
    for (const c of diffRules(rulesOf(old), rulesOf(d))) drafts.push({ ...base(d), ...c });
  }
  for (const old of prev.values()) if (!nextIds.has(old.id)) drafts.push({ ...base(old), type: 'doc_removed' });

  return drafts.map((e) => ({ id: changeId(e), ...e }));
}

/** Свежие изменения + старые, без дублей, не старше 180 дней, новые сверху */
export function mergeChanges(old: ChangeEntry[], fresh: ChangeEntry[], now: Date): ChangeEntry[] {
  const cutoff = now.getTime() - CHANGES_RETENTION_DAYS * 24 * 3600 * 1000;
  const seen = new Set<string>();
  return [...fresh, ...old]
    .filter((c) => new Date(c.date).getTime() >= cutoff)
    .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
    .sort((a, b) => b.date.localeCompare(a.date));
}
