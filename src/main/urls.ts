/** Белые списки внешних адресов (§12). Без Electron — тестируется в vitest. */

import { REPO_URL } from '@shared/ipc';

const REPO_PATH = new URL(REPO_URL).pathname;

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

/** Хостинги картинок, которые встречаются в темах правил (поддомены тоже) */
const IMAGE_HOSTS = [
  'forum.grand-rp.su',
  'imgur.com',
  'postimg.cc',
  'googleusercontent.com',
  'yapx.ru',
  'allwebs.ru',
];

/** Какие картинки из правил main может скачать в кеш (протокол nova-img://) */
export function isAllowedImage(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}
