/**
 * Когда синхронизироваться (§7.1): через 5 с после старта, каждые 6 часов,
 * после выхода ПК из сна. Вручную — через IPC `syncNow` (кнопка, F5, трей).
 */
import { powerMonitor } from 'electron';
import type { SyncService } from '.';

export const START_DELAY = 5_000;
export const INTERVAL = 6 * 3_600_000;

export function scheduleSync(sync: SyncService): () => void {
  const first = setTimeout(() => void sync.run(), START_DELAY);
  const every = setInterval(() => void sync.run(), INTERVAL);
  // после сна сеть поднимается не сразу — даём ей несколько секунд
  const onResume = () => setTimeout(() => void sync.run(), START_DELAY);
  powerMonitor.on('resume', onResume);
  return () => {
    clearTimeout(first);
    clearInterval(every);
    powerMonitor.off('resume', onResume);
  };
}
