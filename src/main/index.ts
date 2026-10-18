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
import { applyAutostart, HIDDEN_ARG, syncAutostart } from './autostart';
import { openDb } from './db';
import * as repo from './db/repo';
import {
  changeQuickHotkey,
  hotkeyRegistered,
  registerQuickHotkey,
  unregisterHotkeys,
} from './hotkeys';
import { installImageProtocol, registerImageScheme } from './images';
import { registerIpc } from './ipc';
import { notifyChanges } from './notifications';
import { installSecurity } from './security';
import { seedIfEmpty } from './seed';
import { getSettings } from './settings';
import { applyTheme, watchTheme } from './theme';
import { AppTray } from './tray';
import { SyncService } from './sync';
import { scrapeDirect } from './sync/direct';
import { DATA_BASES } from './sync/endpoints';
import { scheduleSync } from './sync/schedule';
import {
  createMainWindow,
  getMainWindow,
  showMainWindow,
  toggleMainWindow,
} from './windows/mainWindow';
import { createQuickWindow, showQuick, toggleQuick } from './windows/quickWindow';

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

  /** Показать главное окно на нужном экране (трей, уведомление, быстрый поиск) */
  const openRoute = (route: string) => {
    showMainWindow();
    getMainWindow()?.webContents.send(EVENTS.navigate, route);
  };

  const tray = new AppTray({
    toggleMain: toggleMainWindow,
    openMain: showMainWindow,
    openQuick: showQuick,
    openChanges: () => openRoute('/changes'),
    syncNow: () => void sync.run({ manual: true }),
    quit: () => app.quit(),
  });
  app.on('will-quit', () => tray.destroy());
  const updateTray = () =>
    tray.update({
      unseen: repo.countUnseenChanges(db),
      dataBuiltAt: repo.getMeta(db, 'data_built_at'),
      quickHotkey: getSettings().hotkey,
    });

  const sync = new SyncService({
    db,
    // net.fetch — сетевой стек Chromium: системный прокси и сертификаты
    fetch: (url, init) => net.fetch(url, init),
    bases: DATA_BASES,
    appVersion: app.getVersion(),
    getMode: () => getSettings().syncMode,
    direct: () => scrapeDirect({ db, sources, log: (m) => log.info(`direct: ${m}`) }),
    emit: (status) => broadcast(EVENTS.syncStatus, status),
    onUpdated: ({ newChanges }) => {
      broadcast(EVENTS.dataUpdated);
      updateTray();
      if (getSettings().notifyChanges) notifyChanges(newChanges, () => openRoute('/changes'));
    },
    log: (level, msg) => log[level](msg),
  });

  const settings = getSettings();
  registerQuickHotkey(settings.hotkey, toggleQuick);
  app.on('will-quit', unregisterHotkeys);
  syncAutostart(settings.autostart);

  registerIpc({
    db,
    logsDir,
    sync,
    changeHotkey: (accel) => changeQuickHotkey(accel, toggleQuick),
    hotkeyRegistered,
    onSettingsChanged: (next, before) => {
      if (next.theme !== before.theme) applyTheme(next.theme);
      // сменили источник данных — сразу проверить им
      if (next.syncMode !== before.syncMode) void sync.run({ manual: true });
      if (next.autostart !== before.autostart) applyAutostart(next.autostart);
      if (next.hotkey !== before.hotkey) updateTray();
    },
    onUserStateChanged: updateTray,
  });
  updateTray();
  const stopSync = scheduleSync(sync);
  app.on('will-quit', stopSync);

  // автозапуск (--hidden) и «Сразу сворачивать в трей» — окно создаётся, но не показывается
  const hidden = process.argv.includes(HIDDEN_ARG) || settings.startMinimized;
  log.info(hidden ? 'старт свёрнутым в трей' : 'старт с окном');
  createMainWindow({ show: !hidden });
  // быстрый поиск создаётся заранее — по горячей клавише открывается мгновенно
  createQuickWindow();

  // окна закрыты (крестик без трея) — выход; иначе приложение живёт в трее
  app.on('window-all-closed', () => app.quit());
}
