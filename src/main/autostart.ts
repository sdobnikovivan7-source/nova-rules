/**
 * Запуск вместе с Windows (§8.3): ярлык в автозагрузке с аргументом `--hidden` —
 * приложение стартует свёрнутым в трей. В dev не трогаем: там exe — сам Electron.
 */
import { app } from 'electron';
import log from 'electron-log/main';

export const HIDDEN_ARG = '--hidden';

export function applyAutostart(enabled: boolean): void {
  if (!app.isPackaged) {
    log.info(`автозапуск ${enabled ? 'включён' : 'выключен'} (в dev не применяется)`);
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
}

/** Настройка и реальная запись в автозагрузке могли разойтись (удалили вручную) — выравниваем */
export function syncAutostart(enabled: boolean): void {
  if (!app.isPackaged) return;
  const actual = app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin;
  if (actual !== enabled) applyAutostart(enabled);
}
