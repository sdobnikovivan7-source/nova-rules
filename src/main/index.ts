/**
 * Точка входа main-процесса: один экземпляр, логи, БД, IPC, главное окно.
 *
 * Все данные — в %APPDATA%/NovaRules (nova.db, settings.json, logs/), а не в
 * %APPDATA%/nova-rules по имени пакета.
 */
import path from 'node:path';
import { app, BrowserWindow, Menu, net } from 'electron';
import log from 'electron-log/main';
import { EVENTS } from '@shared/ipc';
import { SourcesConfigSchema } from '@shared/schema';
import sourcesJson from '../../config/sources.json';
import { openDb } from './db';
import { installImageProtocol, registerImageScheme } from './images';
import { registerIpc } from './ipc';
import { installSecurity } from './security';
import { seedIfEmpty } from './seed';
import { getSettings } from './settings';
import { applyTheme, watchTheme } from './theme';
import { SyncService } from './sync';
import { scrapeDirect } from './sync/direct';
import { DATA_BASES } from './sync/endpoints';
import { scheduleSync } from './sync/schedule';
import { createMainWindow, showMainWindow } from './windows/mainWindow';

// в dev можно запустить на отдельной папке данных (демо-база, проверка без своих данных)
const devUserData = !app.isPackaged ? process.env['NOVA_USER_DATA'] : undefined;
app.setPath('userData', devUserData ?? path.join(app.getPath('appData'), 'NovaRules'));
app.setAppUserModelId('com.novarules.app');
registerImageScheme();

const logsDir = path.join(app.getPath('userData'), 'logs');
log.transports.file.resolvePathFn = () => path.join(logsDir, 'main.log');
log.transports.file.maxSize = 2 * 1024 * 1024;
log.initialize();
log.errorHandler.startCatching();

if (!app.requestSingleInstanceLock()) {
  // уже запущено: второй экземпляр отдаёт управление первому и выходит сразу,
  // не дожидаясь инициализации Chromium (иначе он лезет в занятый кеш первого)
  app.exit(0);
} else {
  app.on('second-instance', () => showMainWindow());
  void start();
}

async function start() {
  await app.whenReady();
  log.info(
    `NOVA Rules ${app.getVersion()} (Electron ${process.versions.electron}), ${app.isPackaged ? 'prod' : 'dev'}`,
  );
  installSecurity();
  // своё меню не нужно: окно без рамки, а стандартное добавляет зум и перезагрузку страницы
  Menu.setApplicationMenu(null);
  applyTheme(getSettings().theme);
  watchTheme();
  installImageProtocol(path.join(app.getPath('userData'), 'images'));

  const db = openDb(path.join(app.getPath('userData'), 'nova.db'));
  app.on('will-quit', () => db.close());
  await seedIfEmpty(db);

  const sources = SourcesConfigSchema.parse(sourcesJson);
  const broadcast = (channel: string, ...args: unknown[]) =>
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, ...args));
  const sync = new SyncService({
    db,
    // net.fetch — сетевой стек Chromium: системный прокси и сертификаты
    fetch: (url, init) => net.fetch(url, init),
    bases: DATA_BASES,
    appVersion: app.getVersion(),
    getMode: () => getSettings().syncMode,
    direct: () => scrapeDirect({ db, sources, log: (m) => log.info(`direct: ${m}`) }),
    emit: (status) => broadcast(EVENTS.syncStatus, status),
    // уведомление о новых изменениях — этап 8.4
    onUpdated: () => broadcast(EVENTS.dataUpdated),
    log: (level, msg) => log[level](msg),
  });
  registerIpc({ db, logsDir, sync });
  const stopSync = scheduleSync(sync);
  app.on('will-quit', stopSync);

  // --hidden (автозапуск) и «сразу в трей» заработают с треем на этапе 8 — без трея скрытое окно не вернуть
  const canHide = false;
  const hidden = canHide && (process.argv.includes('--hidden') || getSettings().startMinimized);
  createMainWindow({ show: !hidden });

  // трея пока нет — закрытие окна завершает приложение
  app.on('window-all-closed', () => app.quit());
}
