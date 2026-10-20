/**
 * Окно быстрого поиска (макет «Быстрый поиск», §10.3, §7.11): поле 58px, пин «держать поверх»,
 * пояснение синонима, результаты в одну строку с путём. Клавиши: ↑↓ — выбор, Enter — раскрыть,
 * Ctrl+C — скопировать для жалобы, Ctrl+Enter — открыть в главном окне, Esc — свернуть / скрыть.
 */
import { GripVertical, LocateFixed, Pin, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyRule } from '../actions';
import { api } from '../api';
import { Highlight } from '../components/Highlight';
import { PunishmentBadge } from '../components/PunishmentBadge';
import { Kbd } from '../components/ui';
import { count, DOCS_IN, RULES, stripSectionNumber } from '../format';
import { search } from '../search/client';
import { type Hit, matchRanges, type SearchResult } from '../search/engine';
import { useSearch } from '../search/state';
import { useApp } from '../store';

/** Больше в маленьком окне не нужно — уточняют запрос */
const LIMIT = 50;

export function QuickSearch() {
  const revision = useApp((s) => s.dataRevision);
  const pinned = useApp((s) => s.settings?.quickAlwaysOnTop ?? false);
  const updateSettings = useApp((s) => s.updateSettings);
  const history = useSearch((s) => s.history);
  const remember = useSearch((s) => s.remember);

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // окно показали горячей клавишей — сразу печатать, прошлый запрос выделен
  useEffect(
    () =>
      api.onQuickShown(() => {
        setExpanded(null);
        input.current?.focus();
        input.current?.select();
      }),
    [],
  );

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void search(q, revision).then((r) => {
        if (!alive || !r) return;
        setResult(r);
        setIndex(0);
        setExpanded(null);
      });
    }, 40);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, revision]);

  const hits = useMemo(() => result?.hits.slice(0, LIMIT) ?? [], [result]);
  const current: Hit | undefined = hits[index];

  const hide = useCallback(() => api.quick.hide(), []);

  const openInMain = useCallback(
    (h: Hit) => {
      remember(query);
      api.quick.openInMain(`/doc/${h.row.docId}?rule=${encodeURIComponent(h.row.id)}`);
    },
    [query, remember],
  );

  const select = (i: number) => {
    setIndex(i);
    list.current?.children[i]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      e.preventDefault();
      select(e.key === 'ArrowDown' ? Math.min(hits.length - 1, index + 1) : Math.max(0, index - 1));
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      if (e.ctrlKey) openInMain(current);
      else setExpanded((x) => (x === current.row.id ? null : current.row.id));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (expanded) setExpanded(null);
      else hide();
    } else if (e.ctrlKey && e.code === 'KeyC' && current) {
      // выделен текст в поле — обычное копирование
      const el = input.current;
      if (el && el.selectionStart !== el.selectionEnd) return;
      e.preventDefault();
      remember(query);
      void copyRule(current.row.id);
    }
  };

  return (
    <div className="quick" onKeyDown={onKeyDown}>
      <header className="quick-bar">
        <span className="quick-grip" title="Перетащите, чтобы подвинуть окно">
          <GripVertical size={16} strokeWidth={2.2} aria-hidden />
        </span>
        <Search size={20} strokeWidth={2.2} className="quick-icon" aria-hidden />
        <input
          ref={input}
          autoFocus
          type="search"
          className="quick-input"
          value={query}
          placeholder="Номер пункта, слово или сленг"
          aria-label="Быстрый поиск по правилам"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`quick-pin${pinned ? ' on' : ''}`}
          aria-pressed={pinned}
          aria-label="Не скрывать окно"
          title={
            pinned ? 'Окно не скрывается при переключении' : 'Не скрывать при переключении в игру'
          }
          onClick={() => {
            void updateSettings({ quickAlwaysOnTop: !pinned });
            input.current?.focus();
          }}
        >
          <Pin size={17} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="quick-pin"
          aria-label="Вернуть окно в центр"
          title="Вернуть окно в центр и исходный размер"
          onClick={() => {
            api.quick.resetBounds();
            input.current?.focus();
          }}
        >
          <LocateFixed size={17} strokeWidth={2.2} />
        </button>
        <button type="button" className="quick-esc" onClick={hide} aria-label="Скрыть окно">
          <Kbd>Esc</Kbd>
        </button>
      </header>

      {result && <p className="quick-explain">{quickExplain(result, hits.length)}</p>}

      {query.trim() ? (
        <ul ref={list} className="quick-list" role="listbox" aria-label="Результаты">
          {hits.map((h, i) => {
            const open = expanded === h.row.id;
            const punishment = h.row.punish
              ? {
                  raw: h.row.punish,
                  kind: h.row.punishKinds[0] ?? 'other',
                  kinds: h.row.punishKinds.length ? h.row.punishKinds : (['other'] as const),
                }
              : null;
            return (
              <li
                key={h.row.id}
                role="option"
                aria-selected={i === index}
                className={`quick-row${i === index ? ' selected' : ''}${open ? ' open' : ''}`}
                onMouseDown={(e) => e.preventDefault() /* фокус остаётся в поле */}
                onClick={() => (i === index ? setExpanded(open ? null : h.row.id) : select(i))}
                onDoubleClick={() => openInMain(h)}
              >
                <span className="quick-num mono">{h.row.number ?? ''}</span>
                <span className="quick-main">
                  <span className="quick-text">
                    <Highlight text={h.row.text} ranges={matchRanges(h.row.text, h.terms)} />
                  </span>
                  {open && h.row.notes && <span className="quick-notes">{h.row.notes}</span>}
                  <span className="quick-path">
                    {h.row.docTitle}
                    {h.row.sectionTitle && ` › ${stripSectionNumber(h.row.sectionTitle)}`}
                  </span>
                </span>
                {punishment && (
                  <PunishmentBadge
                    punishment={{ ...punishment, kinds: [...punishment.kinds] }}
                    size={open ? 'lg' : 'sm'}
                  />
                )}
              </li>
            );
          })}
          {result && hits.length === 0 && (
            <li className="quick-empty">Ничего не нашлось — попробуйте другое слово или номер.</li>
          )}
        </ul>
      ) : (
        <div className="quick-start">
          {history.length > 0 ? (
            <>
              <span className="quick-start-label">Недавние запросы</span>
              <div className="quick-history">
                {history.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="chip chip-filter"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setQuery(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="quick-start-label">
              Например: «дм», «капт», «крайм 1.2», «ограбление банка».
            </span>
          )}
        </div>
      )}

      <footer className="quick-foot">
        <span>
          <Kbd>↑↓</Kbd> выбрать
        </span>
        <span>
          <Kbd>Enter</Kbd> раскрыть
        </span>
        <span>
          <Kbd>Ctrl C</Kbd> копировать для жалобы
        </span>
        <span className="quick-foot-right">
          <Kbd>Ctrl Enter</Kbd> в главном окне
        </span>
      </footer>
    </div>
  );
}

/** «„дм“ — это deathmatch, убийство без причины. Найдено 5 пунктов.» */
function quickExplain(r: SearchResult, shown: number): string {
  const e = r.explain;
  const docs = new Set(r.hits.map((h) => h.row.docId)).size;
  const found =
    e.mode === 'number'
      ? `Пункт ${e.number}${e.scope ? ` — «${e.scope}»` : ''}: ${count(r.hits.length, RULES)}.`
      : `Найдено ${count(r.hits.length, RULES)} в ${count(docs, DOCS_IN)}.`;
  const more = r.hits.length > shown ? ` Показаны первые ${shown}.` : '';
  if (e.synonyms.length) {
    const word = e.synonyms[0]!.word;
    return `«${word}» — это ${e.synonyms.map((s) => s.shown).join(', ')}. ${found}${more}`;
  }
  const extra = [e.forms && 'формы слова', e.typos && 'опечатки'].filter(Boolean).join(' и ');
  return `${found}${extra ? ` Учтены ${extra}.` : ''}${more}`;
}
