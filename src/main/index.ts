/**
 * Точка входа main-процесса: один экземпляр, логи, БД, IPC, главное окно.
 *
 * Все данные — в %APPDATA%/NovaRules (nova.db, settings.json, logs/), а не в
 * %APPDATA%/nova-rules по имени пакета.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, net } from 'electron';
import log from 'electron-log/main';
import updaterPkg from 'electron-updater';
import { EVENTS } from '@shared/ipc';
import { OverridesSchema, SourcesConfigSchema } from '@shared/schema';
import overridesJson from '../../config/overrides.json';
import sourcesJson from '../../config/sources.json';
import { applyAutostart, HIDDEN_ARG, syncAutostart } from './autostart';
import { openDb } from './db';
import * as repo from './db/repo';
import {
  changeQuickHotkey,
  hotkeyRegistered,
  registerQuickHotkey,
  setHotkeyPaused,
  unregisterHotkeys,
} from './hotkeys';
import { installImageProtocol, registerImageScheme } from './images';
import { registerIpc } from './ipc';
import { notifyChanges } from './notifications';
import { installSecurity } from './security';
import { seedIfEmpty } from './seed';
import { getSettings, markRestartHidden, takeRestartHidden } from './settings';
import { applyTheme, watchTheme } from './theme';
import { AppTray } from './tray';
import { SyncService } from './sync';
import { DATA_BASES } from './sync/endpoints';
import { scheduleSync } from './sync/schedule';
import { UpdateService } from './updater';
import {
  createMainWindow,
  getMainWindow,
  showMainWindow,
  toggleMainWindow,
} from './windows/mainWindow';
import { createQuickWindow, getQuickWindow, showQuick, toggleQuick } from './windows/quickWindow';

// отдельная папка данных — демо-база, проверка сборки без своих данных (в т.ч. установленной).
// Сборка с другим именем пакета (проверка автообновления) — тоже в своей папке: установщик
// перезапускает приложение без переменных окружения, а данные игрока трогать нельзя.
const customUserData = process.env['NOVA_USER_DATA'];
const pkgName = (
  JSON.parse(readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { name: string }
).name;
const dataDir = pkgName === 'nova-rules' ? 'NovaRules' : pkgName;
app.setPath('userData', customUserData ?? path.join(app.getPath('appData'), dataDir));
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
  const overrides = OverridesSchema.parse(overridesJson);
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

  const updates = new UpdateService({
    updater: updaterPkg.autoUpdater,
    emit: (status) => broadcast(EVENTS.updateStatus, status),
    log: (level, msg) => log[level](msg),
    // главное окно в трее или свёрнуто, быстрый поиск закрыт
    isIdle: () => {
      const main = getMainWindow();
      const mainAway = !main || !main.isVisible() || main.isMinimized();
      return mainAway && !getQuickWindow()?.isVisible();
    },
    beforeAutoInstall: markRestartHidden,
  });
  updaterPkg.autoUpdater.logger = log;

  const sync = new SyncService({
    db,
    // net.fetch — сетевой стек Chromium: системный прокси и сертификаты
    fetch: (url, init) => net.fetch(url, init),
    bases: DATA_BASES,
    appVersion: app.getVersion(),
    getMode: () => getSettings().syncMode,
    // сборщик (cheerio и пр.) нужен только в режиме «С форума» — грузится по первому вызову
    direct: async () =>
      (await import('./sync/direct')).scrapeDirect({
        db,
        sources,
        overrides,
        log: (m) => log.info(`direct: ${m}`),
      }),
    emit: (status) => {
      broadcast(EVENTS.syncStatus, status);
      // данные требуют версию новее — сразу искать обновление приложения
      if (status.appOutdated && app.isPackaged) void updates.check();
    },
    onUpdated: ({ newChanges }) => {
      broadcast(EVENTS.dataUpdated);
      updateTray();
      if (getSettings().notifyChanges) notifyChanges(newChanges, () => openRoute('/changes'));
    },
    log: (level, msg) => log[level](msg),
  });

  const settings = getSettings();
  // занятое сочетание освободилось — окна перечитают «занято / свободно»
  registerQuickHotkey(settings.hotkey, toggleQuick, () =>
    broadcast(EVENTS.settingsChanged, getSettings()),
  );
  app.on('will-quit', unregisterHotkeys);
  syncAutostart(settings.autostart);

  registerIpc({
    db,
    logsDir,
    sync,
    updates,
    changeHotkey: (accel) => changeQuickHotkey(accel, toggleQuick),
    hotkeyRegistered,
    pauseHotkey: setHotkeyPaused,
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
  if (app.isPackaged) app.on('will-quit', updates.schedule());

  // автозапуск (--hidden), «Сразу сворачивать в трей» и перезапуск после тихого автообновления —
  // окно создаётся, но не показывается
  const restartHidden = takeRestartHidden();
  const hidden = process.argv.includes(HIDDEN_ARG) || settings.startMinimized || restartHidden;
  log.info(
    restartHidden
      ? 'старт в трей после автообновления'
      : hidden
        ? 'старт свёрнутым в трей'
        : 'старт с окном',
  );
  createMainWindow({ show: !hidden });
  // быстрый поиск создаётся заранее — по горячей клавише открывается мгновенно
  createQuickWindow();

  // окна закрыты (крестик без трея) — выход; иначе приложение живёт в трее
  app.on('window-all-closed', () => app.quit());
}
