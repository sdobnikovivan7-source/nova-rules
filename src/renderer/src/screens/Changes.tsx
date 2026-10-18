/**
 * Изменения в правилах (макет «Изменения»): период 7 / 30 / 180 дней, группы по дням,
 * карточки с тегом и «было / стало», справа — сводка по категориям за период.
 *
 * «Новое» — то, что не было просмотрено до открытия экрана; пометка держится, пока экран
 * открыт, а при уходе с него показанные записи отмечаются просмотренными.
 * `?focus=<id>` — прокрутить к записи (ссылка из панели пункта).
 */
import { Check, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { type ChangeView, threadUrl } from '@shared/ipc';
import { api } from '../api';
import { DiffView } from '../components/DiffView';
import { Tag } from '../components/Tag';
import { Button, SegmentGroup } from '../components/ui';
import { CHANGES_NEW, count } from '../format';
import { useApp } from '../store';

const PERIODS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 180, label: '180 дней' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

const DAY = 86_400_000;

/** «Сегодня, 18 октября» / «Вчера, 17 октября» / «15 октября» / «15 октября 2025» */
function dayLabel(key: string, now = new Date()): string {
  const d = new Date(`${key}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - d.getTime()) / DAY);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  const date = d.toLocaleDateString('ru-RU', opts);
  return diff === 0 ? `Сегодня, ${date}` : diff === 1 ? `Вчера, ${date}` : date;
}

/** Ключ дня в местном времени: запись в 01:00 МСК — это «сегодня», а не вчерашний UTC */
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');

export function Changes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const revision = useApp((s) => s.dataRevision);
  const categories = useApp((s) => s.categories);
  const [all, setAll] = useState<ChangeView[] | null>(null);
  const [period, setPeriod] = useState<Period>(focus ? 180 : 30);
  const [category, setCategory] = useState<string | null>(null);
  /** Непросмотренные на момент открытия экрана — помечены «Новое», пока экран открыт */
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    void api.getChanges().then((list) => {
      if (!alive) return;
      setAll(list);
      setFresh((prev) => new Set([...prev, ...list.filter((c) => !c.seen).map((c) => c.id)]));
    });
    return () => void (alive = false);
  }, [revision]);

  // при уходе с экрана показанное считается просмотренным
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  useEffect(
    () => () => {
      const ids = [...freshRef.current];
      if (ids.length) void api.markChangesSeen(ids);
    },
    [],
  );

  const inPeriod = useMemo(() => {
    const from = Date.now() - period * DAY;
    return (all ?? []).filter((c) => new Date(c.date).getTime() >= from);
  }, [all, period]);
  const shown = category ? inPeriod.filter((c) => c.categoryId === category) : inPeriod;

  const days = useMemo(() => {
    const m = new Map<string, ChangeView[]>();
    for (const c of shown) {
      const k = dayKey(c.date);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [shown]);

  const unseen = (all ?? []).filter((c) => !c.seen).length;

  // прокрутка к записи из ссылки «посмотреть, что было»
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus || !all) return;
    const el = listRef.current?.querySelector(`[data-change="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.classList.add('focused');
  }, [focus, all]);

  const markAll = () => {
    void api.markChangesSeen();
    setAll((list) => list?.map((c) => ({ ...c, seen: true })) ?? null);
    setFresh(new Set());
  };

  const open = (c: ChangeView) => {
    void api.markChangesSeen([c.id]);
    if (c.ruleId && (c.type === 'changed' || c.type === 'added')) {
      void navigate(`/doc/${c.docId}?rule=${encodeURIComponent(c.ruleId)}`);
    } else if (c.type === 'doc_added') {
      void navigate(`/doc/${c.docId}`);
    } else {
      void api.openExternal(threadUrl(c.docId));
    }
  };

  const catTitle = (id: string) => categories.find((c) => c.id === id)?.title ?? '';

  return (
    <>
      <section className="panel changes-panel">
        <header className="changes-head">
          <div className="changes-title">
            <h1 className="screen-title">Изменения в правилах</h1>
            <p className="doc-meta">
              {unseen > 0
                ? `${count(unseen, CHANGES_NEW)} с вашего последнего просмотра`
                : 'Новых изменений нет'}
            </p>
          </div>
          <div className="changes-tools">
            <SegmentGroup
              label="Период"
              size="sm"
              value={period}
              options={PERIODS}
              onChange={(p) => {
                setPeriod(p);
                if (focus) setParams({}, { replace: true });
              }}
            />
            <Button
              variant="outline"
              size="sm"
              icon={<Check size={15} />}
              disabled={unseen === 0}
              onClick={markAll}
            >
              Отметить всё просмотренным
            </Button>
          </div>
        </header>

        <div ref={listRef} className="scroll changes-list">
          {days.map(([key, list]) => (
            <section key={key} aria-label={dayLabel(key)}>
              <h2 className="day-head">{dayLabel(key)}</h2>
              {list.map((c) => (
                <article
                  key={c.id}
                  data-change={c.id}
                  className={`change-card${fresh.has(c.id) ? ' is-new' : ''}`}
                >
                  <header className="change-head">
                    <Tag type={c.type} renumbered={c.renumbered} />
                    <span className="change-doc">{c.docTitle}</span>
                    {c.ruleNumber && <span className="change-num mono">п. {c.ruleNumber}</span>}
                    {fresh.has(c.id) && (
                      <span className="recent">
                        <span className="dot" aria-hidden />
                        Новое
                      </span>
                    )}
                    <button type="button" className="link-btn change-open" onClick={() => open(c)}>
                      {actionLabel(c)}
                      {isExternal(c) && <ExternalLink size={13} aria-hidden />}
                    </button>
                  </header>
                  {c.type === 'doc_added' && (
                    <p className="change-note">
                      Новая тема в разделе правил «{catTitle(c.categoryId)}».
                    </p>
                  )}
                  {c.type === 'doc_removed' && (
                    <p className="change-note">Тема убрана из раздела правил.</p>
                  )}
                  <DiffView type={c.type} before={c.before} after={c.after} />
                </article>
              ))}
            </section>
          ))}
          {all && shown.length === 0 && (
            <p className="empty">
              {category
                ? `В категории «${catTitle(category)}» за ${period} дней изменений нет.`
                : `За ${period} дней правила не менялись.`}
            </p>
          )}
        </div>
      </section>

      <Summary period={period} changes={inPeriod} category={category} onCategory={setCategory} />
    </>
  );
}

const isExternal = (c: ChangeView) => c.type === 'removed' || c.type === 'doc_removed';

const actionLabel = (c: ChangeView) =>
  isExternal(c) ? 'На форуме' : c.type === 'doc_added' ? 'Открыть документ' : 'Открыть пункт';

/** Правая панель «За N дней» (§7.3 плана): счётчики по категориям, легенда, пояснение */
function Summary(props: {
  period: Period;
  changes: ChangeView[];
  category: string | null;
  onCategory(id: string | null): void;
}) {
  const categories = useApp((s) => s.categories);
  const counts = new Map<string, number>();
  for (const c of props.changes) counts.set(c.categoryId, (counts.get(c.categoryId) ?? 0) + 1);
  const rows = [...categories].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  return (
    <aside className="panel summary-panel" aria-label="Сводка">
      <h2 className="summary-title">За {props.period} дней</h2>
      <ul className="summary-list">
        {rows.map((c) => {
          const n = counts.get(c.id) ?? 0;
          const active = props.category === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`summary-row${active ? ' active' : ''}`}
                aria-pressed={active}
                disabled={n === 0 && !active}
                onClick={() => props.onCategory(active ? null : c.id)}
              >
                <span>{c.title}</span>
                <span className="mono">{n}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="nav-divider" />
      <ul className="legend">
        <li>
          <span className="legend-dot tone-changed" />
          Изменён — текст или наказание
        </li>
        <li>
          <span className="legend-dot tone-added" />
          Добавлен
        </li>
        <li>
          <span className="legend-dot tone-removed" />
          Удалён
        </li>
        <li>
          <span className="legend-dot tone-doc" />
          Новый документ
        </li>
      </ul>
      <p className="summary-note">
        Правила проверяются каждый день в 06:07 МСК. Об изменениях приходит уведомление Windows.
      </p>
    </aside>
  );
}
