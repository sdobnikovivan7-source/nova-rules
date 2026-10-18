/** Картинки правил идут через кеш main (`nova-img://`, этап 5.11): прямые ссылки на хостинги запрещает CSP */

/** base64url от UTF-8 — так адрес переживает разбор URL нестандартной схемы */
function b64url(s: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const unescapeAttr = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/**
 * `<img src="https://…">` → `<img src="nova-img://img/…">`. Без loading="lazy": для своей
 * схемы Chromium такие картинки не догружает, а DOM и так мал за счёт виртуализации.
 */
export const proxyImages = (html: string) =>
  html.includes('<img')
    ? html.replace(
        /<img src="(https:\/\/[^"]+)"/g,
        (_, src: string) =>
          `<img draggable="false" src="nova-img://img/${b64url(unescapeAttr(src))}"`,
      )
    : html;
