/** Белый список внешних ссылок (§12). Без Electron — тестируется в vitest. */

const REPO_PATH = '/sdobnikovivan7-source/nova-rules';

/** Какие внешние ссылки можно открыть в браузере пользователя */
export function isAllowedExternal(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (url.hostname === 'forum.grand-rp.su') return true;
  return (
    url.hostname === 'github.com' &&
    (url.pathname === REPO_PATH || url.pathname.startsWith(`${REPO_PATH}/`))
  );
}
