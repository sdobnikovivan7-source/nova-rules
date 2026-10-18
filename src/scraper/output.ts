/**
 * Запись публикуемых данных:
 *
 *   data/manifest.json     — версия, даты, sha1 каждого файла, предупреждения
 *   data/categories.json
 *   data/docs/<id>.json    — одна тема = один файл
 *   data/changes.json      — изменения за 180 дней
 *   data/synonyms.json     — словарь сленга (едет вместе с данными)
 *   data/official-notes.json — журналы правок администрации (в манифест не входит, на будущее)
 *
 * Приложение качает manifest и только те файлы, у которых сменился sha1.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type Category,
  type ChangeEntry,
  type Manifest,
  ManifestSchema,
  type RuleDoc,
  SCHEMA_VERSION,
} from '@shared/schema';
import type { OfficialNote } from './parse/thread';

export type OutputInput = {
  categories: Category[];
  docs: RuleDoc[];
  changes: ChangeEntry[];
  /** Содержимое config/synonyms.json как есть */
  synonyms: string;
  officialNotes?: Record<number, OfficialNote[]>;
  warnings: string[];
  prevManifest?: Manifest;
  minAppVersion?: string;
  now: Date;
};

export type OutputResult = { manifest: Manifest; changed: boolean };

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

/** Сериализация файлов данных (без записи на диск): путь → содержимое */
export function serializeData(input: OutputInput): Map<string, string> {
  const files = new Map<string, string>();
  files.set('categories.json', JSON.stringify(input.categories));
  for (const doc of [...input.docs].sort((a, b) => a.id - b.id))
    files.set(`docs/${doc.id}.json`, JSON.stringify(doc));
  files.set('changes.json', JSON.stringify(input.changes));
  files.set('synonyms.json', JSON.stringify(JSON.parse(input.synonyms)));
  return files;
}

export function buildManifest(files: Map<string, string>, input: OutputInput): OutputResult {
  const hashes = Object.fromEntries([...files].map(([p, body]) => [p, sha1(body)]));
  const prev = input.prevManifest;
  const prevFiles = prev?.files ?? {};
  const changed =
    !prev ||
    Object.keys(hashes).length !== Object.keys(prevFiles).length ||
    Object.entries(hashes).some(([p, h]) => prevFiles[p] !== h);
  const now = input.now.toISOString();

  const manifest: Manifest = ManifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    version: prev ? prev.version + (changed ? 1 : 0) : 1,
    builtAt: changed || !prev ? now : prev.builtAt,
    checkedAt: now,
    files: hashes,
    ...(input.warnings.length ? { warnings: input.warnings } : {}),
    ...(input.minAppVersion ? { minAppVersion: input.minAppVersion } : {}),
  });
  return { manifest, changed };
}

export async function writeData(dir: string, input: OutputInput): Promise<OutputResult> {
  const files = serializeData(input);
  const result = buildManifest(files, input);

  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, 'docs'), { recursive: true });
  for (const [p, body] of files) await writeFile(path.join(dir, p), body);
  await writeFile(path.join(dir, 'official-notes.json'), JSON.stringify(input.officialNotes ?? {}));
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
  return result;
}

/** Прошлая версия данных: манифест и изменения (если есть) */
export async function readPrevMeta(dir: string): Promise<{ manifest?: Manifest; changes: ChangeEntry[] }> {
  const read = async (p: string) => {
    try {
      return JSON.parse(await readFile(path.join(dir, p), 'utf8')) as unknown;
    } catch {
      return undefined;
    }
  };
  const m = ManifestSchema.safeParse(await read('manifest.json'));
  const changes = (await read('changes.json')) as ChangeEntry[] | undefined;
  return { manifest: m.success ? m.data : undefined, changes: Array.isArray(changes) ? changes : [] };
}
