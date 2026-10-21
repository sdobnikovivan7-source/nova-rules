/**
 * Общие типы и zod-схемы данных правил.
 * Используются сборщиком, main-процессом и интерфейсом.
 */
import { z } from 'zod';

/** Формат публикуемых данных. Увеличивается при несовместимых изменениях. */
export const SCHEMA_VERSION = 1;

export const PUNISH_KINDS = [
  'jail',
  'warn',
  'ban',
  'mute',
  'kick',
  'demorgan',
  'blacklist',
  'reprimand', // выговор: устный / письменный / строгий
  'removal', // снятие с поста
  'territory', // возврат / передача территории
  'leaderWarn', // предупреждение лидеру
  'cancel', // отмена / переигровка / откат мероприятия
  'restriction', // запрет на статус, заявки и т.п.
  'other',
] as const;

export const PunishKindSchema = z.enum(PUNISH_KINDS);
export type PunishKind = z.infer<typeof PunishKindSchema>;

export const PunishmentSchema = z.object({
  raw: z.string().min(1),
  kind: PunishKindSchema,
  /** Все найденные типы, если наказание составное («WARN/BAN»). Первый совпадает с kind. */
  kinds: z.array(PunishKindSchema).min(1),
  duration: z.string().optional(),
});
export type Punishment = z.infer<typeof PunishmentSchema>;

export const NOTE_TYPES = ['note', 'exception', 'example', 'clarification', 'addition'] as const;
export const NoteTypeSchema = z.enum(NOTE_TYPES);
export type NoteType = z.infer<typeof NoteTypeSchema>;

export const NoteSchema = z.object({
  type: NoteTypeSchema,
  html: z.string(),
  text: z.string(),
});
export type Note = z.infer<typeof NoteSchema>;

export const RuleSchema = z.object({
  /** «406244:1.1» или «406244:p3», если номера нет */
  id: z.string().min(1),
  number: z.string().nullable(),
  depth: z.number().int().min(0),
  /** Очищенный HTML пункта (без наказания и примечаний) */
  html: z.string(),
  /** Плоский текст для поиска */
  text: z.string(),
  punishment: PunishmentSchema.optional(),
  notes: z.array(NoteSchema).optional(),
  hash: z.string(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const SectionSchema = z.object({
  /** «<docId>:s<n>» */
  id: z.string().min(1),
  title: z.string().nullable(),
  /** HTML до первого пункта раздела */
  intro: z.string().optional(),
  rules: z.array(RuleSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const RuleDocSchema = z.object({
  /** threadId */
  id: z.number().int().positive(),
  categoryId: z.string(),
  title: z.string().min(1),
  url: z.url(),
  author: z.string(),
  createdAt: z.string(),
  /** Дата последней правки первого поста, если она есть */
  editedAt: z.string().optional(),
  important: z.boolean(),
  sections: z.array(SectionSchema),
  hash: z.string(),
  parseWarning: z.string().optional(),
});
export type RuleDoc = z.infer<typeof RuleDocSchema>;

export const CategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  fullTitle: z.string(),
  icon: z.string(),
  order: z.number().int(),
  docIds: z.array(z.number().int()),
});
export type Category = z.infer<typeof CategorySchema>;

export const CHANGE_TYPES = ['added', 'removed', 'changed', 'doc_added', 'doc_removed'] as const;

export const ChangeEntrySchema = z.object({
  /** Стабильный id, чтобы отмечать «просмотрено» */
  id: z.string(),
  date: z.string(),
  docId: z.number().int(),
  docTitle: z.string(),
  categoryId: z.string(),
  ruleId: z.string().optional(),
  ruleNumber: z.string().optional(),
  type: z.enum(CHANGE_TYPES),
  before: z.string().optional(),
  after: z.string().optional(),
  renumbered: z.boolean().optional(),
});
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.number().int(),
  /** Увеличивается при каждом изменении данных */
  version: z.number().int().min(0),
  /** Когда данные последний раз изменились */
  builtAt: z.string(),
  /** Когда сборщик последний раз успешно проверил форум */
  checkedAt: z.string(),
  /** Путь относительно data/ → sha1 содержимого */
  files: z.record(z.string(), z.string()),
  warnings: z.array(z.string()).optional(),
  minAppVersion: z.string().optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const SourceCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  fullTitle: z.string(),
  icon: z.string(),
  order: z.number().int(),
  forumId: z.number().int().optional(),
  threadIds: z.array(z.number().int()).optional(),
});
export type SourceCategory = z.infer<typeof SourceCategorySchema>;

export const SourcesConfigSchema = z.object({
  baseUrl: z.url(),
  userAgent: z.string(),
  categories: z.array(SourceCategorySchema).min(1),
});
export type SourcesConfig = z.infer<typeof SourcesConfigSchema>;

/**
 * Поправки к пунктам (config/overrides.json): администрация объявляет правки постом-журналом
 * («Было / Стало»), а первый пост темы правит позже. Поправка применяется, только пока текст
 * пункта на форуме равен `expect`; когда первый пост исправят, она перестаёт действовать сама.
 */
export const RuleOverrideSchema = z.object({
  /** ID пункта, например «406242:2.1» */
  id: z.string().min(1),
  /** Пост с объявлением правки */
  source: z.url(),
  /** Текст пункта на форуме, к которому относится поправка */
  expect: z.string().min(1),
  text: z.string().min(1),
  /** Новое наказание; не указано — остаётся как на форуме */
  punishment: z.string().min(1).optional(),
  /** Новые примечания; не указаны — остаются как на форуме */
  notes: z.array(z.object({ type: NoteTypeSchema, text: z.string().min(1) })).optional(),
});
export type RuleOverride = z.infer<typeof RuleOverrideSchema>;
export const OverridesSchema = z.object({ rules: z.array(RuleOverrideSchema) });
export type Overrides = z.infer<typeof OverridesSchema>;

/** Ключ — то, что вводит игрок; значения — как это написано в правилах. */
export const SynonymsSchema = z.record(z.string(), z.union([z.array(z.string()), z.string()]));
export type Synonyms = Record<string, string[]>;

/**
 * data/stats.json — примерное число игроков (этап 12). Считает stats.yml по публичной
 * статистике jsDelivr: приложение запрашивает этот файл раз в день, запросы за день ≈ игроки.
 * В manifest.json не входит: версия данных от него не меняется.
 */
export const StatsSchema = z.object({
  /** Среднее число запросов stats.json в день за `days` последних полных дней */
  players: z.number().int().min(0),
  days: z.number().int().min(0),
  updatedAt: z.string(),
});
export type Stats = z.infer<typeof StatsSchema>;
