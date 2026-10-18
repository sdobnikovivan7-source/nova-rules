import path from 'node:path';
import type { BrowserWindow, WebPreferences } from 'electron';

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
