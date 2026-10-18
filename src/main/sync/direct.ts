/**
 * Режим direct (§7.3): тот же сборщик, что в GitHub Actions, но в main-процессе.
 * Прошлая версия — из SQLite: по ней считается diff и работает защита от поломки вёрстки.
 * Без Electron — тестируется в vitest.
 */
import { type SourcesConfig } from '@shared/schema';
import { runScrape } from '../../scraper';
import { diffDocs, mergeChanges } from '../../scraper/diff';
import type { Db } from '../db';
import { type DataInput, getAllDocs, getChangeEntries, getDataVersion, getMeta } from '../db/repo';

export type DirectOptions = {
  db: Db;
  sources: SourcesConfig;
  /** Загрузчик страниц; по умолчанию — вежливый Http сборщика */
  fetchText?: (url: string) => Promise<string>;
  log?: (msg: string) => void;
  now?: Date;
};

/** Собрать данные с форума. Бросает BlockedError, если форум закрыт антибот-проверкой. */
export async function scrapeDirect(opts: DirectOptions): Promise<DataInput> {
  const { db, sources, fetchText, log, now = new Date() } = opts;
  const prev = getAllDocs(db);
  const result = await runScrape({ sources, prev: { docs: prev }, fetchText, log });
  if (!result.docs.length)
    throw new Error(`с форума не получено ни одной темы (${result.warnings.join('; ')})`);

  const fresh = diffDocs(prev, result.docs, now.toISOString());
  const changed =
    prev.size !== result.docs.length || result.docs.some((d) => prev.get(d.id)?.hash !== d.hash);

  return {
    categories: result.categories,
    docs: result.docs,
    allDocIds: result.docs.map((d) => d.id),
    changes: mergeChanges(getChangeEntries(db), fresh, now),
    meta: {
      // версия central не меняется: при возврате на central данные перекачаются целиком
      version: getDataVersion(db),
      builtAt: changed ? now.toISOString() : (getMeta(db, 'data_built_at') ?? now.toISOString()),
      checkedAt: now.toISOString(),
      files: {},
      source: 'direct',
    },
  };
}
