/**
 * Preload: типизированный `window.api` через contextBridge.
 * Работает в sandbox — только `electron` (contextBridge, ipcRenderer), без Node.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  type Api,
  COMMANDS,
  EVENTS,
  INVOKE_METHODS,
  type InvokeApi,
  invokeChannel,
} from '@shared/ipc';

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => void ipcRenderer.removeListener(channel, listener);
}

const invoke = Object.fromEntries(
  INVOKE_METHODS.map((m) => [
    m,
    (...args: unknown[]) => ipcRenderer.invoke(invokeChannel(m), ...args),
  ]),
) as unknown as InvokeApi;

const api: Api = {
  ...invoke,
  onSyncStatus: (cb) => on(EVENTS.syncStatus, cb),
  onDataUpdated: (cb) => on(EVENTS.dataUpdated, cb),
  onUserStateChanged: (cb) => on(EVENTS.userStateChanged, cb),
  onNavigate: (cb) => on(EVENTS.navigate, cb),
  onSettingsChanged: (cb) => on(EVENTS.settingsChanged, cb),
  onQuickShown: (cb) => on(EVENTS.quickShown, cb),
  onUpdateStatus: (cb) => on(EVENTS.updateStatus, cb),
  window: {
    minimize: () => ipcRenderer.send(COMMANDS.windowMinimize),
    close: () => ipcRenderer.send(COMMANDS.windowClose),
  },
  quick: {
    show: () => ipcRenderer.send(COMMANDS.quickShow),
    hide: () => ipcRenderer.send(COMMANDS.quickHide),
    openInMain: (route) => ipcRenderer.send(COMMANDS.quickOpenInMain, route),
  },
  pauseHotkey: (pause) => ipcRenderer.send(COMMANDS.hotkeyPause, pause),
};

contextBridge.exposeInMainWorld('api', api);
