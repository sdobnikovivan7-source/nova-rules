/**
 * Точка входа main-процесса: один экземпляр, логи, БД, IPC, главное окно.
 *
 * Все данные — в %APPDATA%/NovaRules (nova.db, settings.json, logs/), а не в
 * %APPDATA%/nova-rules по имени пакета.
 */
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';
import { openDb } from './db';
import { registerIpc } from './ipc';
import { installSecurity } from './security';
import { seedIfEmpty } from './seed';
import { getSettings } from './settings';
import { createMainWindow, showMainWindow } from './windows/mainWindow';

app.setPath('userData', path.join(app.getPath('appData'), 'NovaRules'));
app.setAppUserModelId('com.novarules.app');

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

  const db = openDb(path.join(app.getPath('userData'), 'nova.db'));
  app.on('will-quit', () => db.close());
  await seedIfEmpty(db);
  registerIpc({ db, logsDir });

  // --hidden (автозапуск) и «сразу в трей» заработают с треем на этапе 8 — без трея скрытое окно не вернуть
  const canHide = false;
  const hidden = canHide && (process.argv.includes('--hidden') || getSettings().startMinimized);
  createMainWindow({ show: !hidden });

  // трея пока нет — закрытие окна завершает приложение
  app.on('window-all-closed', () => app.quit());
}
