/** У пакета нет своих типов — только то, что используется */
declare module 'snowball-stemmers' {
  export interface Stemmer {
    stem(word: string): string;
  }
  export function newStemmer(language: 'russian' | 'english'): Stemmer;
  export function algorithms(): string[];
}
