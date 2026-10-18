/**
 * Демо-база для ручной проверки экранов «Изменения» и «Избранное» (данные seed +
 * придуманные изменения и закладки). Запуск приложения на ней (только dev):
 *   pnpm demo-db <папка>  →  NOVA_USER_DATA=<папка> pnpm dev
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { ChangeEntry } from '@shared/schema';
import { readDataDir } from '../src/main/data';
import Database from 'better-sqlite3';
import * as repo from '../src/main/db/repo';
import { ruleSummary } from '../src/scraper/diff';

const dir = process.argv[2]!;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const data = await readDataDir(path.resolve('resources/seed'));
// openDb импортирует миграцию как `?raw` (Vite), tsx так не умеет — применяем её здесь
const db = new Database(path.join(dir, 'nova.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(readFileSync('src/main/db/migrations/001_init.sql', 'utf8'));
db.pragma('user_version = 1');

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const doc = (id: number) => data.docs.find((d) => d.id === id)!;
const rule = (id: string) => {
  const d = doc(Number(id.split(':')[0]));
  return d.sections.flatMap((s) => s.rules).find((r) => r.id === id)!;
};

const r1 = rule('402991:1.2');
const r2 = rule('406244:1.8');
const r3 = rule('402987:1.2');
const r4 = rule('406244:2.2');
const entries: Omit<ChangeEntry, 'id'>[] = [
  {
    date: day(0),
    docId: 402991,
    docTitle: doc(402991).title,
    categoryId: 'crime',
    ruleId: r1.id,
    ruleNumber: r1.number!,
    type: 'changed',
    before: ruleSummary(r1).replace('Воскресенье', 'Суббота').replace('Возврат территории', 'WARN'),
    after: ruleSummary(r1),
  },
  {
    date: day(0),
    docId: 406244,
    docTitle: doc(406244).title,
    categoryId: 'crime',
    ruleId: r2.id,
    ruleNumber: r2.number!,
    type: 'added',
    after: ruleSummary(r2),
  },
  {
    date: day(1),
    docId: 402987,
    docTitle: doc(402987).title,
    categoryId: 'general',
    ruleId: r3.id,
    ruleNumber: r3.number!,
    type: 'changed',
    renumbered: true,
    before: ruleSummary(r3).replace('любого типа', 'огнестрельное'),
    after: ruleSummary(r3),
  },
  {
    date: day(1),
    docId: 406244,
    docTitle: doc(406244).title,
    categoryId: 'crime',
    ruleId: '406244:9.9',
    ruleNumber: '9.9',
    type: 'removed',
    before: 'Запрещено начинать стрелу без уведомления администрации. | WARN',
  },
  {
    date: day(5),
    docId: 406084,
    docTitle: doc(406084).title,
    categoryId: 'events',
    type: 'doc_added',
  },
  {
    date: day(20),
    docId: 406244,
    docTitle: doc(406244).title,
    categoryId: 'crime',
    ruleId: r4.id,
    ruleNumber: r4.number!,
    type: 'changed',
    before: ruleSummary(r4).replace('не ограничена', 'ограничена тремя союзами'),
    after: ruleSummary(r4),
  },
  {
    date: day(100),
    docId: 400001,
    docTitle: 'Правила мероприятия «Битва за порт»',
    categoryId: 'events',
    type: 'doc_removed',
  },
];
const changes = entries.map((e, i) => ({ ...e, id: `demo${i}` })) as ChangeEntry[];
repo.applyData(db, { ...data, changes });
// уже видели самое старое изменение
repo.markChangesSeen(db, ['demo5', 'demo6']);
// избранное: обычный, изменённый после добавления, удалённый
repo.toggleFavorite(db, '402991:1.1');
repo.toggleFavorite(db, '402991:1.2');
db.prepare(
  "UPDATE favorites SET hash = 'old', snapshot = 'Старый текст пункта' WHERE rule_id = '402991:1.2'",
).run();
db.prepare(
  "INSERT INTO favorites (rule_id, snapshot, hash, added_at) VALUES ('406244:9.9', 'Запрещено начинать стрелу без уведомления администрации. | WARN', 'x', ?)",
).run(day(30));
console.log('демо-база:', dir, repo.getChanges(db).length, 'изменений');
db.close();
