/**
 * Уведомление о новых изменениях (§10.8): одно за синхронизацию.
 *   один документ:  «Изменены правила криминальных организаций» — «3 пункта»
 *   несколько:      «Обновлены правила» — «2 документа, 5 пунктов»
 * Клик открывает «Изменения». Отключается настройкой notifyChanges.
 */
import { Notification } from 'electron';
import log from 'electron-log/main';
import type { ChangeEntry } from '@shared/schema';
import { appIconPath } from './icons';
import { changesMessage } from './notifyText';

export function notifyChanges(changes: ChangeEntry[], onClick: () => void): void {
  const msg = changesMessage(changes);
  if (!msg || !Notification.isSupported()) return;
  const n = new Notification({ ...msg, icon: appIconPath, silent: false });
  n.on('click', onClick);
  n.on('failed', (_e, err) => log.warn(`уведомление: ${err}`));
  n.show();
}
