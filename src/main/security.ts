/**
 * Безопасность окон (§12): навигация внутри окна запрещена, новые окна не открываются,
 * внешние ссылки — только из белого списка, разрешения (камера, уведомления в вебе и т.п.) не выдаются.
 */
import { app, session, shell } from 'electron';
import log from 'electron-log/main';
import { isAllowedExternal } from './urls';

export async function openExternalSafe(url: string): Promise<void> {
  if (!isAllowedExternal(url)) {
    log.warn(`openExternal: ссылка не из белого списка — ${url}`);
    return;
  }
  await shell.openExternal(url);
}

/** Адрес dev-сервера Vite: в dev перезагрузка страницы по нему разрешена */
const devUrl = process.env['ELECTRON_RENDERER_URL'];

export function installSecurity(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (devUrl && url.startsWith(devUrl)) return;
      e.preventDefault();
      void openExternalSafe(url);
    });
    contents.on('will-redirect', (e, url) => {
      if (devUrl && url.startsWith(devUrl)) return;
      e.preventDefault();
    });
    contents.on('will-attach-webview', (e) => e.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      void openExternalSafe(url);
      return { action: 'deny' };
    });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}
