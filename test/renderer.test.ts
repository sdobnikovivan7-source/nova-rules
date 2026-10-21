/** Чистые функции интерфейса: форматирование, прокси картинок, белый список хостингов */
import { describe, expect, it } from 'vitest';
import { sniffImage } from '../src/main/imageType';
import { imageSources, isAllowedImage } from '../src/main/urls';
import { proxyImages } from '../src/renderer/src/images';
import { count, fmtWhen, plural, RULES, stripSectionNumber } from '../src/renderer/src/format';
import { hotkeyFromEvent, hotkeyParts } from '../src/renderer/src/hotkey';
import { bugIssueUrl, ruleIssueUrl } from '../src/renderer/src/issues';
import { REPO_URL, threadUrl } from '../src/shared/ipc';

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

describe('imageSources', () => {
  it('вложение форума — сначала копия в ветке data, форум последним', () => {
    const src = imageSources('https://forum.grand-rp.su/attachments/5959/');
    expect(src).toEqual([
      'https://cdn.jsdelivr.net/gh/sdobnikovivan7-source/nova-rules@data/data/attachments/5959',
      'https://sdobnikovivan7-source.github.io/nova-rules/data/attachments/5959',
      'https://forum.grand-rp.su/attachments/5959/',
    ]);
    expect(imageSources('https://forum.grand-rp.su/attachments/map-png.6011/')[0]).toMatch(
      /attachments\/6011$/,
    );
  });
  it('прочие картинки — как есть', () => {
    expect(imageSources('https://i.imgur.com/a.png')).toEqual(['https://i.imgur.com/a.png']);
    expect(imageSources('https://forum.grand-rp.su/data/avatars/1.jpg')).toHaveLength(1);
  });
});

describe('sniffImage', () => {
  const b = (...x: (number | string)[]) =>
    Uint8Array.from(
      x.flatMap((v) => (typeof v === 'number' ? [v] : [...v].map((c) => c.charCodeAt(0)))),
    );
  it.each([
    [b(0x89, 'PNG', 13, 10), 'image/png'],
    [b(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    [b('GIF89a'), 'image/gif'],
    [b('RIFF', 0, 0, 0, 0, 'WEBP'), 'image/webp'],
    [b('{"x":1}'), undefined],
    [b(), undefined],
  ])('%#', (data, mime) => expect(sniffImage(data)).toBe(mime));
});

describe('пословный diff по-русски', () => {
  it('слова не режутся по буквам', async () => {
    const { diffWords } = await import('diff');
    const parts = diffWords('Понедельник/Суббота. | WARN', 'Понедельник/Воскресенье. | WARN', {
      intlSegmenter: new Intl.Segmenter('ru', { granularity: 'word' }),
    });
    expect(parts.filter((p) => p.removed).map((p) => p.value)).toEqual(['Суббота']);
    expect(parts.filter((p) => p.added).map((p) => p.value)).toEqual(['Воскресенье']);
  });
});

describe('запись горячей клавиши', () => {
  const key = (
    code: string,
    mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {},
  ) =>
    hotkeyFromEvent({
      code,
      ctrlKey: !!mods.ctrl,
      altKey: !!mods.alt,
      shiftKey: !!mods.shift,
      metaKey: !!mods.meta,
    });

  it('Ctrl+Shift+Space', () =>
    expect(key('Space', { ctrl: true, shift: true })).toEqual({
      kind: 'done',
      accel: 'Control+Shift+Space',
    }));
  it('Alt+буква и цифра', () => {
    expect(key('KeyR', { alt: true })).toEqual({ kind: 'done', accel: 'Alt+R' });
    expect(key('Digit5', { ctrl: true, alt: true })).toEqual({
      kind: 'done',
      accel: 'Control+Alt+5',
    });
  });
  it('Win → Super, цифровой блок', () =>
    expect(key('Numpad3', { meta: true })).toEqual({ kind: 'done', accel: 'Super+num3' }));
  it('F-клавиши без модификаторов', () => expect(key('F8')).toEqual({ kind: 'done', accel: 'F8' }));
  it('только модификаторы — ждём клавишу', () =>
    expect(key('ShiftLeft', { ctrl: true, shift: true })).toEqual({
      kind: 'pending',
      parts: ['Control', 'Shift'],
    }));
  it('буква без Ctrl / Alt / Win — нельзя', () => {
    expect(key('KeyA').kind).toBe('invalid');
    expect(key('KeyA', { shift: true }).kind).toBe('invalid');
  });
  it('неизвестная клавиша — нельзя', () =>
    expect(key('MediaPlayPause', { ctrl: true }).kind).toBe('invalid'));
  it('подписи для kbd', () => {
    expect(hotkeyParts('Control+Shift+Space')).toEqual(['Ctrl', 'Shift', 'Space']);
    expect(hotkeyParts('Super+numadd')).toEqual(['Win', 'Num +']);
  });
});

describe('fmtWhen', () => {
  const now = new Date(2026, 9, 18, 12, 0);
  it('сегодня / вчера / дата', () => {
    expect(fmtWhen(new Date(2026, 9, 18, 6, 12).toISOString(), now)).toBe('сегодня в 06:12');
    expect(fmtWhen(new Date(2026, 9, 17, 23, 40).toISOString(), now)).toBe('вчера в 23:40');
    expect(fmtWhen(new Date(2026, 9, 14, 6, 5).toISOString(), now)).toBe('14.10.2026 в 06:05');
  });
});

describe('ссылки на задачи GitHub', () => {
  const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

  it('пункт → форма rule.yml с ID, темой и версиями', () => {
    const url = ruleIssueUrl({ id: '406244:1.2', number: '1.2' }, threadUrl(406244), {
      version: '1.0.0',
      dataVersion: 7,
    });
    expect(url.startsWith(`${REPO_URL}/issues/new?`)).toBe(true);
    expect(params(url)).toEqual({
      template: 'rule.yml',
      title: 'Пункт отображается неправильно: п. 1.2',
      rule: '406244:1.2',
      thread: 'https://forum.grand-rp.su/threads/406244/',
      app: '1.0.0',
      data: '7',
    });
  });

  it('пункт без номера — ID в заголовке', () =>
    expect(params(ruleIssueUrl({ id: '402990:p3', number: null }, 'x', {})).title).toBe(
      'Пункт отображается неправильно: 402990:p3',
    ));

  it('ошибка приложения → bug.yml, пустые версии не передаются', () =>
    expect(params(bugIssueUrl({ version: '1.0.0' }))).toEqual({
      template: 'bug.yml',
      app: '1.0.0',
    }));
});
