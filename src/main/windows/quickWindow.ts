/**
 * Окно быстрого поиска (§10.3): 640×420 без рамки, по центру монитора, на котором курсор,
 * поверх всего (`screen-saver` — выше окон игр «в окне» и «без рамки»), без значка
 * в панели задач. Создаётся заранее и только показывается — открывается мгновенно.
 * Теряет фокус — прячется, если не закреплено пином (настройка quickAlwaysOnTop).
 */
import { BrowserWindow, screen } from 'electron';
import { EVENTS } from '@shared/ipc';
import { appIconPath } from '../icons';
import { getSettings } from '../settings';
import { windowBackground } from '../theme';
import { loadPage, prepareContents, secureWebPreferences } from './common';

const W = 640;
const H = 420;

let win: BrowserWindow | null = null;

export const getQuickWindow = () => win;

export function createQuickWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: windowBackground(),
    title: 'NOVA Rules — быстрый поиск',
    icon: appIconPath,
    webPreferences: secureWebPreferences(),
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  prepareContents(win);

  win.on('blur', () => {
    if (!getSettings().quickAlwaysOnTop && !win?.webContents.isDevToolsOpened()) win?.hide();
  });
  win.on('closed', () => void (win = null));

  void loadPage(win, 'quick');
  return win;
}

export function showQuick(): void {
  if (!win) createQuickWindow();
  const w = win!;
  // по центру монитора, где сейчас курсор (там и игра)
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  w.setBounds({
    x: Math.round(a.x + (a.width - W) / 2),
    y: Math.round(a.y + (a.height - H) / 3),
    width: W,
    height: H,
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.show();
  w.moveTop();
  w.focus();
  w.webContents.send(EVENTS.quickShown);
}

export function hideQuick(): void {
  win?.hide();
}

/** Глобальная горячая клавиша: открыто и в фокусе — спрятать, иначе показать */
export function toggleQuick(): void {
  if (win?.isVisible() && win.isFocused()) hideQuick();
  else showQuick();
}
