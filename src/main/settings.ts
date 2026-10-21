/**
 * Настройки пользователя (electron-store → %APPDATA%/NovaRules/settings.json).
 * Хранилище создаётся лениво: к этому моменту путь userData уже переназначен в index.ts.
 */
import Store from 'electron-store';
import { DEFAULT_SETTINGS, FONT_SCALE_MAX, FONT_SCALE_MIN, type Settings } from '@shared/ipc';

export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
};

/** Положение и размер окна быстрого поиска, если пользователь его двигал или растягивал */
export type QuickBounds = { x: number; y: number; width: number; height: number };

type Schema = {
  settings: Settings;
  window: WindowState;
  quick?: QuickBounds;
  /** Перезапуск после тихого автообновления — следующий старт свёрнутым в трей */
  restartHidden?: boolean;
};

let store: Store<Schema> | null = null;

function getStore(): Store<Schema> {
  store ??= new Store<Schema>({
    name: 'settings',
    defaults: {
      settings: DEFAULT_SETTINGS,
      window: { width: 1100, height: 720, maximized: false },
    },
  });
  return store;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function getSettings(): Settings {
  // новые ключи из DEFAULT_SETTINGS появляются и у старых пользователей
  return { ...DEFAULT_SETTINGS, ...getStore().get('settings') };
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  next.fontScale = Math.round(clamp(next.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX) * 100) / 100;
  getStore().set('settings', next);
  return next;
}

export const getWindowState = (): WindowState => getStore().get('window');
export const setWindowState = (s: WindowState): void => getStore().set('window', s);

export const getQuickBounds = (): QuickBounds | undefined => getStore().get('quick');
export const setQuickBounds = (b: QuickBounds): void => getStore().set('quick', b);
export const clearQuickBounds = (): void => getStore().delete('quick');

export const markRestartHidden = (): void => getStore().set('restartHidden', true);
/** Прочитать и сбросить: флаг действует на один запуск */
export function takeRestartHidden(): boolean {
  const v = getStore().get('restartHidden') === true;
  if (v) getStore().delete('restartHidden');
  return v;
}
