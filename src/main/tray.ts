/**
 * Значок в трее (§10.7): точка-бейдж при непросмотренных изменениях, меню
 * «Открыть · Быстрый поиск · Изменения (N) · Проверить сейчас · правила от … · Выход»,
 * одиночный клик — показать / спрятать главное окно.
 */
import { Menu, Tray } from 'electron';
import { trayIcon } from './icons';

export type TrayActions = {
  toggleMain(): void;
  openMain(): void;
  openQuick(): void;
  openChanges(): void;
  syncNow(): void;
  quit(): void;
};

export type TrayState = { unseen: number; dataBuiltAt?: string | undefined; quickHotkey: string };

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

export class AppTray {
  private readonly tray: Tray;

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(trayIcon(false));
    this.tray.on('click', () => actions.toggleMain());
  }

  update(s: TrayState): void {
    const date = fmt(s.dataBuiltAt);
    this.tray.setImage(trayIcon(s.unseen > 0));
    this.tray.setToolTip(
      ['NOVA Rules', date && `правила от ${date}`, s.unseen > 0 && `новых изменений: ${s.unseen}`]
        .filter(Boolean)
        .join('\n'),
    );
    const a = this.actions;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Открыть', click: a.openMain },
        {
          label: 'Быстрый поиск',
          accelerator: s.quickHotkey,
          registerAccelerator: false,
          click: a.openQuick,
        },
        { label: s.unseen > 0 ? `Изменения (${s.unseen})` : 'Изменения', click: a.openChanges },
        { label: 'Проверить сейчас', click: a.syncNow },
        { type: 'separator' },
        { label: date ? `Правила от ${date}` : 'Правил пока нет', enabled: false },
        { type: 'separator' },
        { label: 'Выход', click: a.quit },
      ]),
    );
  }

  destroy(): void {
    this.tray.destroy();
  }
}
