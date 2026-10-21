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

export { CHANGES, count, DOCS, plural, PLAYERS, RULES } from '@shared/plural';
/** «в 1 документе», «в 3 документах» */
export const DOCS_IN = ['документе', 'документах', 'документах'] as const;
export const CHANGES_NEW = ['новое', 'новых', 'новых'] as const;

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

/** «сегодня в 06:12», «вчера в 23:40», «14.10.2026 в 06:12» */
export function fmtWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  const day = days === 0 ? 'сегодня' : days === 1 ? 'вчера' : fmtDay(iso);
  return `${day} в ${time}`;
}
