import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@shared/schema';

describe('smoke', () => {
  it('schema version is defined', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
