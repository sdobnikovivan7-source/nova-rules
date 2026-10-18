/**
 * Обработчики `window.api` (§9). Аргументы из renderer не доверенные — каждый
 * проверяется zod-схемой до вызова обработчика.
 */
import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import log from 'electron-log/main';
import { z } from 'zod';
import {
  COMMANDS,
  EVENTS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  type InvokeApi,
  invokeChannel,
  type SyncStatus,
} from '@shared/ipc';
import type { Db } from './db';
import * as repo from './db/repo';
import { formatRuleForCopy } from './format';
import { openExternalSafe } from './security';
import { getSettings, setSettings } from './settings';
import { getMainWindow, showMainWindow } from './windows/mainWindow';

export type IpcContext = { db: Db; logsDir: string };

const ruleId = z.string().min(1).max(200);

const SettingsPatch = z
  .object({
    theme: z.enum(['dark', 'light', 'system']),
    fontScale: z.number().min(FONT_SCALE_MIN).max(FONT_SCALE_MAX),
    autostart: z.boolean(),
    startMinimized: z.boolean(),
    closeToTray: z.boolean(),
    hotkey: z.string().min(1).max(100),
    quickAlwaysOnTop: z.boolean(),
    notifyChanges: z.boolean(),
    syncMode: z.enum(['auto', 'direct']),
  })
  .partial()
  .strict();

/** Схемы аргументов каждого метода (кортеж) */
const ARGS: { [K in keyof InvokeApi]: z.ZodType<Parameters<InvokeApi[K]>> } = {
  getCategories: z.tuple([]),
  getDocs: z.tuple([z.string().min(1).max(50)]),
  getDoc: z.tuple([z.number().int().positive()]),
  getRule: z.tuple([ruleId]),
  getSearchCorpus: z.tuple([]),
  getSynonyms: z.tuple([]),
  getChanges: z
    .tuple([
      z
        .object({ days: z.number().int().positive().max(3650), categoryId: z.string().max(50) })
        .partial()
        .strict(),
    ])
    .or(z.tuple([])),
  markChangesSeen: z.tuple([z.array(z.string().max(500)).max(10_000)]).or(z.tuple([])),
  getFavorites: z.tuple([]),
  toggleFavorite: z.tuple([ruleId]),
  syncNow: z.tuple([]),
  getSyncStatus: z.tuple([]),
  openExternal: z.tuple([z.string().max(2000)]),
  copyRule: z.tuple([ruleId]),
  getSettings: z.tuple([]),
  setSettings: z.tuple([SettingsPatch]),
  openLogsFolder: z.tuple([]),
  getAppInfo: z.tuple([]),
} as never;

export function syncStatus(db: Db): SyncStatus {
  // настоящая синхронизация — этап 4; пока статус собирается из meta
  const status: SyncStatus = {
    state: 'idle',
    mode: 'central',
    dataVersion: repo.getDataVersion(db),
  };
  const builtAt = repo.getMeta(db, 'data_built_at');
  const lastSync = repo.getMeta(db, 'last_sync_at');
  if (builtAt) status.dataBuiltAt = builtAt;
  if (lastSync) status.lastSuccessAt = lastSync;
  return status;
}

export function registerIpc({ db, logsDir }: IpcContext): void {
  const impl: InvokeApi = {
    getCategories: async () => repo.getCategories(db),
    getDocs: async (categoryId) => repo.getDocs(db, categoryId),
    getDoc: async (docId) => repo.getDoc(db, docId),
    getRule: async (id) => repo.getRule(db, id),
    getSearchCorpus: async () => repo.getSearchCorpus(db),
    getSynonyms: async () => repo.getSynonyms(db),
    getChanges: async (query) => repo.getChanges(db, query),
    markChangesSeen: async (ids) => repo.markChangesSeen(db, ids),
    getFavorites: async () => repo.getFavorites(db),
    toggleFavorite: async (id) => repo.toggleFavorite(db, id),
    syncNow: async () => log.info('syncNow: синхронизация появится на этапе 4'),
    getSyncStatus: async () => syncStatus(db),
    openExternal: (url) => openExternalSafe(url),
    copyRule: async (id) => {
      const rule = repo.getRule(db, id);
      if (!rule) throw new Error(`пункт ${id} не найден`);
      clipboard.writeText(formatRuleForCopy(rule));
    },
    getSettings: async () => getSettings(),
    setSettings: async (patch) => setSettings(patch),
    openLogsFolder: async () => void (await shell.openPath(logsDir)),
    getAppInfo: async () => {
      const builtAt = repo.getMeta(db, 'data_built_at');
      return {
        version: app.getVersion(),
        dataVersion: repo.getDataVersion(db),
        ...(builtAt ? { dataBuiltAt: builtAt } : {}),
      };
    },
  };

  for (const method of Object.keys(ARGS) as (keyof InvokeApi)[]) {
    ipcMain.handle(invokeChannel(method), async (_e, ...raw: unknown[]) => {
      const args = ARGS[method].safeParse(raw);
      if (!args.success) {
        log.warn(`IPC ${method}: неверные аргументы`, args.error.issues[0]);
        throw new Error(`IPC ${method}: неверные аргументы`);
      }
      return (impl[method] as (...a: unknown[]) => unknown)(...(args.data as unknown[]));
    });
  }

  // команды окна: только от окна-отправителя
  ipcMain.on(COMMANDS.windowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on(COMMANDS.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  // окно быстрого поиска — этап 8; пока «открыть в главном окне» просто переходит по маршруту
  ipcMain.on(COMMANDS.quickHide, (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
  ipcMain.on(COMMANDS.quickOpenInMain, (_e, route: unknown) => {
    if (typeof route !== 'string' || !route.startsWith('/') || route.length > 300) return;
    showMainWindow();
    getMainWindow()?.webContents.send(EVENTS.navigate, route);
  });
}
