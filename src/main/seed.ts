/**
 * Первый запуск (§7.4): пустая БД наполняется из снимка данных, встроенного в установщик,
 * — правила доступны сразу, без сети.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';
import { readDataDir } from './data';
import type { Db } from './db';
import { applyData, getDataVersion } from './db/repo';

export function seedDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'seed')
    : path.join(app.getAppPath(), 'resources', 'seed');
}

/** → true, если база наполнена из seed */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  if (getDataVersion(db) > 0) return false;
  const dir = seedDir();
  if (!existsSync(path.join(dir, 'manifest.json'))) {
    log.warn(`seed: нет снимка данных в ${dir} — база пуста до первой синхронизации`);
    return false;
  }
  const started = Date.now();
  try {
    const data = await readDataDir(dir);
    applyData(db, data);
    log.info(
      `seed: версия ${data.meta?.version}, тем ${data.docs.length} за ${Date.now() - started} мс`,
    );
    return true;
  } catch (e) {
    log.error('seed: снимок данных не прочитан', e);
    return false;
  }
}
