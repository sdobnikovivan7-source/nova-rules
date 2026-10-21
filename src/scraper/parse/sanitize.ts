/**
 * Санитизация HTML правил по белому списку — отдельно от разбора (clean.ts), чтобы
 * приложение не загружало cheerio ради записи данных в БД.
 */
import sanitizeHtml from 'sanitize-html';

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'u', 's', 'br', 'a', 'img', 'span', 'details', 'summary', 'ul', 'ol', 'li', 'p'],
  allowedAttributes: {
    a: ['href'],
    img: ['src', 'alt'],
    span: ['class'],
  },
  allowedClasses: { span: ['punish'] },
  allowedSchemes: ['https', 'http'],
  allowProtocolRelative: false,
};

/**
 * Финальная санитизация по белому списку. Вызывается в сборщике перед
 * публикацией и повторно в приложении перед записью в БД.
 */
export function sanitizeRuleHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE);
}
