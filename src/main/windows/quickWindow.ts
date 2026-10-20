/**
 * Окно быстрого поиска (§10.3): 640×420 без рамки, по центру монитора, на котором курсор,
 * поверх всего (`screen-saver` — выше окон игр «в окне» и «без рамки»), без значка
 * в панели задач. Создаётся заранее и только показывается — открывается мгновенно.
 * Теряет фокус — прячется, если не закреплено пином (настройка quickAlwaysOnTop).
 * Окно можно подвинуть (за строку поиска или нижнюю полосу) и растянуть за края —
 * положение и размер запоминаются и восстанавливаются при следующем показе.
 */
import { BrowserWindow, screen } from 'electron';
import { EVENTS } from '@shared/ipc';
import { appIconPath } from '../icons';
import { clearQuickBounds, getQuickBounds, getSettings, setQuickBounds } from '../settings';
import { windowBackground } from '../theme';
import { loadPage, onScreen, prepareContents, secureWebPreferences } from './common';

const W = 640;
const H = 420;
const MIN_W = 440;
const MIN_H = 240;

let win: BrowserWindow | null = null;

export const getQuickWindow = () => win;

export function createQuickWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    minWidth: MIN_W,
    minHeight: MIN_H,
    show: false,
    resizable: true,
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
  // moved / resized приходят только после действий пользователя, не после setBounds
  const save = () => {
    if (win && !win.isDestroyed()) setQuickBounds(win.getBounds());
  };
  win.on('moved', save);
  win.on('resized', save);
  win.on('closed', () => void (win = null));

  void loadPage(win, 'quick');
  return win;
}

export function showQuick(): void {
  if (!win) createQuickWindow();
  const w = win!;
  w.setBounds(placement());
  w.setAlwaysOnTop(true, 'screen-saver');
  w.show();
  w.moveTop();
  w.focus();
  w.webContents.send(EVENTS.quickShown);
}

/** Где показать: там, куда окно поставил пользователь, иначе по центру монитора с курсором */
function placement(): Electron.Rectangle {
  const saved = getQuickBounds();
  if (saved && onScreen(saved)) {
    return { ...saved, width: Math.max(saved.width, MIN_W), height: Math.max(saved.height, MIN_H) };
  }
  // монитор, где сейчас курсор (там и игра)
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return {
    x: Math.round(a.x + (a.width - W) / 2),
    y: Math.round(a.y + (a.height - H) / 3),
    width: W,
    height: H,
  };
}

export function resetQuickBounds(): void {
  clearQuickBounds();
  if (win?.isVisible()) win.setBounds(placement());
}

export function hideQuick(): void {
  win?.hide();
}

/** Глобальная горячая клавиша: открыто и в фокусе — спрятать, иначе показать */
export function toggleQuick(): void {
  if (win?.isVisible() && win.isFocused()) hideQuick();
  else showQuick();
}
