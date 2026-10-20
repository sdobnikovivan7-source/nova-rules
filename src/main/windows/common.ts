import path from 'node:path';
import { app, screen, type BrowserWindow, type WebPreferences } from 'electron';

/** Сохранённая позиция видна хотя бы на одном мониторе? (монитор могли отключить) */
export function onScreen(s: { x?: number; y?: number; width: number }): boolean {
  if (s.x === undefined || s.y === undefined) return false;
  const { x, y, width } = s;
  return screen.getAllDisplays().some(({ workArea: a }) => {
    // верх окна (за него перетаскивают) должен попадать в рабочую область
    return (
      x + width > a.x + 50 && x < a.x + a.width - 50 && y >= a.y - 10 && y < a.y + a.height - 50
    );
  });
}

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
