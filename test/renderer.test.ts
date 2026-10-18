/** Чистые функции интерфейса: форматирование, прокси картинок, белый список хостингов */
import { describe, expect, it } from 'vitest';
import { isAllowedImage } from '../src/main/urls';
import { proxyImages } from '../src/renderer/src/images';
import { count, plural, RULES, stripSectionNumber } from '../src/renderer/src/format';

describe('plural', () => {
  it.each([
    [1, 'пункт'],
    [2, 'пункта'],
    [5, 'пунктов'],
    [11, 'пунктов'],
    [12, 'пунктов'],
    [21, 'пункт'],
    [22, 'пункта'],
    [81, 'пункт'],
    [111, 'пунктов'],
  ])('%i → %s', (n, form) => expect(plural(n, RULES)).toBe(form));

  it('count', () => expect(count(48, RULES)).toBe('48 пунктов'));
});

describe('stripSectionNumber', () => {
  it.each([
    ['1. Общее положение', 'Общее положение'],
    ['Раздел 2. Дипломатия', 'Дипломатия'],
    ['3.1 Захват', 'Захват'],
    ['Активности в опасном районе:', 'Активности в опасном районе'],
    ['Методы расправы', 'Методы расправы'],
    // номер без названия — оставляем как есть
    ['4.', '4.'],
  ])('%s → %s', (title, out) => expect(stripSectionNumber(title)).toBe(out));
});

describe('proxyImages', () => {
  const decode = (html: string) => {
    const b64 = /nova-img:\/\/img\/([\w-]+)"/.exec(html)![1]!;
    return Buffer.from(b64, 'base64url').toString('utf8');
  };

  it('переписывает адрес картинки на nova-img:// с обратимым base64url', () => {
    const html = proxyImages('текст <img src="https://i.postimg.cc/N00Jk12y/Screenshot-1.png" />');
    expect(html).toContain('src="nova-img://img/');
    expect(html).not.toContain('postimg');
    expect(decode(html)).toBe('https://i.postimg.cc/N00Jk12y/Screenshot-1.png');
  });

  it('снимает экранирование атрибута и сохраняет кириллицу', () => {
    const html = proxyImages('<img src="https://imgur.com/a.png?x=1&amp;y=фото" alt="" />');
    expect(decode(html)).toBe('https://imgur.com/a.png?x=1&y=фото');
  });

  it('без картинок HTML не меняется', () => {
    expect(proxyImages('<b>1.1</b> текст')).toBe('<b>1.1</b> текст');
  });
});

describe('isAllowedImage', () => {
  it.each([
    ['https://i.postimg.cc/a.png', true],
    ['https://i.imgur.com/a.png', true],
    ['https://imgur.com/a.png', true],
    ['https://lh3.googleusercontent.com/x', true],
    ['https://forum.grand-rp.su/attachments/1/', true],
    ['http://i.imgur.com/a.png', false],
    ['https://evil.com/a.png', false],
    ['https://imgur.com.evil.com/a.png', false],
    ['https://notimgur.com/a.png', false],
    ['https://user:pass@i.imgur.com/a.png', false],
    ['nova-img://img/x', false],
    ['не адрес', false],
  ])('%s → %s', (url, ok) => expect(isAllowedImage(url)).toBe(ok));
});
