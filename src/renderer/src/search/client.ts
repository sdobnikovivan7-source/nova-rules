/**
 * Окно ↔ Web Worker поиска. Индекс строится при первом поиске и пересобирается
 * после `data:updated` (новая `dataRevision`). Сообщения обрабатываются по порядку,
 * поэтому поиск, отправленный после build, всегда идёт по новому индексу.
 */
import { api } from '../api';
import type { SearchResult } from './engine';
import type { FromWorker, ToWorker } from './protocol';

let worker: Worker | null = null;
let builtRevision: number | null = null;
let building: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, (r: SearchResult | null) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'result') {
      pending.get(m.id)?.(m.result);
      pending.delete(m.id);
    } else if (import.meta.env.DEV) {
      console.debug(`[search] индекс построен за ${m.ms} мс`);
    }
  };
  return worker;
}

const send = (m: ToWorker) => getWorker().postMessage(m);

/** Отправить данные в worker, если они изменились с прошлой сборки */
export function ensureIndex(revision: number): Promise<void> {
  if (builtRevision === revision && building) return building;
  builtRevision = revision;
  building = (async () => {
    const [rows, synonyms, categories] = await Promise.all([
      api.getSearchCorpus(),
      api.getSynonyms(),
      api.getCategories(),
    ]);
    // пока грузили, данные успели обновиться ещё раз — эту сборку отправит новый вызов
    if (builtRevision !== revision) return;
    send({ type: 'build', revision, rows, synonyms, categories });
  })();
  return building;
}

export async function search(query: string, revision: number): Promise<SearchResult | null> {
  await ensureIndex(revision);
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ type: 'search', id, query });
  });
}
