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

/** Разбор файлов данных по манифесту. `files` — путь относительно data/ → содержимое. */
export function parseData(manifest: Manifest, files: Map<string, string>): DataInput {
  if (manifest.schemaVersion !== SCHEMA_VERSION)
    throw new Error(
      `schemaVersion ${manifest.schemaVersion} не поддерживается (нужна ${SCHEMA_VERSION})`,
    );
  const get = (name: string) => {
    const text = files.get(name);
    if (text === undefined) throw new Error(`нет файла ${name}`);
    const expected = manifest.files[name];
    if (expected && sha1(text) !== expected) throw new Error(`sha1 не совпадает: ${name}`);
    return JSON.parse(text) as unknown;
  };
  const docNames = Object.keys(manifest.files).filter((f) => f.startsWith('docs/'));
  const docs = docNames.map((f) => RuleDocSchema.parse(get(f)));
  return {
    categories: z.array(CategorySchema).parse(get('categories.json')),
    docs,
    allDocIds: docs.map((d) => d.id),
    changes: z.array(ChangeEntrySchema).parse(get('changes.json')),
    synonyms: normalizeSynonyms(SynonymsSchema.parse(get('synonyms.json'))),
    meta: { version: manifest.version, builtAt: manifest.builtAt, checkedAt: manifest.checkedAt },
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
