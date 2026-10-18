/**
 * «Было / Стало» (§7.9): две колонки с пословной подсветкой для изменённого пункта,
 * одна колонка для добавленного (всё — вставка) и удалённого (всё — удаление).
 */
import { diffWords } from 'diff';
import { memo, type ReactNode } from 'react';
import type { ChangeEntry } from '@shared/schema';

/** Без сегментатора diffWords считает буквами только латиницу и режет русские слова по буквам */
const WORDS = new Intl.Segmenter('ru', { granularity: 'word' });

function Column({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'before' | 'after';
  children: ReactNode;
}) {
  return (
    <div className={`diff-col diff-${tone}`}>
      <span className="diff-label">{label}</span>
      <p className="diff-text selectable">{children}</p>
    </div>
  );
}

export const DiffView = memo(function DiffView({
  type,
  before,
  after,
}: Pick<ChangeEntry, 'type' | 'before' | 'after'>) {
  if (type === 'changed' && before !== undefined && after !== undefined) {
    const parts = diffWords(before, after, { intlSegmenter: WORDS });
    return (
      <div className="diff diff-2">
        <Column label="Было" tone="before">
          {parts.map((p, i) =>
            p.added ? null : p.removed ? (
              <del key={i}>{p.value}</del>
            ) : (
              <span key={i}>{p.value}</span>
            ),
          )}
        </Column>
        <Column label="Стало" tone="after">
          {parts.map((p, i) =>
            p.removed ? null : p.added ? (
              <ins key={i}>{p.value}</ins>
            ) : (
              <span key={i}>{p.value}</span>
            ),
          )}
        </Column>
      </div>
    );
  }
  if (after !== undefined) {
    return (
      <div className="diff">
        <Column label="Стало" tone="after">
          <ins>{after}</ins>
        </Column>
      </div>
    );
  }
  if (before !== undefined) {
    return (
      <div className="diff">
        <Column label="Было" tone="before">
          <del>{before}</del>
        </Column>
      </div>
    );
  }
  return null;
});
