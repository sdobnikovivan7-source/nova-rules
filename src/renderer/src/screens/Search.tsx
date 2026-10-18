/**
 * Поиск (макет «Поиск»): чипы категорий со счётчиками, фильтр наказания, «только важное»,
 * строка-пояснение, выдача по документам с подсветкой, правая панель с «Открыть в документе».
 * Строка запроса — в шапке (TopBar); ↑↓ выбирают пункт, Enter открывает его в документе.
 */
import { ChevronDown, Clock, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { RuleView } from '@shared/ipc';
import type { Rule } from '@shared/schema';
import { api } from '../api';
import { Highlight } from '../components/Highlight';
import { RuleCard } from '../components/RuleCard';
import { RulePanel } from '../components/RulePanel';
import { Chip } from '../components/ui';
import { useRuleMenu } from '../contextMenu';
import { count, DOCS_IN, RULES, stripSectionNumber } from '../format';
import { ensureIndex, search } from '../search/client';
import { type Hit, matchRanges, MAX_HITS, type SearchResult } from '../search/engine';
import {
  applyFilters,
  countByCategory,
  groupByDoc,
  PUNISH_FILTERS,
  type PunishFilter,
} from '../search/filters';
import { useSearch } from '../search/state';
import { useApp } from '../store';

/** Строка корпуса → Rule для RuleCard (HTML не нужен: в выдаче текст с подсветкой) */
const toRule = (h: Hit): Rule => ({
  id: h.row.id,
  number: h.row.number,
  depth: 0,
  html: '',
  text: h.row.text,
  hash: '',
  ...(h.row.punish
    ? {
        punishment: {
          raw: h.row.punish,
          kind: h.row.punishKinds[0] ?? 'other',
          kinds: h.row.punishKinds.length ? h.row.punishKinds : ['other'],
        },
      }
    : {}),
});

export function Search() {
  const navigate = useNavigate();
  const { query, filters, selectedId, history } = useSearch();
  const { setQuery, setFilters, select, remember, forget } = useSearch.getState();
  const revision = useApp((s) => s.dataRevision);
  const categories = useApp((s) => s.categories);
  const [result, setResult] = useState<{ query: string; res: SearchResult } | null>(null);

  // индекс строится сразу при открытии экрана, а не на первой букве
  useEffect(() => void ensureIndex(revision), [revision]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void search(q, revision).then((res) => alive && res && setResult({ query: q, res }));
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, revision]);

  const hits = useMemo(() => result?.res.hits ?? [], [result]);
  const filtered = useMemo(() => applyFilters(hits, filters), [hits, filters]);
  const counts = useMemo(() => countByCategory(hits, filters), [hits, filters]);
  const groups = useMemo(() => groupByDoc(filtered), [filtered]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const rules = useMemo(() => new Map(flat.map((h) => [h.row.id, toRule(h)])), [flat]);
  const selectedHit = flat.find((h) => h.row.id === selectedId);

  // новая выдача — выбран первый пункт (как в макете), если прежний выбор в неё не попал
  useEffect(() => {
    const ids = useSearch.getState();
    if (!flat.some((h) => h.row.id === ids.selectedId)) select(flat[0]?.row.id ?? null);
  }, [flat, select]);

  // полный пункт для правой панели
  const [panelRule, setPanelRule] = useState<RuleView | null>(null);
  useEffect(() => {
    if (!selectedId) return setPanelRule(null);
    let alive = true;
    void api.getRule(selectedId).then((r) => alive && setPanelRule(r));
    return () => void (alive = false);
  }, [selectedId, revision]);

  const openInDoc = useCallback(
    (h: Hit) => {
      remember();
      void navigate(`/doc/${h.row.docId}?rule=${encodeURIComponent(h.row.id)}`);
    },
    [navigate, remember],
  );

  const onSelect = useCallback(
    (rule: Rule) => {
      select(rule.id);
      remember();
    },
    [select, remember],
  );

  // ↑↓ — выбор пункта, Enter — открыть в документе (из поля поиска тоже)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.getAttribute('type') !== 'search'))
        return;
      const i = flat.findIndex((h) => h.row.id === useSearch.getState().selectedId);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!flat.length) return;
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1);
        const id = flat[next]!.row.id;
        select(id);
        listRef.current
          ?.querySelector(`[data-rule="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && i >= 0 && (t.tagName === 'INPUT' || t === document.body)) {
        e.preventDefault();
        openInDoc(flat[i]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, select, openInDoc]);

  const openMenu = useRuleMenu(panelRule?.docUrl);
  const catTitle = (id: string) => categories.find((c) => c.id === id)?.title ?? '';
  const punishLabel = PUNISH_FILTERS.find((p) => p.value === filters.punish)!.label;
  const searching = !!query.trim() && result?.query !== query.trim();

  return (
    <>
      <section className="panel search-panel">
        {query.trim() ? (
          <>
            <header className="search-head">
              <div className="search-filters">
                <Chip
                  active={!filters.category}
                  count={[...counts.values()].reduce((a, b) => a + b, 0)}
                  onClick={() => setFilters({ category: null })}
                >
                  Все
                </Chip>
                {categories
                  .filter((c) => counts.get(c.id) || filters.category === c.id)
                  .map((c) => (
                    <Chip
                      key={c.id}
                      active={filters.category === c.id}
                      count={counts.get(c.id) ?? 0}
                      onClick={() =>
                        setFilters({ category: filters.category === c.id ? null : c.id })
                      }
                    >
                      {c.title}
                    </Chip>
                  ))}
                <span className="search-filters-right">
                  <Chip
                    active={filters.importantOnly}
                    onClick={() => setFilters({ importantOnly: !filters.importantOnly })}
                  >
                    Только важное
                  </Chip>
                  <label className={`select${filters.punish !== 'any' ? ' active' : ''}`}>
                    <span>Наказание: {punishLabel}</span>
                    <ChevronDown size={15} aria-hidden />
                    <select
                      aria-label="Наказание"
                      value={filters.punish}
                      onChange={(e) => setFilters({ punish: e.target.value as PunishFilter })}
                    >
                      {PUNISH_FILTERS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </span>
              </div>
              {result && (
                <p className="search-explain" role="status">
                  {explainText(result.res, filtered.length, groups.length)}
                </p>
              )}
            </header>

            <div ref={listRef} className={`scroll rule-list${searching ? ' is-stale' : ''}`}>
              {groups.map((g) => (
                <section key={g.docId} className="hit-group" aria-label={g.docTitle}>
                  <h2 className="hit-group-head">
                    <button
                      type="button"
                      className="hit-doc"
                      onClick={() => void navigate(`/doc/${g.docId}`)}
                    >
                      {g.docTitle}
                    </button>
                    <span className="hit-cat">{catTitle(g.categoryId)}</span>
                  </h2>
                  {g.hits.map((h) => (
                    <RuleCard
                      key={h.row.id}
                      rule={rules.get(h.row.id)!}
                      selected={h.row.id === selectedId}
                      showNotes={false}
                      body={
                        <Highlight text={h.row.text} ranges={matchRanges(h.row.text, h.terms)} />
                      }
                      footer={
                        h.row.sectionTitle && (
                          <span className="rule-footer">
                            {stripSectionNumber(h.row.sectionTitle)}
                          </span>
                        )
                      }
                      onSelect={onSelect}
                      onContextMenu={openMenu}
                    />
                  ))}
                </section>
              ))}
              {result && filtered.length === 0 && (
                <p className="empty">
                  {hits.length
                    ? 'С этими фильтрами ничего нет — попробуйте снять фильтр.'
                    : 'Ничего не нашлось. Попробуйте другое слово или номер пункта, например «1.2».'}
                </p>
              )}
            </div>
          </>
        ) : (
          <SearchStart history={history} onPick={(q) => setQuery(q)} onForget={forget} />
        )}
      </section>

      {query.trim() && panelRule && selectedHit && (
        <RulePanel
          rule={panelRule}
          highlight={selectedHit.terms}
          onClose={() => select(null)}
          onOpenInDoc={() => openInDoc(selectedHit)}
        />
      )}
    </>
  );
}

/** Пустой запрос: подсказка и последние запросы */
function SearchStart(props: {
  history: string[];
  onPick(q: string): void;
  onForget(q: string | 'all'): void;
}) {
  return (
    <div className="search-start">
      <h1 className="screen-title">Поиск по правилам</h1>
      <p className="search-hint">
        Номер пункта («1.2», «крайм 1.2»), слово в любой форме или сленг: дм, рк, капт, зз. Опечатки
        тоже учитываются.
      </p>
      {props.history.length > 0 && (
        <div className="history">
          <div className="history-head">
            <span>Недавние запросы</span>
            <button type="button" className="link-btn" onClick={() => props.onForget('all')}>
              Очистить
            </button>
          </div>
          <ul>
            {props.history.map((q) => (
              <li key={q}>
                <button type="button" className="history-item" onClick={() => props.onPick(q)}>
                  <Clock size={15} aria-hidden />
                  {q}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить «${q}» из истории`}
                  onClick={() => props.onForget(q)}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** «9 пунктов в 3 документах. Учтены формы слова и синоним «война за территорию».» */
function explainText(res: SearchResult, shown: number, docs: number): string {
  const e = res.explain;
  const total = res.hits.length;
  const head =
    e.mode === 'number'
      ? `${count(shown, RULES)} с номером ${e.number}${e.scope ? ` — «${e.scope}»` : ''}`
      : `${count(shown, RULES)} в ${count(docs, DOCS_IN)}`;
  const limited = total >= MAX_HITS ? ` Показаны первые ${MAX_HITS} — уточните запрос.` : '';
  const parts: string[] = [];
  if (e.forms) parts.push('формы слова');
  if (e.typos) parts.push('опечатки');
  if (e.synonyms.length === 1) parts.push(`синоним «${e.synonyms[0]!.shown}»`);
  if (e.synonyms.length > 1)
    parts.push(`синонимы ${e.synonyms.map((s) => `«${s.shown}»`).join(', ')}`);
  const extra = parts.length ? ` Учтены ${joinRu(parts)}.` : '';
  return `${head}.${extra}${limited}`;
}

const joinRu = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} и ${xs.at(-1)}`;
