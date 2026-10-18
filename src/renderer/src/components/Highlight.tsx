/** Подсветка совпадений (§7.8): `ranges` — пары [начало, конец) в символах `text` */
import type { ReactNode } from 'react';

export type Range = readonly [start: number, end: number];

export function Highlight({ text, ranges }: { text: string; ranges: readonly Range[] }) {
  if (ranges.length === 0) return <>{text}</>;
  // сортировка и слияние пересекающихся диапазонов
  const merged: [number, number][] = [];
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([Math.max(0, s), Math.min(text.length, e)]);
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    if (e > s) out.push(<mark key={i}>{text.slice(s, e)}</mark>);
    pos = Math.max(pos, e);
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}
