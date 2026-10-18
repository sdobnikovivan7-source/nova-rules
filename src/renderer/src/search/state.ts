/** Состояние поиска: строка запроса общая для шапки и экрана «Поиск» (сам поиск — этап 6) */
import { create } from 'zustand';

type SearchState = {
  query: string;
  setQuery(q: string): void;
};

export const useSearch = create<SearchState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}));
