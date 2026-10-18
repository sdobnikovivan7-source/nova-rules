/** Сообщения между окном и Web Worker поиска */
import type { SearchRow } from '@shared/ipc';
import type { CategoryRef, SearchResult } from './engine';

export type ToWorker =
  | {
      type: 'build';
      revision: number;
      rows: SearchRow[];
      synonyms: Record<string, string[]>;
      categories: CategoryRef[];
    }
  | { type: 'search'; id: number; query: string };

export type FromWorker =
  | { type: 'ready'; revision: number; ms: number }
  | { type: 'result'; id: number; result: SearchResult | null };
