/** Тег изменения (§2.6) */
import type { ChangeEntry } from '@shared/schema';

const TAGS: Record<ChangeEntry['type'], { label: string; tone: string }> = {
  changed: { label: 'Изменён', tone: 'changed' },
  added: { label: 'Добавлен', tone: 'added' },
  removed: { label: 'Удалён', tone: 'removed' },
  doc_added: { label: 'Новый документ', tone: 'doc' },
  doc_removed: { label: 'Документ удалён', tone: 'removed' },
};

export function Tag({ type, renumbered }: { type: ChangeEntry['type']; renumbered?: boolean }) {
  const t = TAGS[type];
  const label = type === 'changed' && renumbered ? 'Изменён и перенумерован' : t.label;
  return <span className={`tag tag-${t.tone}`}>{label}</span>;
}
