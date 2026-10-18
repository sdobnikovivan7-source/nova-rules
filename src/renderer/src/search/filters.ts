/** Фильтры выдачи (категория, наказание, «только важное») и группировка по документам */
import type { PunishKind } from '@shared/schema';
import type { Hit } from './engine';

export type PunishFilter =
  | 'any'
  | 'ban'
  | 'warn'
  | 'jail'
  | 'demorgan'
  | 'mute'
  | 'kick'
  | 'blacklist'
  | 'reprimand'
  | 'removal'
  | 'other'
  | 'none';

export const PUNISH_FILTERS: readonly { value: PunishFilter; label: string }[] = [
  { value: 'any', label: 'любое' },
  { value: 'ban', label: 'Ban' },
  { value: 'warn', label: 'WARN' },
  { value: 'jail', label: 'Jail' },
  { value: 'demorgan', label: 'Demorgan' },
  { value: 'mute', label: 'Mute' },
  { value: 'kick', label: 'Kick' },
  { value: 'blacklist', label: 'Blacklist' },
  { value: 'reprimand', label: 'Выговор' },
  { value: 'removal', label: 'Снятие с поста' },
  { value: 'other', label: 'Другое' },
  { value: 'none', label: 'Без наказания' },
];

const OTHER: readonly PunishKind[] = ['territory', 'leaderWarn', 'cancel', 'restriction', 'other'];

export type Filters = { category: string | null; punish: PunishFilter; importantOnly: boolean };

export const NO_FILTERS: Filters = { category: null, punish: 'any', importantOnly: false };

function punishMatches(kinds: readonly PunishKind[], f: PunishFilter): boolean {
  if (f === 'any') return true;
  if (f === 'none') return kinds.length === 0;
  if (f === 'other') return kinds.some((k) => OTHER.includes(k));
  return kinds.includes(f);
}

/** Всё, кроме категории: по ним считаются счётчики чипов категорий */
const passesNonCategory = (h: Hit, f: Filters) =>
  punishMatches(h.row.punishKinds, f.punish) && (!f.importantOnly || h.row.important);

export function applyFilters(hits: readonly Hit[], f: Filters): Hit[] {
  return hits.filter(
    (h) => passesNonCategory(h, f) && (!f.category || h.row.categoryId === f.category),
  );
}

/** Сколько пунктов в каждой категории при текущих фильтрах наказания и важности */
export function countByCategory(hits: readonly Hit[], f: Filters): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of hits) {
    if (passesNonCategory(h, f)) m.set(h.row.categoryId, (m.get(h.row.categoryId) ?? 0) + 1);
  }
  return m;
}

export type HitGroup = { docId: number; docTitle: string; categoryId: string; hits: Hit[] };

/** Группы по документу: группы — по лучшему совпадению, пункты внутри — в порядке документа */
export function groupByDoc(hits: readonly Hit[]): HitGroup[] {
  const groups = new Map<number, HitGroup & { best: number }>();
  for (const h of hits) {
    let g = groups.get(h.row.docId);
    if (!g) {
      g = {
        docId: h.row.docId,
        docTitle: h.row.docTitle,
        categoryId: h.row.categoryId,
        hits: [],
        best: 0,
      };
      groups.set(h.row.docId, g);
    }
    g.hits.push(h);
    g.best = Math.max(g.best, h.score);
  }
  return [...groups.values()]
    .sort((a, b) => b.best - a.best)
    .map(({ best, ...g }) => {
      void best;
      return { ...g, hits: g.hits.sort((a, b) => a.order - b.order) };
    });
}
