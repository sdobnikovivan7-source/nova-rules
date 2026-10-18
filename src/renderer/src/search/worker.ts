/**
 * Web Worker поиска (§10.4): индекс строится здесь, интерфейс не подвисает.
 * Протокол — search/protocol.ts.
 */
import { SearchEngine } from './engine';
import type { ToWorker, FromWorker } from './protocol';

let engine: SearchEngine | null = null;

// в tsconfig окна lib DOM, а не webworker: у worker-scope тот же postMessage, что у Worker
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'build') {
    const t0 = performance.now();
    engine = new SearchEngine(m.rows, m.synonyms, m.categories);
    post({ type: 'ready', revision: m.revision, ms: Math.round(performance.now() - t0) });
  } else if (m.type === 'search') {
    post({ type: 'result', id: m.id, result: engine ? engine.search(m.query) : null });
  }
};
