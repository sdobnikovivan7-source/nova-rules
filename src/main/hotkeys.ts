/**
 * Глобальная горячая клавиша быстрого поиска (§10.3, по умолчанию Ctrl+Shift+Space).
 * Сочетание может быть занято другой программой — тогда register вернёт false,
 * а пользователь увидит это в строке состояния и в настройках.
 */
import { globalShortcut } from 'electron';
import log from 'electron-log/main';

let current: string | null = null;
let failed = false;
let paused = false;
let handler: (() => void) | null = null;

/** Удалось ли зарегистрировать текущее сочетание */
export const hotkeyRegistered = () => current !== null && !failed;

function tryRegister(accel: string, onPress: () => void): boolean {
  try {
    return globalShortcut.register(accel, onPress);
  } catch (e) {
    // недопустимая запись сочетания
    log.warn(`горячая клавиша ${accel}: ${(e as Error).message}`);
    return false;
  }
}

/** При старте: не получилось — приложение работает, просто без горячей клавиши */
export function registerQuickHotkey(accel: string, onPress: () => void): boolean {
  current = accel;
  handler = onPress;
  failed = !tryRegister(accel, onPress);
  if (failed) log.warn(`горячая клавиша ${accel} занята другой программой`);
  return !failed;
}

/**
 * Смена сочетания из настроек: новое регистрируется до снятия старого;
 * не вышло — старое остаётся как было, вызывающий получает false.
 */
export function changeQuickHotkey(accel: string, onPress: () => void): boolean {
  setHotkeyPaused(false);
  if (accel === current && !failed) return true;
  if (!tryRegister(accel, onPress)) return false;
  if (current && current !== accel && !failed) globalShortcut.unregister(current);
  current = accel;
  handler = onPress;
  failed = false;
  return true;
}

/**
 * Пока в настройках записывают новое сочетание, текущее снято — иначе нажатие
 * того же сочетания откроет быстрый поиск вместо записи.
 */
export function setHotkeyPaused(pause: boolean): void {
  if (pause === paused || !current || failed || !handler) return;
  paused = pause;
  if (pause) globalShortcut.unregister(current);
  else if (!tryRegister(current, handler)) failed = true;
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
