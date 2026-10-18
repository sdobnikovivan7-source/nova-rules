import { readFileSync } from 'node:fs';
import path from 'node:path';

export const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');

export function fixture(rel: string): string {
  return readFileSync(path.join(fixturesDir, rel), 'utf8');
}
