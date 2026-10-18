/**
 * Поиск по правилам (§10.4): индекс MiniSearch по пунктам, синонимы сленга, поиск по номеру
 * («1.2», «крайм 1.2»), пояснение к выдаче и диапазоны подсветки.
 * Без DOM: работает в Web Worker (search/worker.ts) и в тестах.
 */
import MiniSearch, { type Query } from 'minisearch';
import type { SearchRow } from '@shared/ipc';
import { normalize, processTerm, tokenize, words } from './stem';

export type CategoryRef = { id: string; title: string; fullTitle: string };

export type Hit = {
  row: SearchRow;
  score: number;
  /** Основы слов пункта, которые совпали, — для подсветки */
  terms: string[];
  /** Позиция в корпусе (документы и пункты по порядку) */
  order: number;
};

export type Explain = {
  mode: 'text' | 'number';
  /** Совпали другие формы слова («капта» на запрос «капт») */
  forms: boolean;
  /** Совпало с опечаткой */
  typos: boolean;
  /** Сработавшие синонимы: «дм» → «deathmatch» */
  synonyms: { word: string; shown: string }[];
  /** Номер пункта и категория / документ, к которым он сужен */
  number?: string;
  scope?: string;
};

export type SearchResult = { hits: Hit[]; explain: Explain };

export const MAX_HITS = 300;

const NUMBER = /^\d+(?:\.\d+)*\.?$/;

/**
 * Где ищем. Номер пункта — отдельно точным совпадением (byNumber): в общем индексе «1.2»
 * распался бы на «1» и «2» и цеплял числа из текста. Заголовок документа не даёт совпадения
 * сам по себе (иначе запрос «война» вернул бы все пункты «Правил войны за территории»),
 * а только поднимает пункт выше — boostDocument.
 */
const FIELDS = ['text', 'notes', 'punish'] as const;

/** Во сколько раз поднять пункт, если слово запроса есть в заголовке его документа */
const DOC_TITLE_BOOST = 1.5;

/** Опечатки: до 1 правки в словах от 5 букв, до 2 — от 9 */
const FUZZY = (term: string) => (term.length >= 9 ? 2 : term.length >= 5 ? 1 : false);

export class SearchEngine {
  private readonly index: MiniSearch<SearchRow & { idx: number }>;
  /** Основы слов заголовка документа для каждого пункта */
  private readonly titleStems: string[][];

  constructor(
    private readonly rows: SearchRow[],
    private readonly synonyms: Record<string, string[]>,
    private readonly categories: CategoryRef[],
  ) {
    this.index = new MiniSearch({
      idField: 'idx',
      fields: [...FIELDS],
      tokenize,
      processTerm,
      searchOptions: {
        boost: { text: 1, notes: 0.6, punish: 0.8 },
        prefix: true,
        boostDocument: (idx: number, term: string) =>
          this.titleStems[idx]!.some((t) => t.startsWith(term)) ? DOC_TITLE_BOOST : 1,
      },
    });
    const byDoc = new Map<number, string[]>();
    this.titleStems = rows.map((r) => {
      let stems = byDoc.get(r.docId);
      if (!stems) {
        stems = tokenize(r.docTitle).flatMap((w) => processTerm(w) ?? []);
        byDoc.set(r.docId, stems);
      }
      return stems;
    });
    this.index.addAll(rows.map((r, idx) => ({ ...r, idx })));
  }

  search(raw: string): SearchResult {
    const query = raw.trim();
    const empty: SearchResult = {
      hits: [],
      explain: { mode: 'text', forms: false, typos: false, synonyms: [] },
    };
    if (!query) return empty;
    return this.byNumber(query) ?? this.byText(query);
  }

  // ── номер пункта ───────────────────────────────────────────
  /** «1.2», «1.2.» или «крайм 1.2» / «капт 2.1»; null — запрос не про номер */
  private byNumber(query: string): SearchResult | null {
    const parts = query.split(/\s+/);
    const numIdx = parts.findIndex((p) => NUMBER.test(p));
    // одиночное число без точки («5») — скорее слово, чем номер, если рядом есть текст
    if (numIdx < 0) return null;
    const number = parts[numIdx]!.replace(/\.$/, '');
    const rest = parts.filter((_, i) => i !== numIdx).join(' ');
    if (!number.includes('.') && rest) return null;

    let rows = this.rows
      .map((row, order) => ({ row, order }))
      .filter(({ row }) => row.number === number);
    let scope: string | undefined;
    if (rest) {
      const cat = this.resolveCategory(rest);
      if (cat) {
        rows = rows.filter(({ row }) => row.categoryId === cat.id);
        scope = cat.title;
      } else {
        // не категория — пусть сужает по названию документа
        const stems = tokenize(rest)
          .map(processTerm)
          .filter((s): s is string => !!s);
        rows = rows.filter(({ row }) => {
          const title = tokenize(row.docTitle).map((w) => processTerm(w) ?? '');
          return stems.every((s) => title.some((t) => t.startsWith(s)));
        });
        scope = rest;
      }
    }
    if (rows.length === 0) return null;
    return {
      hits: rows.slice(0, MAX_HITS).map(({ row, order }) => ({ row, order, score: 1, terms: [] })),
      explain: {
        mode: 'number',
        forms: false,
        typos: false,
        synonyms: [],
        number,
        ...(scope ? { scope } : {}),
      },
    };
  }

  /** «крайм», «криминал», «гос», «семьи» → категория */
  resolveCategory(text: string): CategoryRef | null {
    const w = normalize(text.trim());
    const candidates = [w, ...(this.synonyms[w] ?? []).map((s) => normalize(s.replaceAll('*', '')))]
      .map((c) => (c.includes(' ') ? c : (processTerm(c) ?? c)))
      .filter((c) => c.length >= 3);
    for (const cat of this.categories) {
      const catWords = tokenize(normalize(`${cat.title} ${cat.fullTitle}`));
      if (candidates.some((c) => catWords.some((cw) => cw.startsWith(c)))) return cat;
    }
    return null;
  }

  // ── текст ──────────────────────────────────────────────────
  private byText(query: string): SearchResult {
    const tokens = tokenize(query);
    const meaningful = tokens.filter((t) => processTerm(t) !== null);
    const use = meaningful.length ? meaningful : tokens;

    /** основа → слово запроса / синоним, из которого она пришла */
    const fromSynonym = new Map<string, { word: string; alt: string }>();
    const ownStems = new Set<string>();

    const groups: Query[] = use.map((token) => {
      const key = normalize(token);
      const own = processTerm(token) ?? key;
      ownStems.add(own);
      const alts = (this.synonyms[key] ?? []).filter((a) => normalize(a) !== key);
      for (const alt of alts) {
        for (const w of tokenize(alt)) {
          const s = processTerm(w);
          if (s && s !== own && !fromSynonym.has(s)) fromSynonym.set(s, { word: token, alt });
        }
      }
      if (!alts.length) return token;
      return {
        combineWith: 'OR',
        queries: [token, ...alts.map((a) => ({ combineWith: 'AND' as const, queries: [a] }))],
      };
    });

    // сначала точно (с префиксом — формы слова), затем с опечатками, затем любым из слов
    const and = { combineWith: 'AND' as const, queries: groups };
    let results = this.index.search(and);
    let typos = false;
    if (results.length === 0) {
      results = this.index.search({ ...and, fuzzy: FUZZY });
      typos = results.length > 0;
    }
    if (results.length === 0 && groups.length > 1) {
      results = this.index.search({ combineWith: 'OR', queries: groups, fuzzy: FUZZY });
      typos = true;
    }

    const hits: Hit[] = results.slice(0, MAX_HITS).map((r) => ({
      row: this.rows[r.id as number]!,
      score: r.score,
      terms: r.terms,
      order: r.id as number,
    }));

    // пояснение: какие основы запроса сработали и как
    // формы слова: в найденных пунктах подсвечено слово, написанное не так, как в запросе
    const typed = new Set(use.map(normalize));
    let forms = false;
    for (const h of hits.slice(0, 30)) {
      const own = h.terms.filter((t) => !fromSynonym.has(t) || ownStems.has(t));
      const hit = matchRanges(h.row.text, own).some(
        ([st, en]) => !typed.has(normalize(h.row.text.slice(st, en))),
      );
      if (hit) {
        forms = true;
        break;
      }
    }
    const usedSyn = new Map<string, { word: string; alt: string }>();
    for (const r of results.slice(0, 100)) {
      for (const qt of r.queryTerms) {
        const syn = fromSynonym.get(qt);
        // двухбуквенные латинские сокращения («dm») в пояснении не нужны
        if (syn && !ownStems.has(qt) && syn.alt.length > 3 && !usedSyn.has(syn.alt)) {
          usedSyn.set(syn.alt, syn);
        }
      }
    }

    return {
      hits,
      explain: {
        mode: 'text',
        forms,
        typos,
        synonyms: [...usedSyn.values()].slice(0, 2).map(({ word, alt }) => ({
          word,
          shown: readable(alt, hits),
        })),
      },
    };
  }
}

/**
 * Синоним для пояснения. Записанный полностью («война за территорию») показывается как есть;
 * основа со звёздочкой («государственн*») — полной формой из текста найденного пункта
 * («государственных»). На поиск звёздочка не влияет: токенизатор её не видит.
 */
export function readable(alt: string, hits: readonly Hit[]): string {
  if (!alt.includes('*')) return alt;
  const plain = alt.replaceAll('*', '');
  // слова синонима по основам: «полици*» найдёт и «полиции», и «полицейский»
  const need = tokenize(plain).map((w) => processTerm(w) ?? normalize(w));
  if (!need.length) return plain;
  for (const { row } of hits.slice(0, 50)) {
    const text = `${row.text} ${row.notes}`;
    const ws = words(text);
    for (let i = 0; i + need.length <= ws.length; i++) {
      const ok = need.every((n, j) => {
        const w = ws[i + j]!.word;
        return (processTerm(w) ?? normalize(w)).startsWith(n) || normalize(w).startsWith(n);
      });
      if (ok) return text.slice(ws[i]!.start, ws[i + need.length - 1]!.end).toLowerCase();
    }
  }
  return plain;
}

/** Диапазоны слов текста, чьи основы совпали с запросом */
export function matchRanges(text: string, terms: readonly string[]): [number, number][] {
  if (!terms.length) return [];
  const set = new Set(terms);
  return words(text)
    .filter((w) => {
      const s = processTerm(w.word);
      return s !== null && set.has(s);
    })
    .map((w) => [w.start, w.end]);
}
