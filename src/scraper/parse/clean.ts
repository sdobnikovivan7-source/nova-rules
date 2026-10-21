/**
 * Очистка HTML поста XenForo и превращение его в плоский список строк.
 *
 * Посты свёрстаны вручную: вложенные span со стилями, центрирование, &#8203;,
 * теги, которые открываются до <br> и закрываются после. Поэтому DOM не
 * чистится «на месте», а обходится и раскладывается на строки из сегментов
 * с флагами форматирования. Из сегментов HTML собирается заново — в нём
 * гарантированно только разрешённые теги.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export type Fmt = {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  /** Красный текст — почти всегда наказание */
  punish?: boolean;
  /** Любой другой цвет текста */
  color?: boolean;
  /** Крупный шрифт (≥ 20px) — признак заголовка */
  big?: boolean;
  href?: string;
};

export type Seg =
  | { kind: 'text'; text: string; fmt: Fmt }
  | { kind: 'img'; src: string; alt: string }
  | { kind: 'details'; title: string; html: string; text: string };

export type ListInfo = { ordered: boolean; index: number; depth: number };

export type Line = {
  segs: Seg[];
  /** Первая строка пункта списка */
  list?: ListInfo;
  /** Внутри списка (в том числе продолжение пункта списка) */
  inList: boolean;
  /** Блок с отступом слева */
  indent: boolean;
  center: boolean;
};

const BLOCK_TAGS = new Set([
  'div', 'p', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'pre', 'hr',
]);
const SKIP_TAGS = new Set(['script', 'style', 'button', 'noscript', 'iframe', 'svg', 'form', 'input']);

// ---------------------------------------------------------------- цвета

function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const named: Record<string, [number, number, number]> = { red: [255, 0, 0], black: [0, 0, 0] };
  return named[v] ?? null;
}

/** Красная гамма: rgb(226,80,65), #e25041, rgb(209,72,65), rgb(184,49,47)… */
export function isRed([r, g, b]: [number, number, number]): boolean {
  return r >= 170 && g <= 110 && b <= 100 && r - g >= 90;
}

function isNeutral([r, g, b]: [number, number, number]): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

// ---------------------------------------------------------------- текст

export function normalizeText(s: string): string {
  return s
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/[\u00a0\t\r\n]+/g, ' ')
    .replace(/ {2,}/g, ' ');
}

function absUrl(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, baseUrl);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- линеаризация

type Ctx = { fmt: Fmt; indent: boolean; center: boolean; inList: boolean };

class Linearizer {
  readonly lines: Line[] = [];
  private cur: Seg[] = [];
  private pendingList: ListInfo | undefined;
  private listDepth = 0;
  private ctx: Ctx = { fmt: {}, indent: false, center: false, inList: false };

  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly baseUrl: string,
  ) {}

  flush() {
    const segs = trimSegs(this.cur);
    this.cur = [];
    if (!segs.length) return;
    this.lines.push({
      segs,
      list: this.pendingList,
      inList: this.ctx.inList,
      indent: this.ctx.indent,
      center: this.ctx.center,
    });
    this.pendingList = undefined;
  }

  walk(nodes: AnyNode[]) {
    for (const node of nodes) this.node(node);
  }

  private withCtx(patch: Partial<Ctx>, fn: () => void) {
    const saved = this.ctx;
    this.ctx = { ...saved, ...patch, fmt: { ...saved.fmt, ...patch.fmt } };
    try {
      fn();
    } finally {
      this.ctx = saved;
    }
  }

  private node(node: AnyNode) {
    if (node.type === 'text') {
      const text = normalizeText((node as unknown as { data: string }).data);
      if (text) this.cur.push({ kind: 'text', text, fmt: this.ctx.fmt });
      return;
    }
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
    const el = node as Element;
    const tag = el.name.toLowerCase();
    const cls = el.attribs.class ?? '';
    if (SKIP_TAGS.has(tag)) return;
    // кнопка «Нажмите, чтобы раскрыть...» у длинной цитаты — интерфейс форума, не текст
    if (cls.includes('bbCodeBlock-expandLink')) return;

    if (tag === 'br') return this.flush();

    if (cls.includes('bbCodeSpoiler') && !cls.includes('bbCodeSpoiler-')) return this.spoiler(el);

    if (tag === 'img' || cls.includes('bbImageWrapper')) {
      const img = tag === 'img' ? el : (this.$(el).find('img').get(0) as Element | undefined);
      const src = absUrl(img?.attribs['data-src'] || img?.attribs.src || el.attribs['data-src'], this.baseUrl);
      if (src) this.cur.push({ kind: 'img', src, alt: normalizeText(img?.attribs.alt ?? '') });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      this.flush();
      this.listDepth++;
      let index = 0;
      this.withCtx({ inList: true }, () => {
        for (const child of el.children) {
          if (child.type === 'tag' && (child as Element).name === 'li') {
            this.flush();
            this.pendingList = { ordered: tag === 'ol', index: ++index, depth: this.listDepth - 1 };
            this.walk((child as Element).children);
            this.flush();
          } else {
            this.node(child);
          }
        }
      });
      this.listDepth--;
      this.pendingList = undefined;
      return;
    }

    const style = el.attribs.style ?? '';
    const patch: Partial<Ctx> & { fmt: Fmt } = { fmt: {} };
    if (tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/.test(style)) patch.fmt.b = true;
    if (tag === 'i' || tag === 'em') patch.fmt.i = true;
    if (tag === 'u' || /text-decoration:[^;]*underline/.test(style)) patch.fmt.u = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') patch.fmt.s = true;
    if (tag === 'a') patch.fmt.href = absUrl(el.attribs.href, this.baseUrl);
    const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(style)?.[1];
    if (color) {
      const rgb = parseColor(color);
      if (rgb && isRed(rgb)) patch.fmt.punish = true;
      else if (rgb && !isNeutral(rgb)) patch.fmt.color = true;
    }
    const size = /font-size:\s*(\d+)px/.exec(style)?.[1];
    if (size && Number(size) >= 20) patch.fmt.big = true;
    if (/margin-left:\s*[1-9]/.test(style) || tag === 'blockquote') patch.indent = true;
    if (/text-align:\s*center/.test(style)) patch.center = true;

    const block = BLOCK_TAGS.has(tag) || cls.includes('bbCodeBlock');
    if (block) this.flush();
    this.withCtx(patch, () => this.walk(el.children));
    if (block) this.flush();
  }

  private spoiler(el: Element) {
    const $el = this.$(el);
    const title = normalizeText($el.find('.bbCodeSpoiler-button-title').first().text()).trim() || 'Спойлер';
    const content = $el.find('.bbCodeSpoiler-content').first();
    const inner = new Linearizer(this.$, this.baseUrl);
    inner.walk(content.contents().get());
    inner.flush();
    const html = inner.lines.map((l) => renderLine(l.segs)).join('<br>');
    const text = inner.lines.map((l) => lineText(l.segs)).join('\n');
    this.flush();
    this.cur.push({ kind: 'details', title, html, text });
    this.flush();
  }
}

function trimSegs(segs: Seg[]): Seg[] {
  const out = segs.filter((s) => s.kind !== 'text' || s.text !== '');
  // убрать пробельные сегменты по краям и обрезать пробелы крайних текстов
  while (out[0]?.kind === 'text' && !out[0].text.trim()) out.shift();
  while (out.at(-1)?.kind === 'text' && !(out.at(-1) as { text: string }).text.trim()) out.pop();
  const first = out[0];
  if (first?.kind === 'text') out[0] = { ...first, text: first.text.trimStart() };
  const last = out.at(-1);
  if (last?.kind === 'text') out[out.length - 1] = { ...last, text: last.text.trimEnd() };
  return out;
}

/** HTML поста → плоский список строк */
export function linearize(html: string, baseUrl: string): Line[] {
  const $ = cheerio.load(`<div id="__root">${html}</div>`, null, false);
  const lin = new Linearizer($, baseUrl);
  lin.walk($('#__root').contents().get());
  lin.flush();
  return lin.lines;
}

// ---------------------------------------------------------------- рендер

const sameFmt = (a: Fmt, b: Fmt) =>
  !!a.b === !!b.b &&
  !!a.i === !!b.i &&
  !!a.u === !!b.u &&
  !!a.s === !!b.s &&
  !!a.punish === !!b.punish &&
  a.href === b.href;

/** Сегменты → безопасный HTML. Флаги color/big в вывод не попадают. */
export function renderLine(segs: Seg[]): string {
  let out = '';
  const merged: Seg[] = [];
  for (const s of segs) {
    const prev = merged.at(-1);
    if (s.kind === 'text' && prev?.kind === 'text' && sameFmt(prev.fmt, s.fmt)) {
      merged[merged.length - 1] = { ...prev, text: prev.text + s.text };
    } else merged.push(s);
  }
  for (const s of merged) {
    if (s.kind === 'img') {
      out += `<img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.alt)}">`;
      continue;
    }
    if (s.kind === 'details') {
      out += `<details><summary>${escapeHtml(s.title)}</summary>${s.html}</details>`;
      continue;
    }
    let h = escapeHtml(s.text);
    // пустой хвост после вырезанного наказания — без «<b></b>»
    if (!s.text.trim()) {
      out += h;
      continue;
    }
    const f = s.fmt;
    if (f.punish) h = `<span class="punish">${h}</span>`;
    if (f.s) h = `<s>${h}</s>`;
    if (f.u) h = `<u>${h}</u>`;
    if (f.i) h = `<i>${h}</i>`;
    if (f.b) h = `<b>${h}</b>`;
    if (f.href) h = `<a href="${escapeHtml(f.href)}">${h}</a>`;
    out += h;
  }
  return out;
}

export function lineText(segs: Seg[]): string {
  return segs
    .map((s) => (s.kind === 'text' ? s.text : s.kind === 'details' ? `${s.title}\n${s.text}` : ''))
    .join('')
    .trim();
}

export { sanitizeRuleHtml } from './sanitize';
