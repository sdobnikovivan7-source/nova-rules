/** Форматирование дат и чисел для интерфейса */

/** «18.10, 17:49» */
export const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

/** «14.10.2026» */
export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** plural(5, ['пункт', 'пункта', 'пунктов']) → «пунктов» */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «48 пунктов» */
export const count = (n: number, forms: readonly [string, string, string]) =>
  `${n} ${plural(n, forms)}`;

export const RULES = ['пункт', 'пункта', 'пунктов'] as const;
export const DOCS = ['документ', 'документа', 'документов'] as const;
export const CHANGES = ['изменение', 'изменения', 'изменений'] as const;

/** 'Control+Shift+Space' → 'Ctrl+Shift+Space' */
export const fmtHotkey = (accel: string) =>
  accel.replace(/\b(Control|CommandOrControl|CmdOrCtrl)\b/g, 'Ctrl');

/** «1. Общее положение» → «Общее положение», «Раздел 2. …» → «…» */
export const stripSectionNumber = (title: string) =>
  title.replace(/^\s*(?:раздел\s+)?\d+(?:\.\d+)*\.?\s*/i, '').replace(/:\s*$/, '') || title;

const DAY = 86_400_000;

/** Изменение моложе недели — точка «изменён» у пункта */
export const isRecent = (iso: string, days = 7, now = Date.now()) =>
  now - new Date(iso).getTime() < days * DAY;
