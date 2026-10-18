/**
 * Тема интерфейса: nativeTheme.themeSource управляет prefers-color-scheme во всех окнах,
 * 'system' — «Как в Windows» (следит за системной настройкой сам).
 */
import { BrowserWindow, nativeTheme } from 'electron';
import type { Theme } from '@shared/ipc';

const BG = { dark: '#0E0E10', light: '#ECECEF' };

/** Фон окна до отрисовки страницы — без белой (или чёрной) вспышки */
export const windowBackground = () => (nativeTheme.shouldUseDarkColors ? BG.dark : BG.light);

export function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme;
}

/** Один раз при старте: фон уже открытых окон следует за темой */
export function watchTheme(): void {
  nativeTheme.on('updated', () => {
    const bg = windowBackground();
    BrowserWindow.getAllWindows().forEach((w) => w.setBackgroundColor(bg));
  });
}
