/**
 * Строка пункта (§7.2): номер моно в колонке 34px, текст, точка «изменён за 7 дней»,
 * бейдж наказания справа; отступ по `depth`. HTML пункта уже очищен в main (белый список).
 */
import type { Note, NoteType, Rule } from '@shared/schema';
import { memo, type MouseEvent, type ReactNode } from 'react';
import { PunishmentBadge } from './PunishmentBadge';
import { RichHtml } from './RichHtml';

export const NOTE_LABEL: Record<NoteType, string> = {
  note: 'Примечание',
  exception: 'Исключение',
  example: 'Пример',
  clarification: 'Пояснение',
  addition: 'Дополнение',
};

export function NoteBlock({ note, compact }: { note: Note; compact?: boolean }) {
  return (
    <div className={`note note-${note.type}${compact ? ' compact' : ''}`}>
      <span className="note-label">{NOTE_LABEL[note.type]}</span>
      {compact ? ': ' : null}
      <RichHtml html={note.html} inline={compact} />
    </div>
  );
}

type Props = {
  rule: Rule;
  selected: boolean;
  /** Пункт изменён за последние 7 дней */
  recent?: boolean;
  /** Вместо HTML пункта (например, текст с подсветкой совпадений в поиске) */
  body?: ReactNode;
  /** Строка под текстом (раздел — в поиске) */
  footer?: ReactNode;
  /** Показывать примечания под текстом */
  showNotes?: boolean;
  onSelect(rule: Rule): void;
  onContextMenu?(rule: Rule, e: MouseEvent): void;
};

export const RuleCard = memo(function RuleCard({
  rule,
  selected,
  recent,
  body,
  footer,
  showNotes = true,
  onSelect,
  onContextMenu,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={rule.number ? `Пункт ${rule.number}` : undefined}
      className={`rule-row${selected ? ' selected' : ''}`}
      style={rule.depth ? { marginLeft: rule.depth * 22 } : undefined}
      data-rule={rule.id}
      onClick={(e) => {
        // ссылки внутри текста открываются сами (на форуме), выделение текста не сбрасываем
        if ((e.target as HTMLElement).closest('a, summary')) return;
        if (window.getSelection()?.toString()) return;
        onSelect(rule);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(rule);
        }
      }}
      onContextMenu={onContextMenu && ((e) => onContextMenu(rule, e))}
    >
      <span className="rule-num mono">{rule.number ?? ''}</span>
      <div className="rule-body">
        <div className="rule-text selectable">{body ?? <RichHtml html={rule.html} />}</div>
        {showNotes && rule.notes?.map((n, i) => <NoteBlock key={i} note={n} compact />)}
        {footer}
      </div>
      {recent && <span className="rule-dot" title="Изменён за последние 7 дней" />}
      {rule.punishment && <PunishmentBadge punishment={rule.punishment} />}
    </div>
  );
});
