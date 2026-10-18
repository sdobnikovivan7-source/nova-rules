/**
 * Размер текста 90–140 % (§10 дизайна): CSS-переменная --font-scale умножает все токены
 * шрифтов, сетка окна не меняется. Ctrl +/−/0 и Ctrl + колесо.
 */
import { useEffect } from 'react';
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from '@shared/ipc';
import { useApp } from './store';

const STEP = 0.1;

export function changeFontScale(delta: number | 'reset'): void {
  const { settings, updateSettings } = useApp.getState();
  if (!settings) return;
  const cur = settings.fontScale;
  const next = delta === 'reset' ? 1 : cur + delta;
  const fontScale = Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)) * 10) / 10;
  if (fontScale === cur) return;
  // сразу в стор: быстрые нажатия подряд не теряются, пока main сохраняет
  useApp.setState({ settings: { ...settings, fontScale } });
  void updateSettings({ fontScale });
}

/** Применяет fontScale к корню и вешает горячие клавиши; вызывается один раз в окне */
export function useFontScale(): void {
  const scale = useApp((s) => s.settings?.fontScale ?? 1);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(scale));
  }, [scale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') changeFontScale(STEP);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') changeFontScale(-STEP);
      else if (e.code === 'Digit0' || e.code === 'Numpad0') changeFontScale('reset');
      else return;
      e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      changeFontScale(e.deltaY < 0 ? STEP : -STEP);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);
}
