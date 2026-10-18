/**
 * HTML правил. Он санитизирован дважды (сборщик и main перед записью в БД, белый список
 * тегов без атрибутов-обработчиков), поэтому вставляется как есть. Картинки идут через
 * кеш main (`nova-img://`, этап 5.11): прямые ссылки на хостинги запрещает CSP.
 */
import { memo, useMemo } from 'react';
import { proxyImages } from '../images';

/** Не загрузившаяся картинка (удалена с хостинга, нет сети) не оставляет «битую» иконку */
const hideBroken = (el: HTMLElement | null) => {
  el?.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.add('img-failed');
    },
    true,
  );
};

export const RichHtml = memo(function RichHtml({
  html,
  inline,
}: {
  html: string;
  inline?: boolean;
}) {
  const __html = useMemo(() => proxyImages(html), [html]);
  const Tag = inline ? 'span' : 'div';
  return <Tag ref={hideBroken} className="rich" dangerouslySetInnerHTML={{ __html }} />;
});
