import { describe, expect, it } from 'vitest';
import { isRed, lineText, linearize, renderLine, sanitizeRuleHtml } from '../src/scraper/parse/clean';

const BASE = 'https://forum.grand-rp.su';
const lines = (html: string) => linearize(html, BASE);

describe('linearize', () => {
  it('режет по <br> даже внутри незакрытых тегов', () => {
    const l = lines('<b><span style="font-size: 18px">Первая<br>Вторая</span></b><br>Третья');
    expect(l.map((x) => lineText(x.segs))).toEqual(['Первая', 'Вторая', 'Третья']);
    expect(l[1]!.segs[0]).toMatchObject({ kind: 'text', fmt: { b: true } });
  });

  it('красный цвет → punish, крупный шрифт → big, прочий цвет → color', () => {
    const [a, b, c] = lines(
      '<span style="color: rgb(226, 80, 65)">JAIL</span><br><span style="font-size: 22px">Заголовок</span><br><span style="color: rgb(44, 130, 201)">Примечание</span>',
    );
    expect(a!.segs[0]).toMatchObject({ fmt: { punish: true } });
    expect(b!.segs[0]).toMatchObject({ fmt: { big: true } });
    expect(c!.segs[0]).toMatchObject({ fmt: { color: true } });
  });

  it('убирает &#8203;, пустые строки и стили', () => {
    const l = lines('<div style="text-align: center">&#8203;<br>  Текст&#8203; <br>&#8203;</div>');
    expect(l).toHaveLength(1);
    expect(lineText(l[0]!.segs)).toBe('Текст');
    expect(l[0]!.center).toBe(true);
  });

  it('спойлер → details без скриптов', () => {
    const html = `<div class="bbCodeSpoiler"><button><span class="bbCodeSpoiler-button-title">Карта</span></button>
      <div class="bbCodeSpoiler-content"><div class="bbCodeBlock-content"><script>{"x":1}</script>
      <div class="bbImageWrapper" data-src="/attachments/1/"><img src="/attachments/1/" alt="map.png"></div></div></div></div>`;
    const l = lines(html);
    expect(l).toHaveLength(1);
    const out = renderLine(l[0]!.segs);
    expect(out).toContain('<details><summary>Карта</summary>');
    expect(out).toContain('src="https://forum.grand-rp.su/attachments/1/"');
    expect(out).not.toContain('script');
  });

  it('цитата без кнопки «Нажмите, чтобы раскрыть...»', () => {
    const html = `<blockquote class="bbCodeBlock bbCodeBlock--expandable bbCodeBlock--quote js-expandWatch">
      <div class="bbCodeBlock-content"><div class="bbCodeBlock-expandContent js-expandContent">Важно: текст</div>
      <div class="bbCodeBlock-expandLink js-expandLink"><a role="button" tabindex="0">Нажмите, чтобы раскрыть...</a></div>
      </div></blockquote>`;
    expect(lines(html).map((x) => lineText(x.segs))).toEqual(['Важно: текст']);
  });

  it('пункты списка помечаются', () => {
    const l = lines('<ol><li>Один</li><li>Два<br>продолжение</li></ol>');
    expect(l.map((x) => x.list?.index ?? null)).toEqual([1, 2, null]);
    expect(l[2]!.inList).toBe(true);
  });

  it('ссылки становятся абсолютными, javascript: отбрасывается', () => {
    const l = lines('<a href="/threads/1/">тема</a> и <a href="javascript:alert(1)">плохая</a>');
    const out = renderLine(l[0]!.segs);
    expect(out).toContain('<a href="https://forum.grand-rp.su/threads/1/">тема</a>');
    expect(out).not.toContain('javascript');
  });

  it('экранирует текст', () => {
    const l = lines('&lt;img src=x onerror=alert(1)&gt;');
    expect(renderLine(l[0]!.segs)).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('isRed', () => {
  it.each([
    [[226, 80, 65], true],
    [[209, 72, 65], true],
    [[184, 49, 47], true],
    [[243, 121, 52], false],
    [[44, 130, 201], false],
    [[97, 189, 109], false],
  ] as [[number, number, number], boolean][])('%j → %s', (rgb, red) => {
    expect(isRed(rgb)).toBe(red);
  });
});

describe('sanitizeRuleHtml', () => {
  it('режет опасное', () => {
    const dirty =
      '<b onclick="x()">a</b><script>x</script><img src="javascript:x" onerror="y"><a href="http://ok/">l</a><span class="punish evil">p</span><iframe></iframe>';
    const clean = sanitizeRuleHtml(dirty);
    expect(clean).toBe('<b>a</b><img /><a href="http://ok/">l</a><span class="punish">p</span>');
  });
});
