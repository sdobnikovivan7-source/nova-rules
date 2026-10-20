/**
 * Главное окно: 1100×720, минимум 800×560, без системной рамки (свои кнопки в шапке),
 * запоминает размер и положение, показывается только после отрисовки — без белой вспышки.
 * Крестик сворачивает в трей (настройка closeToTray) или завершает приложение.
 */
import { app, BrowserWindow } from 'electron';
import { appIconPath } from '../icons';
import { getSettings, getWindowState, setWindowState } from '../settings';
import { windowBackground } from '../theme';
import { loadPage, onScreen, prepareContents, secureWebPreferences } from './common';

const MIN_W = 800;
const MIN_H = 560;

let win: BrowserWindow | null = null;
/** Идёт выход из приложения — закрытие окна больше не сворачивает в трей */
let quitting = false;
let lastBlur = 0;
app.on('before-quit', () => void (quitting = true));

export const getMainWindow = () => win;

export function createMainWindow(opts: { show: boolean }): BrowserWindow {
  const state = getWindowState();
  const pos = onScreen(state) ? { x: state.x, y: state.y } : {};

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
    icon: appIconPath,
    webPreferences: secureWebPreferences(),
  });
  if (state.maximized) win.maximize();

  prepareContents(win);

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
  win.on('blur', () => void (lastBlur = Date.now()));
  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  win.on('close', (e) => {
    save();
    if (quitting) return;
    if (getSettings().closeToTray) {
      e.preventDefault();
      win?.hide();
    } else {
      // окно быстрого поиска скрыто, но живо — без явного выхода приложение осталось бы в трее
      app.quit();
    }
  });
  win.on('closed', () => {
    clearTimeout(timer);
    win = null;
  });

  void loadPage(win, 'index');
  return win;
}

/**
 * Клик по значку в трее: окно было активным — спрятать, иначе показать поверх.
 * Сам клик по трею снимает фокус с окна, поэтому «было активным» = потеряло фокус только что.
 */
export function toggleMainWindow(): void {
  const wasActive = win?.isFocused() || Date.now() - lastBlur < 400;
  if (win?.isVisible() && !win.isMinimized() && wasActive) win.hide();
  else showMainWindow();
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
