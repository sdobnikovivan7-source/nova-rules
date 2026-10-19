/**
 * Строки поста → разделы → пункты.
 *
 * Классы строк:
 *   заголовок раздела — «1. Общее положение», «Раздел 2. …», крупный / цветной текст без номера;
 *   пункт            — «1.1 …», подпункт — «1.1.2 …» (глубина по числу точек);
 *   примечание       — по слову-метке «Примечание / Исключение / Пример / Пояснение / Уточнение / Дополнение»;
 *   наказание        — после первого «|» или красный хвост строки;
 *   продолжение      — всё остальное, дописывается к текущему пункту.
 * Если нумерованных пунктов нет (лор, правила форума списком), документ
 * собирается из абзацев / пунктов списка без номеров.
 */
import { createHash } from 'node:crypto';
import type { Note, NoteType, Punishment, Rule, Section } from '@shared/schema';
import { type Line, type Seg, lineText, normalizeText, renderLine, sanitizeRuleHtml } from './clean';
import { looksLikePunishment, parsePunishment } from './punishment';

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export const ruleHash = (text: string, punishRaw: string | undefined, notes: { text: string }[]) =>
  sha1([text, punishRaw ?? '', ...notes.map((n) => n.text)].join('\u0001'));

// ---------------------------------------------------------------- распознавание

/** «1.1», «1.1.», «2.10.3» */
const DOTTED_RE = /^(\d{1,2}(?:\.\d{1,3})+)\.?(?=[\s)\-–—:]|$|[А-ЯЁA-Z])[\s)\-–—:]*/;
/** «1.», «1)», «Раздел 1.», «Глава 2» */
const SINGLE_RE = /^(?:(раздел|глава|часть)\s+(\d{1,2})[.):]?|(\d{1,2})[.)])(?=\s|$)[\s\-–—:]*/i;

const NOTE_RE =
  /^(примечани[ея]|исключени[ея]|примеры?|пояснени[ея]|уточнени[ея]|дополнени[ея])(?:\s*№?\s*\d+)?\s*(?:[:.\-–—]|$)\s*/i;

const NOTE_TYPES: Record<string, NoteType> = {
  примечани: 'note',
  исключени: 'exception',
  пример: 'example',
  пояснени: 'clarification',
  уточнени: 'clarification',
  дополнени: 'addition',
};

function noteTypeOf(label: string): NoteType {
  const l = label.toLowerCase();
  for (const [k, v] of Object.entries(NOTE_TYPES)) if (l.startsWith(k)) return v;
  return 'note';
}

type NumMatch = { number: string; dotted: boolean; titled: boolean; length: number };

function matchNumber(text: string): NumMatch | null {
  const d = DOTTED_RE.exec(text);
  if (d) return { number: d[1]!, dotted: true, titled: false, length: d[0].length };
  // одиночное число без точки и без «Раздел» — это не номер («10 на сервере …»)
  const s = SINGLE_RE.exec(text);
  if (s) return { number: (s[2] ?? s[3])!, dotted: false, titled: !!s[1], length: s[0].length };
  return null;
}

const textSegs = (l: Line) =>
  l.segs.filter((s): s is Extract<Seg, { kind: 'text' }> => s.kind === 'text' && !!s.text.trim());

/**
 * Заголовок без номера: крупный / цветной / жирный по центру текст.
 * newMajor — следующая строка начинает новый крупный номер (3.13 → 4.1),
 * это сильный признак, что жирная строка перед ней — заголовок.
 */
function isHeadingStyled(l: Line, text: string, newMajor: boolean): boolean {
  const segs = textSegs(l);
  if (!segs.length || l.inList || text.length > 90) return false;
  // красный заголовок бывает («BLOODS STREET GANG:»), красное наказание — нет
  if (segs.some((s) => s.fmt.punish) && looksLikePunishment(text)) return false;
  const big = segs.every((s) => s.fmt.big);
  if (big) return true;
  const letters = text.replace(/[^a-zа-яё]/gi, '');
  if (letters.length < 3) return false;
  const bold = segs.every((s) => s.fmt.b || s.fmt.color);
  // «BLOODS STREET GANG:», «ОГРАБЛЕНИЕ КАПИТОЛИЯ:»
  const upper = letters.length >= 4 && letters.replace(/[^A-ZА-ЯЁ]/g, '').length / letters.length > 0.8;
  if (text.includes('|') && !(bold && newMajor)) return false;
  if (/[.,;]$/.test(text)) return false;
  if (/:$/.test(text) && !(bold && (l.center || newMajor || upper))) return false;
  const colored = segs.every((s) => s.fmt.color);
  return colored || (bold && (l.center || newMajor || upper));
}

const topOf = (n: string | null | undefined) => n?.split('.')[0] ?? null;

// ---------------------------------------------------------------- склеенные пункты

/** Номера, которые могут идти следом за n: 1.5.2 → 1.5.3, 1.5.2.1, 1.6, 2 */
function successors(n: string): Set<string> {
  const parts = n.split('.').map(Number);
  const out = new Set<string>([`${n}.1`]);
  for (let k = parts.length; k >= 2; k--) {
    const p = parts.slice(0, k);
    p[k - 1]! += 1;
    out.add(p.join('.'));
    out.add(`${p.join('.')}.1`);
  }
  return out;
}

const GLUED_RE = /(\d{1,2}(?:\.\d{1,3})+)\.?(?=\s?[А-ЯЁA-Z«"(])/g;

function splitSegsAt(segs: Seg[], offset: number): [Seg[], Seg[]] {
  const a: Seg[] = [];
  const b: Seg[] = [];
  let pos = 0;
  for (const s of segs) {
    const len = s.kind === 'text' ? s.text.length : 0;
    if (pos + len <= offset || (s.kind !== 'text' && pos < offset)) a.push(s);
    else if (pos >= offset) b.push(s);
    else if (s.kind === 'text') {
      a.push({ ...s, text: s.text.slice(0, offset - pos).trimEnd() });
      b.push({ ...s, text: s.text.slice(offset - pos) });
    }
    pos += len;
  }
  return [a, b];
}

/**
 * «…не была завершена. 1.5.3Капт разрешено…» — автор забыл перенос строки.
 * Режем строку, если внутри после конца предложения стоит следующий по порядку номер.
 */
function splitGluedRules(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const line of lines) {
    let cur = line;
    for (;;) {
      const text = lineText(cur.segs);
      const head = DOTTED_RE.exec(text);
      if (!head) break;
      const next = successors(head[1]!);
      let cut = -1;
      for (const m of text.matchAll(GLUED_RE)) {
        if (m.index! <= head[0].length || !next.has(m[1]!)) continue;
        if (!/[.!?;:»")]\s*$/.test(text.slice(0, m.index))) continue;
        cut = m.index!;
        break;
      }
      if (cut < 0) break;
      // края строки уже обрезаны (trimSegs), поэтому смещение в тексте = смещение в сегментах
      const [a, b] = splitSegsAt(cur.segs, cut);
      out.push({ ...cur, segs: a });
      cur = { ...cur, segs: b, list: undefined };
    }
    out.push(cur);
  }
  return out;
}

function isPunishOnly(l: Line): boolean {
  const segs = textSegs(l);
  if (!segs.length) return false;
  const text = lineText(l.segs);
  if (/^\|/.test(text)) return true;
  return segs.every((s) => s.fmt.punish) && looksLikePunishment(text);
}

const isMediaOnly = (l: Line) => !textSegs(l).length;

// ---------------------------------------------------------------- работа с сегментами

/** Отрезать первые n символов текста строки (номер, метку примечания) */
function dropPrefix(segs: Seg[], n: number): Seg[] {
  const out: Seg[] = [];
  let left = n;
  for (const s of segs) {
    if (left <= 0 || s.kind !== 'text') {
      if (left <= 0) out.push(s);
      continue;
    }
    if (s.text.length <= left) {
      left -= s.text.length;
      continue;
    }
    out.push({ ...s, text: s.text.slice(left).trimStart() });
    left = 0;
  }
  return out;
}

/** Разрезать строку по первому «|»: [до, после] или null */
function splitAtPipe(segs: Seg[]): [Seg[], Seg[]] | null {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.kind !== 'text') continue;
    const at = s.text.indexOf('|');
    if (at < 0) continue;
    const before = [...segs.slice(0, i), { ...s, text: s.text.slice(0, at).trimEnd() }];
    const after = [{ ...s, text: s.text.slice(at + 1).trimStart() }, ...segs.slice(i + 1)];
    return [before, after];
  }
  return null;
}

/** Красный хвост строки: [тело, хвост] или null */
function splitRedTail(segs: Seg[]): [Seg[], Seg[]] | null {
  let i = segs.length;
  while (i > 0) {
    const s = segs[i - 1]!;
    if (s.kind === 'text' && (s.fmt.punish || !s.text.trim())) i--;
    else break;
  }
  if (i === segs.length || i === 0) return null;
  const tail = segs.slice(i);
  if (!looksLikePunishment(lineText(tail))) return null;
  return [segs.slice(0, i), tail];
}

// ---------------------------------------------------------------- сборка

type Block = { segs: Seg[]; list?: { ordered: boolean } };

type DraftNote = { type: NoteType; blocks: Block[] };

type DraftRule = {
  number: string | null;
  depth: number;
  blocks: Block[];
  notes: DraftNote[];
  punishLine?: Seg[];
};

type DraftSection = { title: string | null; intro: Block[]; rules: DraftRule[] };

function renderBlocks(blocks: Block[]): string {
  let html = '';
  let openList: 'ul' | 'ol' | null = null;
  for (const b of blocks) {
    const line = renderLine(b.segs);
    if (b.list) {
      const tag = b.list.ordered ? 'ol' : 'ul';
      if (openList !== tag) {
        if (openList) html += `</${openList}>`;
        html += `<${tag}>`;
        openList = tag;
      }
      html += `<li>${line}</li>`;
      continue;
    }
    if (openList) {
      html += `</${openList}>`;
      openList = null;
    } else if (html) html += '<br>';
    html += line;
  }
  if (openList) html += `</${openList}>`;
  return sanitizeRuleHtml(html);
}

const blocksText = (blocks: Block[]) =>
  normalizeText(blocks.map((b) => lineText(b.segs)).join('\n')).trim();

export type StructureResult = {
  sections: Section[];
  numbered: number;
  paragraphMode: boolean;
};

export function buildStructure(rawLines: Line[], docId: number): StructureResult {
  const lines = splitGluedRules(rawLines);
  const hasDotted = lines.some((l) => DOTTED_RE.test(lineText(l.segs)));
  const singleNumbered = lines.filter((l) => {
    const m = matchNumber(lineText(l.segs));
    return m && !m.dotted && !m.titled;
  }).length;
  // «Плоский» документ: пункты пронумерованы «1.», «2.» без подпунктов
  const flatNumbered = !hasDotted && singleNumbered >= 3;
  const paragraphMode = !hasDotted && !flatNumbered;

  const sections: DraftSection[] = [{ title: null, intro: [], rules: [] }];
  let section = sections[0]!;
  let rule: DraftRule | null = null;
  let note: DraftNote | null = null;

  const newSection = (title: string) => {
    // пустой безымянный раздел в начале просто получает заголовок;
    // подряд идущие заголовки остаются отдельными (пустой раздел = подзаголовок)
    if (!section.title && !section.rules.length && !section.intro.length) {
      section.title = title;
    } else {
      section = { title, intro: [], rules: [] };
      sections.push(section);
    }
    rule = null;
    note = null;
  };

  const newRule = (number: string | null, depth: number, segs: Seg[], list?: Block['list']) => {
    rule = { number, depth, blocks: [{ segs, list }], notes: [] };
    section.rules.push(rule);
    note = null;
  };

  for (const [i, l] of lines.entries()) {
    const text = lineText(l.segs);
    const r = rule as DraftRule | null;
    const n = note as DraftNote | null;

    if (isMediaOnly(l)) {
      if (n) n.blocks.push({ segs: l.segs });
      else if (r) r.blocks.push({ segs: l.segs });
      else section.intro.push({ segs: l.segs });
      continue;
    }

    const noteM = NOTE_RE.exec(text);
    if (noteM) {
      const draft: DraftNote = { type: noteTypeOf(noteM[1]!), blocks: [] };
      const rest = dropPrefix(l.segs, noteM[0].length);
      if (rest.some((s) => s.kind !== 'text' || s.text.trim())) draft.blocks.push({ segs: rest });
      if (r) {
        r.notes.push(draft);
        note = draft;
      } else {
        section.intro.push({ segs: l.segs });
      }
      continue;
    }

    const num = paragraphMode ? null : matchNumber(text);
    if (num) {
      const body = dropPrefix(l.segs, num.length);
      if (num.dotted) {
        newRule(num.number, num.number.split('.').length - 2, body);
        continue;
      }
      const bodyText = lineText(body);
      const headingLike = num.titled || (hasDotted && bodyText.length <= 120 && !bodyText.includes('|'));
      if (headingLike) newSection(text.replace(/[.:]$/, ''));
      else newRule(num.number, 0, body);
      continue;
    }

    const nextText = lines.slice(i + 1).find((x) => !isMediaOnly(x));
    const nextNum = nextText && !paragraphMode ? matchNumber(lineText(nextText.segs)) : null;
    const newMajor = !!nextNum && !!r && topOf(nextNum.number) !== topOf(r.number);
    if (isHeadingStyled(l, text, newMajor)) {
      newSection(text);
      continue;
    }

    if (r && !r.punishLine && isPunishOnly(l)) {
      r.punishLine = l.segs;
      continue;
    }

    if (paragraphMode) {
      // абзацы и пункты списка становятся пунктами без номера
      if (n && (l.indent || !n.blocks.length)) n.blocks.push({ segs: l.segs });
      else if (r && l.inList && !l.list) r.blocks.push({ segs: l.segs });
      else newRule(l.list?.ordered ? String(l.list.index) : null, l.list?.depth ?? 0, l.segs);
      continue;
    }

    if (n && (l.indent || !n.blocks.length)) n.blocks.push({ segs: l.segs });
    else if (r) {
      note = null;
      r.blocks.push({ segs: l.segs, list: l.list ? { ordered: l.list.ordered } : undefined });
    } else section.intro.push({ segs: l.segs, list: l.list ? { ordered: l.list.ordered } : undefined });
  }

  return finalize(sections, docId, paragraphMode);
}

function extractPunishment(rule: DraftRule): Punishment | undefined {
  for (let i = 0; i < rule.blocks.length; i++) {
    const split = splitAtPipe(rule.blocks[i]!.segs);
    if (!split) continue;
    const [before, after] = split;
    let raw = lineText(after);
    rule.blocks[i] = { ...rule.blocks[i]!, segs: before };
    if (!raw && rule.punishLine) {
      raw = lineText(rule.punishLine);
      rule.punishLine = undefined;
    }
    if (raw) return parsePunishment(raw);
  }
  if (rule.punishLine) return parsePunishment(lineText(rule.punishLine));
  const first = rule.blocks[0];
  if (first) {
    const tail = splitRedTail(first.segs);
    if (tail) {
      rule.blocks[0] = { ...first, segs: tail[0] };
      return parsePunishment(lineText(tail[1]));
    }
  }
  return undefined;
}

function finalize(drafts: DraftSection[], docId: number, paragraphMode: boolean): StructureResult {
  const usedIds = new Map<string, number>();
  let unnumbered = 0;
  let numbered = 0;

  const sections: Section[] = drafts
    .filter((s) => s.title || s.intro.length || s.rules.length)
    .map((s, si) => {
      const rules: Rule[] = s.rules.map((d) => {
        const punishment = extractPunishment(d);
        const blocks = d.blocks.filter((b) => b.segs.length);
        const notes: Note[] = d.notes
          .filter((n) => n.blocks.length)
          .map((n) => ({ type: n.type, html: renderBlocks(n.blocks), text: blocksText(n.blocks) }));
        const text = blocksText(blocks);

        let id: string;
        if (d.number && !paragraphMode) {
          numbered++;
          const base = `${docId}:${d.number}`;
          const k = (usedIds.get(base) ?? 0) + 1;
          usedIds.set(base, k);
          id = k === 1 ? base : `${base}~${k}`;
        } else {
          id = `${docId}:p${++unnumbered}`;
        }

        const hash = ruleHash(text, punishment?.raw, notes);
        return {
          id,
          number: d.number,
          depth: Math.max(0, d.depth),
          html: renderBlocks(blocks),
          text,
          ...(punishment ? { punishment } : {}),
          ...(notes.length ? { notes } : {}),
          hash,
        };
      });
      const intro = s.intro.length ? renderBlocks(s.intro) : undefined;
      return {
        id: `${docId}:s${si + 1}`,
        title: s.title,
        ...(intro ? { intro } : {}),
        rules,
      };
    });

  return { sections, numbered, paragraphMode };
}
