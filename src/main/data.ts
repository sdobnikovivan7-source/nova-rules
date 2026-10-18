/**
 * Чтение опубликованных данных (`manifest.json` + файлы) из каталога: seed при первом
 * запуске. Каждый файл сверяется с sha1 из манифеста и проверяется zod-схемой.
 * Без Electron — тестируется в vitest.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  CategorySchema,
  ChangeEntrySchema,
  type Manifest,
  ManifestSchema,
  RuleDocSchema,
  SCHEMA_VERSION,
  SynonymsSchema,
} from '@shared/schema';
import type { DataInput } from './db/repo';

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export function normalizeSynonyms(raw: z.infer<typeof SynonymsSchema>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
}

export class SchemaVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`schemaVersion ${schemaVersion} не поддерживается (нужна ${SCHEMA_VERSION})`);
  }
}

export class IntegrityError extends Error {}

/** id документа из пути `docs/<id>.json` */
export const docIdOf = (file: string) => Number(file.slice('docs/'.length, -'.json'.length));

/**
 * Разбор файлов данных по манифесту. `files` — путь относительно data/ → содержимое.
 *
 * `partial` — синхронизация: переданы только изменившиеся файлы (плюс всегда
 * categories.json). Документы, которых нет в `files`, остаются в БД как есть.
 */
export function parseData(
  manifest: Manifest,
  files: Map<string, string>,
  opts: { partial?: boolean } = {},
): DataInput {
  if (manifest.schemaVersion !== SCHEMA_VERSION)
    throw new SchemaVersionError(manifest.schemaVersion);
  const get = (name: string) => {
    const text = files.get(name);
    if (text === undefined) throw new IntegrityError(`нет файла ${name}`);
    const expected = manifest.files[name];
    if (expected && sha1(text) !== expected) throw new IntegrityError(`sha1 не совпадает: ${name}`);
    return JSON.parse(text) as unknown;
  };
  const has = (name: string) => !opts.partial || files.has(name);

  const docNames = Object.keys(manifest.files).filter((f) => f.startsWith('docs/'));
  const docs = docNames.filter(has).map((f) => RuleDocSchema.parse(get(f)));
  return {
    categories: z.array(CategorySchema).parse(get('categories.json')),
    docs,
    allDocIds: docNames.map(docIdOf),
    ...(has('changes.json')
      ? { changes: z.array(ChangeEntrySchema).parse(get('changes.json')) }
      : {}),
    ...(has('synonyms.json')
      ? { synonyms: normalizeSynonyms(SynonymsSchema.parse(get('synonyms.json'))) }
      : {}),
    meta: {
      version: manifest.version,
      builtAt: manifest.builtAt,
      checkedAt: manifest.checkedAt,
      files: manifest.files,
    },
  };
}

export async function readDataDir(dir: string): Promise<DataInput> {
  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')),
  );
  const files = new Map<string, string>();
  for (const name of Object.keys(manifest.files))
    files.set(name, await readFile(path.join(dir, name), 'utf8'));
  return parseData(manifest, files);
}
