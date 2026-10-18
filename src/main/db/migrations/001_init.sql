-- Схема по §8.2 плана. Отличия: categories.full_title, docs.edited_at,
-- rules.section_sort / punish_kinds (составные наказания «WARN/BAN»).

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);                                      -- data_version, data_built_at, last_sync_at, last_sync_status, mode, synonyms

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  full_title TEXT NOT NULL,
  icon       TEXT,
  sort       INTEGER NOT NULL
);

CREATE TABLE docs (
  id            INTEGER PRIMARY KEY,    -- threadId
  category_id   TEXT NOT NULL REFERENCES categories(id),
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  author        TEXT,
  created_at    TEXT,
  edited_at     TEXT,
  important     INTEGER NOT NULL DEFAULT 0,
  hash          TEXT NOT NULL,
  parse_warning TEXT,
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_docs_category ON docs(category_id);

CREATE TABLE sections (
  id     TEXT PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  title  TEXT,
  intro  TEXT,
  sort   INTEGER NOT NULL
);
CREATE INDEX idx_sections_doc ON sections(doc_id);

CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  doc_id          INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  section_id      TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  number          TEXT,
  depth           INTEGER NOT NULL,
  html            TEXT NOT NULL,
  text            TEXT NOT NULL,
  punish_raw      TEXT,
  punish_kind     TEXT,
  punish_kinds    TEXT,                  -- JSON-массив PunishKind
  punish_duration TEXT,
  notes_json      TEXT,
  hash            TEXT NOT NULL,
  sort            INTEGER NOT NULL
);
CREATE INDEX idx_rules_doc ON rules(doc_id);
CREATE INDEX idx_rules_section ON rules(section_id);

CREATE TABLE changes (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  doc_id      INTEGER NOT NULL,
  doc_title   TEXT NOT NULL,
  category_id TEXT,
  rule_id     TEXT,
  rule_number TEXT,
  type        TEXT NOT NULL,
  before_text TEXT,
  after_text  TEXT,
  renumbered  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_changes_date ON changes(date DESC);

-- ниже — данные пользователя, синхронизация их не трогает

CREATE TABLE changes_seen (
  change_id TEXT PRIMARY KEY
);

CREATE TABLE favorites (
  rule_id  TEXT PRIMARY KEY,            -- без FK: пункт может исчезнуть, закладка останется с пометкой
  snapshot TEXT,                        -- текст пункта на момент добавления
  hash     TEXT,                        -- хеш пункта на момент добавления: «изменён с момента добавления»
  added_at TEXT NOT NULL
);
