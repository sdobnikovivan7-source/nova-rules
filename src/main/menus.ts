/** Системные контекстные меню: main только показывает, действие выполняет renderer */
import { type BrowserWindow, Menu } from 'electron';
import type { RuleMenuAction } from '@shared/ipc';

export function showRuleMenu(
  win: BrowserWindow,
  favorite: boolean,
): Promise<RuleMenuAction | null> {
  return new Promise((resolve) => {
    let chosen: RuleMenuAction | null = null;
    const item = (label: string, action: RuleMenuAction) => ({
      label,
      click: () => void (chosen = action),
    });
    const menu = Menu.buildFromTemplate([
      item('Скопировать для жалобы', 'copy'),
      item(favorite ? 'Убрать из избранного' : 'В избранное', 'favorite'),
      item('Открыть на форуме', 'forum'),
      { type: 'separator' },
      item('Пункт отображается неправильно', 'report'),
    ]);
    // click срабатывает раньше закрытия меню, но не гарантированно — ждём такт
    menu.popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) });
  });
}
