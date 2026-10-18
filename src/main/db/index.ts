/**
 * SQLite (better-sqlite3, WAL) и миграции. Без импортов Electron — тестируется в vitest.
 *
 * Миграции — файлы `migrations/NNN_*.sql`, номер применённой хранится в `PRAGMA user_version`.
 */
import Database from 'better-sqlite3';
import m001 from './migrations/001_init.sql?raw';

export type Db = Database.Database;

/** Порядок важен: индекс + 1 = номер миграции */
const MIGRATIONS = [m001];

export function migrate(db: Db): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return MIGRATIONS.length;
}

/** file — путь к nova.db или ':memory:' */
export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
