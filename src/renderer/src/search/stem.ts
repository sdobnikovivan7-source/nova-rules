/**
 * Общий токенайзер индекса и запроса (§10.4): нижний регистр, ё → е, русский Snowball.
 * Без DOM — работает в Web Worker, в окне и в vitest.
 */
import { newStemmer } from 'snowball-stemmers';

const ru = newStemmer('russian');

/** Слова, которые не помогают искать, а только шумят */
const STOP = new Set(
  'а без в во где да для до же за и из или как к ко ли на над не ни но о об от по под при про с со то у уже чем что это'.split(
    ' ',
  ),
);

export const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Слово: буквы (кириллица, латиница) и цифры; дефис делит («RolePlay-ситуаций» → 2 слова) */
const WORD = /[\p{L}\p{N}]+/gu;

export type Token = { word: string; start: number; end: number };

/** Слова исходного текста с позициями — для подсветки */
export function words(text: string): Token[] {
  return [...text.matchAll(WORD)].map((m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

export const tokenize = (text: string): string[] => text.match(WORD) ?? [];

/** Основа слова или null для стоп-слова */
export function processTerm(term: string): string | null {
  const w = normalize(term);
  if (STOP.has(w)) return null;
  // латиница и числа как есть; русский стеммер на коротких словах только портит («капт»)
  if (!/[а-я]/.test(w) || w.length <= 3) return w;
  return ru.stem(w);
}
