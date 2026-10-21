/** Белые списки внешних адресов (§12). Без Electron — тестируется в vitest. */

import { REPO_URL } from '@shared/ipc';
import { DATA_BASES } from './sync/endpoints';

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

const ATTACHMENT_RE = /^https:\/\/forum\.grand-rp\.su\/attachments\/(?:[^/?#]*\.)?(\d+)\/?$/;

/**
 * Откуда качать картинку. Вложения форума (`/attachments/<id>/`) закрыты проверкой
 * браузера, поэтому их копии лежат в ветке `data` (`data/attachments/<id>`, без
 * расширения — тип определяется по содержимому); сам форум — последним.
 */
export function imageSources(raw: string): string[] {
  const id = ATTACHMENT_RE.exec(raw)?.[1];
  return id ? [...DATA_BASES.map((b) => `${b}/attachments/${id}`), raw] : [raw];
}
