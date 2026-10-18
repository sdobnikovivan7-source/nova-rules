import path from 'node:path';
import { app, type BrowserWindow, type WebPreferences } from 'electron';

/** Одинаково для всех окон (§12) */
export const secureWebPreferences = (): WebPreferences => ({
  preload: path.join(import.meta.dirname, '../preload/index.cjs'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
});

/** page — 'index' или 'quick' */
export function loadPage(win: BrowserWindow, page: 'index' | 'quick'): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) return win.loadURL(`${devUrl}/${page}.html`);
  return win.loadFile(path.join(import.meta.dirname, `../renderer/${page}.html`));
}

/** Общие настройки содержимого окна */
export function prepareContents(win: BrowserWindow): void {
  // масштаб — только размер текста (fontScale в renderer), зум страницы выключен
  void win.webContents.setVisualZoomLevelLimits(1, 1);
  // меню приложения нет (вместе с ним пропали Ctrl+R и DevTools) — в dev DevTools по F12
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }
}
