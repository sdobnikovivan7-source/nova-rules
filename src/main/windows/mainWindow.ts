/**
 * Главное окно: 1100×720, минимум 800×560, без системной рамки (свои кнопки в шапке),
 * запоминает размер и положение, показывается только после отрисовки — без белой вспышки.
 */
import { app, BrowserWindow, screen } from 'electron';
import { getWindowState, setWindowState, type WindowState } from '../settings';
import { windowBackground } from '../theme';
import { loadPage, secureWebPreferences } from './common';

const MIN_W = 800;
const MIN_H = 560;

let win: BrowserWindow | null = null;

export const getMainWindow = () => win;

/** Сохранённая позиция видна хотя бы на одном мониторе? (монитор могли отключить) */
function visible(s: WindowState): boolean {
  if (s.x === undefined || s.y === undefined) return false;
  const { x, y, width } = s;
  return screen.getAllDisplays().some(({ workArea: a }) => {
    // заголовок окна должен попадать в рабочую область
    return (
      x + width > a.x + 50 && x < a.x + a.width - 50 && y >= a.y - 10 && y < a.y + a.height - 50
    );
  });
}

export function createMainWindow(opts: { show: boolean }): BrowserWindow {
  const state = getWindowState();
  const pos = visible(state) ? { x: state.x, y: state.y } : {};

  win = new BrowserWindow({
    ...pos,
    width: Math.max(state.width, MIN_W),
    height: Math.max(state.height, MIN_H),
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    show: false,
    backgroundColor: windowBackground(),
    title: 'NOVA Rules',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(),
  });
  if (state.maximized) win.maximize();

  // масштаб — только размер текста (fontScale в renderer), зум страницы выключен
  void win.webContents.setVisualZoomLevelLimits(1, 1);
  // меню приложения нет (вместе с ним пропали Ctrl+R и DevTools) — в dev DevTools по F12
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
    });
  }

  win.once('ready-to-show', () => {
    if (opts.show) win?.show();
  });

  const save = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized();
    // у развёрнутого окна запоминаем «обычный» размер, чтобы восстановление было правильным
    const b = maximized ? win.getNormalBounds() : win.getBounds();
    setWindowState({ x: b.x, y: b.y, width: b.width, height: b.height, maximized });
  };
  let timer: NodeJS.Timeout | undefined;
  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  win.on('close', save);
  win.on('closed', () => {
    clearTimeout(timer);
    win = null;
  });

  void loadPage(win, 'index');
  return win;
}

export function showMainWindow(): void {
  if (!win) {
    createMainWindow({ show: true });
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
