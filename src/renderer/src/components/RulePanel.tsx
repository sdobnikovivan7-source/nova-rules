/**
 * Правая панель пункта (§7.4): путь, «п. 1.2», текст, наказание, примечания,
 * ссылка на последнее изменение, кнопки «Скопировать для жалобы» / «В избранное» / «На форуме».
 */
import { Copy, ExternalLink, FileText, Star, X } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import type { ChangeView, RuleView } from '@shared/ipc';
import { copyRule } from '../actions';
import { api } from '../api';
import { fmtDay, stripSectionNumber } from '../format';
import { useApp } from '../store';
import { PunishmentBadge } from './PunishmentBadge';
import { RichHtml } from './RichHtml';
import { NoteBlock } from './RuleCard';
import { Button } from './ui';

type Props = {
  rule: RuleView;
  /** Последнее изменение пункта, если оно есть в ленте */
  change?: ChangeView | undefined;
  onClose(): void;
  /** В поиске вместо «В избранное / На форуме» — «Открыть в документе» */
  onOpenInDoc?: () => void;
  /** Подсветить совпадения поиска в тексте */
  highlight?: readonly string[] | undefined;
};

export function RulePanel({ rule, change, onClose, onOpenInDoc, highlight }: Props) {
  const favorite = useApp((s) => s.favoriteIds.has(rule.id));
  const toggleFavorite = useApp((s) => s.toggleFavorite);

  // Esc закрывает панель (если фокус не в поле ввода — там Esc очищает поле)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof HTMLInputElement) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="panel rule-panel" aria-label="Пункт правил">
      <div className="rule-panel-scroll">
        <div className="rule-panel-top">
          <p className="rule-path">
            {rule.docTitle}
            {rule.sectionTitle && (
              <>
                <br />
                {stripSectionNumber(rule.sectionTitle)}
              </>
            )}
          </p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Скрыть панель"
            title="Скрыть (Esc)"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {rule.number && <p className="rule-num-xl mono">п. {rule.number}</p>}
        <div className="rule-detail selectable">
          <RichHtml html={rule.html} highlight={highlight} />
        </div>

        {rule.punishment && (
          <div className="rule-punish">
            <span className="rule-label">Наказание</span>
            <PunishmentBadge punishment={rule.punishment} size="lg" />
          </div>
        )}

        {rule.notes?.map((n, i) => (
          <div key={i} className="note-card selectable">
            <NoteBlock note={n} />
          </div>
        ))}

        {change && (
          <Link className="rule-change-link" to={`/changes?focus=${encodeURIComponent(change.id)}`}>
            {changeVerb(change)} {fmtDay(change.date)} — посмотреть, что было
          </Link>
        )}
      </div>

      <div className="rule-actions">
        <Button variant="primary" icon={<Copy size={17} />} onClick={() => void copyRule(rule.id)}>
          Скопировать для жалобы
        </Button>
        {onOpenInDoc ? (
          <Button icon={<FileText size={16} />} onClick={onOpenInDoc}>
            Открыть в документе
          </Button>
        ) : (
          <div className="rule-actions-row">
            <Button
              icon={<Star size={16} fill={favorite ? 'currentColor' : 'none'} />}
              aria-pressed={favorite}
              className={favorite ? 'is-favorite' : undefined}
              onClick={() => void toggleFavorite(rule.id)}
            >
              {favorite ? 'В избранном' : 'В избранное'}
            </Button>
            <Button
              icon={<ExternalLink size={16} />}
              onClick={() => void api.openExternal(rule.docUrl)}
            >
              На форуме
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

const changeVerb = (c: ChangeView) =>
  c.type === 'added' ? 'Добавлен' : c.renumbered ? 'Изменён и перенумерован' : 'Изменён';
