/** Склонение после числа — и в интерфейсе, и в уведомлениях main */

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
