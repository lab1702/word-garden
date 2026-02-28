import { describe, it, expect, beforeAll } from 'vitest';
import { loadDictionary, isValidWord } from '../dictionary.js';

describe('dictionary', () => {
  beforeAll(async () => {
    await loadDictionary();
  });

  it('accepts common valid words', () => {
    expect(isValidWord('HELLO')).toBe(true);
    expect(isValidWord('WORLD')).toBe(true);
    expect(isValidWord('QUIZ')).toBe(true);
  });

  it('rejects invalid words', () => {
    expect(isValidWord('XYZZY')).toBe(false);
    expect(isValidWord('ASDFG')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isValidWord('hello')).toBe(true);
    expect(isValidWord('Hello')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidWord('')).toBe(false);
  });
});
