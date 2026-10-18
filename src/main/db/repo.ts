/**
 * Чтение и запись данных правил в SQLite.
 *
 * Правила, категории и лента изменений приходят с сервера и перезаписываются.
 * `favorites` и `changes_seen` — данные пользователя, запись правил их не трогает.
 */
import type {
  CategoryView,
  ChangesQuery,
  ChangeView,
  DocSummary,
  Favorite,
  RuleView,
  SearchRow,
} from '@shared/ipc';
import type {
  Category,
  ChangeEntry,
  Note,
  PunishKind,
  Rule,
  RuleDoc,
  Section,
} from '@shared/schema';
import { sanitizeRuleHtml } from '../../scraper/parse/clean';
import type { Db } from './index';

// ---------- meta

export type MetaKey =
  /** Версия данных central (manifest.version) */
  | 'data_version'
  /** Когда данные последний раз изменились */
  | 'data_built_at'
  /** Когда сборщик последний раз проверил форум */
  | 'data_checked_at'
  /** JSON: путь файла → sha1 применённой версии (для частичной докачки) */
  | 'data_files'
  /** Откуда текущие данные: seed | central | direct */
  | 'data_source'
  /** Последняя успешная синхронизация (любой режим) */
  | 'last_sync_at'
  /** С какого момента central недоступен (для отката на direct через 3 суток) */
  | 'central_failing_since'
  /** Последний прогон direct (не чаще раза в сутки) */
  | 'last_direct_at'
  | 'synonyms';

export function getMeta(db: Db, key: MetaKey): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string | null } | undefined;
  return row?.value ?? undefined;
}

export function setMeta(db: Db, key: MetaKey, value: string | number | null): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value === null ? null : String(value));
}

export function getDataVersion(db: Db): number {
  return Number(getMeta(db, 'data_version') ?? 0);
}

// ---------- запись

export type DataInput = {
  categories: Category[];
  /** Документы для вставки или замены */
  docs: RuleDoc[];
  /**
   * Полный список id документов в новой версии данных; остальные удаляются.
   * Не задан — берутся id из `docs` (полная замена, как при seed).
   */
  allDocIds?: number[];
  /** Лента изменений целиком; не задана — не трогается */
  changes?: ChangeEntry[];
  synonyms?: Record<string, string[]>;
  meta?: {
    version: number;
    builtAt: string;
    checkedAt?: string;
    /** sha1 файлов этой версии из манифеста */
    files?: Record<string, string>;
    source?: DataSource;
  };
};

export type DataSource = 'seed' | 'central' | 'direct';

export function getDataFiles(db: Db): Record<string, string> {
  const raw = getMeta(db, 'data_files');
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

/** HTML правил санитизируется повторно — защита от подмены данных на CDN (§12) */
const clean = (html: string | undefined) => (html ? sanitizeRuleHtml(html) : html);

/** Вся запись — одной транзакцией: либо новая версия целиком, либо ничего */
export function applyData(db: Db, input: DataInput): void {
  const upsertCategory = db.prepare(
    `INSERT INTO categories (id, title, full_title, icon, sort) VALUES (@id, @title, @fullTitle, @icon, @order)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, full_title = excluded.full_title,
       icon = excluded.icon, sort = excluded.sort`,
  );
  const deleteDoc = db.prepare('DELETE FROM docs WHERE id = ?');
  const insertDoc = db.prepare(
    `INSERT INTO docs (id, category_id, title, url, author, created_at, edited_at, important, hash, parse_warning, sort)
     VALUES (@id, @categoryId, @title, @url, @author, @createdAt, @editedAt, @important, @hash, @parseWarning, @sort)`,
  );
  const insertSection = db.prepare(
    'INSERT INTO sections (id, doc_id, title, intro, sort) VALUES (@id, @docId, @title, @intro, @sort)',
  );
  const insertRule = db.prepare(
    `INSERT INTO rules (id, doc_id, section_id, number, depth, html, text, punish_raw, punish_kind, punish_kinds,
       punish_duration, notes_json, hash, sort)
     VALUES (@id, @docId, @sectionId, @number, @depth, @html, @text, @punishRaw, @punishKind, @punishKinds,
       @punishDuration, @notesJson, @hash, @sort)`,
  );
  const insertChange = db.prepare(
    `INSERT INTO changes (id, date, doc_id, doc_title, category_id, rule_id, rule_number, type, before_text, after_text, renumbered)
     VALUES (@id, @date, @docId, @docTitle, @categoryId, @ruleId, @ruleNumber, @type, @before, @after, @renumbered)`,
  );

  // порядок документа внутри категории — как в categories.json
  const docSort = new Map<number, number>();
  for (const c of input.categories) c.docIds.forEach((id, i) => docSort.set(id, i));

  db.transaction(() => {
    for (const c of input.categories) upsertCategory.run(c);

    for (const d of input.docs) {
      deleteDoc.run(d.id); // каскадом уходят разделы и пункты
      insertDoc.run({
        ...d,
        editedAt: d.editedAt ?? null,
        important: d.important ? 1 : 0,
        parseWarning: d.parseWarning ?? null,
        sort: docSort.get(d.id) ?? 0,
      });
      let ruleSort = 0;
      d.sections.forEach((s, si) => {
        insertSection.run({
          id: s.id,
          docId: d.id,
          title: s.title,
          intro: clean(s.intro) ?? null,
          sort: si,
        });
        for (const r of s.rules) {
          insertRule.run({
            id: r.id,
            docId: d.id,
            sectionId: s.id,
            number: r.number,
            depth: r.depth,
            html: clean(r.html),
            text: r.text,
            punishRaw: r.punishment?.raw ?? null,
            punishKind: r.punishment?.kind ?? null,
            punishKinds: r.punishment ? JSON.stringify(r.punishment.kinds) : null,
            punishDuration: r.punishment?.duration ?? null,
            notesJson: r.notes?.length
              ? JSON.stringify(r.notes.map((n) => ({ ...n, html: clean(n.html) })))
              : null,
            hash: r.hash,
            sort: ruleSort++,
          });
        }
      });
    }

    const keep = new Set(input.allDocIds ?? input.docs.map((d) => d.id));
    for (const { id } of db.prepare('SELECT id FROM docs').all() as { id: number }[])
      if (!keep.has(id)) deleteDoc.run(id);

    const catIds = new Set(input.categories.map((c) => c.id));
    for (const { id } of db.prepare('SELECT id FROM categories').all() as { id: string }[])
      if (!catIds.has(id)) db.prepare('DELETE FROM categories WHERE id = ?').run(id);

    if (input.changes) {
      db.prepare('DELETE FROM changes').run();
      for (const c of input.changes)
        insertChange.run({
          ...c,
          ruleId: c.ruleId ?? null,
          ruleNumber: c.ruleNumber ?? null,
          before: c.before ?? null,
          after: c.after ?? null,
          renumbered: c.renumbered ? 1 : 0,
        });
    }

    if (input.synonyms) setMeta(db, 'synonyms', JSON.stringify(input.synonyms));
    if (input.meta) {
      setMeta(db, 'data_version', input.meta.version);
      setMeta(db, 'data_built_at', input.meta.builtAt);
      if (input.meta.checkedAt) setMeta(db, 'data_checked_at', input.meta.checkedAt);
      if (input.meta.files) setMeta(db, 'data_files', JSON.stringify(input.meta.files));
      setMeta(db, 'data_source', input.meta.source ?? 'central');
    }
  })();
}

// ---------- чтение

type RuleRow = {
  id: string;
  doc_id: number;
  section_id: string;
  number: string | null;
  depth: number;
  html: string;
  text: string;
  punish_raw: string | null;
  punish_kind: PunishKind | null;
  punish_kinds: string | null;
  punish_duration: string | null;
  notes_json: string | null;
  hash: string;
};

function toRule(r: RuleRow): Rule {
  const rule: Rule = {
    id: r.id,
    number: r.number,
    depth: r.depth,
    html: r.html,
    text: r.text,
    hash: r.hash,
  };
  if (r.punish_raw && r.punish_kind) {
    rule.punishment = {
      raw: r.punish_raw,
      kind: r.punish_kind,
      kinds: r.punish_kinds ? (JSON.parse(r.punish_kinds) as PunishKind[]) : [r.punish_kind],
    };
    if (r.punish_duration) rule.punishment.duration = r.punish_duration;
  }
  if (r.notes_json) rule.notes = JSON.parse(r.notes_json) as Note[];
  return rule;
}

export function getCategories(db: Db): CategoryView[] {
  return db
    .prepare(
      `SELECT c.id, c.title, c.full_title AS fullTitle, c.icon, c.sort AS "order",
         (SELECT COUNT(*) FROM docs d WHERE d.category_id = c.id) AS docCount
       FROM categories c ORDER BY c.sort`,
    )
    .all() as CategoryView[];
}

export function getDocs(db: Db, categoryId: string): DocSummary[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.category_id AS categoryId, d.title, d.url, d.created_at AS createdAt, d.edited_at AS editedAt,
         d.important, (SELECT COUNT(*) FROM rules r WHERE r.doc_id = d.id) AS ruleCount
       FROM docs d WHERE d.category_id = ? ORDER BY d.sort, d.id`,
    )
    .all(categoryId) as (Omit<DocSummary, 'important' | 'editedAt'> & {
    important: number;
    editedAt: string | null;
  })[];
  return rows.map(({ editedAt, important, ...d }) => ({
    ...d,
    important: important === 1,
    ...(editedAt ? { editedAt } : {}),
  }));
}

export function getDoc(db: Db, docId: number): RuleDoc | null {
  const d = db.prepare('SELECT * FROM docs WHERE id = ?').get(docId) as
    | {
        id: number;
        category_id: string;
        title: string;
        url: string;
        author: string | null;
        created_at: string | null;
        edited_at: string | null;
        important: number;
        hash: string;
        parse_warning: string | null;
      }
    | undefined;
  if (!d) return null;
  const sections = db
    .prepare('SELECT id, title, intro FROM sections WHERE doc_id = ? ORDER BY sort')
    .all(docId) as { id: string; title: string | null; intro: string | null }[];
  const rules = db
    .prepare('SELECT * FROM rules WHERE doc_id = ? ORDER BY sort')
    .all(docId) as RuleRow[];
  const bySection = new Map<string, Rule[]>();
  for (const r of rules) {
    const list = bySection.get(r.section_id) ?? [];
    list.push(toRule(r));
    bySection.set(r.section_id, list);
  }
  const doc: RuleDoc = {
    id: d.id,
    categoryId: d.category_id,
    title: d.title,
    url: d.url,
    author: d.author ?? '',
    createdAt: d.created_at ?? '',
    important: d.important === 1,
    hash: d.hash,
    sections: sections.map((s): Section => ({
      id: s.id,
      title: s.title,
      ...(s.intro ? { intro: s.intro } : {}),
      rules: bySection.get(s.id) ?? [],
    })),
  };
  if (d.edited_at) doc.editedAt = d.edited_at;
  if (d.parse_warning) doc.parseWarning = d.parse_warning;
  return doc;
}

export function getRule(db: Db, ruleId: string): RuleView | null {
  const r = db
    .prepare(
      `SELECT r.*, d.title AS doc_title, d.url AS doc_url, d.category_id, s.title AS section_title
       FROM rules r JOIN docs d ON d.id = r.doc_id JOIN sections s ON s.id = r.section_id
       WHERE r.id = ?`,
    )
    .get(ruleId) as
    | (RuleRow & {
        doc_title: string;
        doc_url: string;
        category_id: string;
        section_title: string | null;
      })
    | undefined;
  if (!r) return null;
  return {
    ...toRule(r),
    docId: r.doc_id,
    docTitle: r.doc_title,
    docUrl: r.doc_url,
    categoryId: r.category_id,
    sectionTitle: r.section_title,
    path: r.section_title ? `${r.doc_title} › ${r.section_title}` : r.doc_title,
  };
}

export function getSearchCorpus(db: Db): SearchRow[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.doc_id AS docId, d.category_id AS categoryId, d.title AS docTitle, s.title AS sectionTitle,
         r.number, r.text, r.punish_kinds AS punishKinds, d.important
       FROM rules r JOIN docs d ON d.id = r.doc_id JOIN sections s ON s.id = r.section_id
       ORDER BY d.category_id, d.sort, r.sort`,
    )
    .all() as (Omit<SearchRow, 'punishKinds' | 'important'> & {
    punishKinds: string | null;
    important: number;
  })[];
  return rows.map((r) => ({
    ...r,
    punishKinds: r.punishKinds ? (JSON.parse(r.punishKinds) as PunishKind[]) : [],
    important: r.important === 1,
  }));
}

export function getSynonyms(db: Db): Record<string, string[]> {
  const raw = getMeta(db, 'synonyms');
  return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
}

/** Все документы — прошлая версия для direct-режима (diff и защита от поломки) */
export function getAllDocs(db: Db): Map<number, RuleDoc> {
  const ids = db.prepare('SELECT id FROM docs').all() as { id: number }[];
  return new Map(ids.map(({ id }) => [id, getDoc(db, id)!]));
}

/** Лента изменений в формате данных (без пометки «просмотрено») */
export function getChangeEntries(db: Db): ChangeEntry[] {
  return getChanges(db).map((c) => {
    const { seen, ...entry } = c;
    void seen;
    return entry;
  });
}

export function getChanges(db: Db, query: ChangesQuery = {}, now = new Date()): ChangeView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.days) {
    where.push('c.date >= ?');
    params.push(new Date(now.getTime() - query.days * 86_400_000).toISOString());
  }
  if (query.categoryId) {
    where.push('c.category_id = ?');
    params.push(query.categoryId);
  }
  const rows = db
    .prepare(
      `SELECT c.*, (s.change_id IS NOT NULL) AS seen FROM changes c
       LEFT JOIN changes_seen s ON s.change_id = c.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.date DESC, c.doc_id, c.rule_number`,
    )
    .all(...params) as {
    id: string;
    date: string;
    doc_id: number;
    doc_title: string;
    category_id: string | null;
    rule_id: string | null;
    rule_number: string | null;
    type: ChangeEntry['type'];
    before_text: string | null;
    after_text: string | null;
    renumbered: number;
    seen: number;
  }[];
  return rows.map((c) => {
    const v: ChangeView = {
      id: c.id,
      date: c.date,
      docId: c.doc_id,
      docTitle: c.doc_title,
      categoryId: c.category_id ?? '',
      type: c.type,
      seen: c.seen === 1,
    };
    if (c.rule_id) v.ruleId = c.rule_id;
    if (c.rule_number) v.ruleNumber = c.rule_number;
    if (c.before_text !== null) v.before = c.before_text;
    if (c.after_text !== null) v.after = c.after_text;
    if (c.renumbered) v.renumbered = true;
    return v;
  });
}

export function markChangesSeen(db: Db, ids?: string[]): void {
  if (!ids) {
    db.prepare('INSERT OR IGNORE INTO changes_seen (change_id) SELECT id FROM changes').run();
    return;
  }
  const ins = db.prepare('INSERT OR IGNORE INTO changes_seen (change_id) VALUES (?)');
  db.transaction(() => ids.forEach((id) => ins.run(id)))();
}

export function countUnseenChanges(db: Db): number {
  return (
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM changes c LEFT JOIN changes_seen s ON s.change_id = c.id WHERE s.change_id IS NULL',
      )
      .get() as { n: number }
  ).n;
}

/** Текст пункта, как он сохраняется в снимке избранного */
export function ruleSnapshot(r: Rule): string {
  return r.punishment ? `${r.text} | ${r.punishment.raw}` : r.text;
}

export function getFavorites(db: Db): Favorite[] {
  const rows = db
    .prepare('SELECT rule_id, snapshot, hash, added_at FROM favorites ORDER BY added_at DESC')
    .all() as {
    rule_id: string;
    snapshot: string | null;
    hash: string | null;
    added_at: string;
  }[];
  return rows.map((f) => {
    const rule = getRule(db, f.rule_id);
    return {
      ruleId: f.rule_id,
      snapshot: f.snapshot ?? '',
      addedAt: f.added_at,
      rule,
      changed: !!rule && !!f.hash && rule.hash !== f.hash,
    };
  });
}

export function getFavoriteIds(db: Db): string[] {
  return (db.prepare('SELECT rule_id FROM favorites').all() as { rule_id: string }[]).map(
    (r) => r.rule_id,
  );
}

export function toggleFavorite(db: Db, ruleId: string, now = new Date()): boolean {
  if (db.prepare('DELETE FROM favorites WHERE rule_id = ?').run(ruleId).changes) return false;
  const rule = getRule(db, ruleId);
  if (!rule) throw new Error(`пункт ${ruleId} не найден`);
  db.prepare('INSERT INTO favorites (rule_id, snapshot, hash, added_at) VALUES (?, ?, ?, ?)').run(
    ruleId,
    ruleSnapshot(rule),
    rule.hash,
    now.toISOString(),
  );
  return true;
}
