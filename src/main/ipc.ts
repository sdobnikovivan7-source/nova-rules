/**
 * Обработчики `window.api` (§9). Аргументы из renderer не доверенные — каждый
 * проверяется zod-схемой до вызова обработчика.
 */
import { app, BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent, shell } from 'electron';
import log from 'electron-log/main';
import { z } from 'zod';
import {
  COMMANDS,
  EVENTS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  type InvokeApi,
  invokeChannel,
} from '@shared/ipc';
import type { Db } from './db';
import * as repo from './db/repo';
import { formatRuleForCopy } from './format';
import { showRuleMenu } from './menus';
import { openExternalSafe } from './security';
import { getSettings, setSettings } from './settings';
import { applyTheme } from './theme';
import type { SyncService } from './sync';
import { getMainWindow, showMainWindow } from './windows/mainWindow';

export type IpcContext = { db: Db; logsDir: string; sync: SyncService };

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
  getUserState: z.tuple([]),
  syncNow: z.tuple([]),
  getSyncStatus: z.tuple([]),
  openExternal: z.tuple([z.string().max(2000)]),
  copyRule: z.tuple([ruleId]),
  showRuleMenu: z.tuple([ruleId]),
  getSettings: z.tuple([]),
  setSettings: z.tuple([SettingsPatch]),
  openLogsFolder: z.tuple([]),
  getAppInfo: z.tuple([]),
} as never;

export function registerIpc({ db, logsDir, sync }: IpcContext): void {
  const userStateChanged = () =>
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(EVENTS.userStateChanged));

  const impl: InvokeApi = {
    getCategories: async () => repo.getCategories(db),
    getDocs: async (categoryId) => repo.getDocs(db, categoryId),
    getDoc: async (docId) => repo.getDoc(db, docId),
    getRule: async (id) => repo.getRule(db, id),
    getSearchCorpus: async () => repo.getSearchCorpus(db),
    getSynonyms: async () => repo.getSynonyms(db),
    getChanges: async (query) => repo.getChanges(db, query),
    markChangesSeen: async (ids) => {
      repo.markChangesSeen(db, ids);
      userStateChanged();
    },
    getFavorites: async () => repo.getFavorites(db),
    toggleFavorite: async (id) => {
      const on = repo.toggleFavorite(db, id);
      userStateChanged();
      return on;
    },
    getUserState: async () => ({
      unseenChanges: repo.countUnseenChanges(db),
      favoriteIds: repo.getFavoriteIds(db),
    }),
    syncNow: () => sync.run({ manual: true }),
    getSyncStatus: async () => sync.status(),
    openExternal: (url) => openExternalSafe(url),
    copyRule: async (id) => {
      const rule = repo.getRule(db, id);
      if (!rule) throw new Error(`пункт ${id} не найден`);
      clipboard.writeText(formatRuleForCopy(rule));
    },
    async showRuleMenu(this: IpcMainInvokeEvent, id) {
      const rule = repo.getRule(db, id);
      const win = BrowserWindow.fromWebContents(this.sender);
      if (!rule || !win) return null;
      return showRuleMenu(win, repo.getFavoriteIds(db).includes(id));
    },
    getSettings: async () => getSettings(),
    setSettings: async (patch) => {
      const before = getSettings();
      const next = setSettings(patch);
      // сменили источник данных — сразу проверить им
      if (next.syncMode !== before.syncMode) void sync.run({ manual: true });
      if (next.theme !== before.theme) applyTheme(next.theme);
      return next;
    },
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
    ipcMain.handle(invokeChannel(method), async (e, ...raw: unknown[]) => {
      const args = ARGS[method].safeParse(raw);
      if (!args.success) {
        log.warn(`IPC ${method}: неверные аргументы`, args.error.issues[0]);
        throw new Error(`IPC ${method}: неверные аргументы`);
      }
      // this — событие IPC: обработчику может понадобиться окно-отправитель
      return (impl[method] as (this: IpcMainInvokeEvent, ...a: unknown[]) => unknown).apply(
        e,
        args.data as unknown[],
      );
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
