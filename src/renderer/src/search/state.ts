/**
 * Состояние поиска: запрос общий для шапки и экрана «Поиск», фильтры, выбранный пункт,
 * история последних 10 запросов (localStorage — удобство одного пользователя на этом ПК).
 */
import { create } from 'zustand';
import { type Filters, NO_FILTERS } from './filters';

const HISTORY_KEY = 'nova.searchHistory';
const HISTORY_MAX = 10;

function loadHistory(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveHistory(h: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    // хранилище недоступно — история просто не сохранится
  }
}

type SearchState = {
  query: string;
  filters: Filters;
  selectedId: string | null;
  history: string[];
  setQuery(q: string): void;
  setFilters(patch: Partial<Filters>): void;
  select(id: string | null): void;
  /** Запомнить запрос (выбрали результат, нажали Enter) */
  remember(q?: string): void;
  forget(q: string | 'all'): void;
};

export const useSearch = create<SearchState>((set, get) => ({
  query: '',
  filters: NO_FILTERS,
  selectedId: null,
  history: loadHistory(),

  // очистили запрос — новый поиск начинается без старых фильтров
  setQuery: (query) =>
    set(
      query.trim() ? { query, selectedId: null } : { query, selectedId: null, filters: NO_FILTERS },
    ),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  select: (selectedId) => set({ selectedId }),

  remember(q = get().query) {
    const query = q.trim();
    if (query.length < 2) return;
    const history = [query, ...get().history.filter((h) => h !== query)].slice(0, HISTORY_MAX);
    saveHistory(history);
    set({ history });
  },

  forget(q) {
    const history = q === 'all' ? [] : get().history.filter((h) => h !== q);
    saveHistory(history);
    set({ history });
  },
}));
