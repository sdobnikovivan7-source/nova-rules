/**
 * Шапка главной колонки: поле поиска 46px (§7, макеты «Документ» и «Поиск») + кнопки окна.
 * Ввод в поле с любого экрана открывает «Поиск»; Ctrl+F и «/» ставят фокус в поле.
 */
import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSearch } from '../search/state';
import { Kbd } from './ui';
import { WindowControls } from './WindowControls';

export function TopBar() {
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const input = useRef<HTMLInputElement>(null);

  // открыли «Поиск» — сразу можно печатать
  useEffect(() => {
    if (pathname === '/search') input.current?.focus();
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey && e.code === 'KeyF') || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const change = (q: string) => {
    setQuery(q);
    if (q.trim() && pathname !== '/search') void navigate('/search');
  };

  return (
    <header className="topbar">
      <label className="search-field">
        <Search size={18} strokeWidth={2} className="search-icon" aria-hidden />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Номер пункта, слово или сленг: дм, рк, капт"
          aria-label="Поиск по правилам"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault();
              change('');
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Очистить"
            onClick={() => {
              change('');
              input.current?.focus();
            }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        ) : (
          <Kbd>Ctrl F</Kbd>
        )}
      </label>
      <WindowControls />
    </header>
  );
}
