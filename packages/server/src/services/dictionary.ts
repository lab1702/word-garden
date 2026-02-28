import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let words: Set<string> | null = null;

export async function loadDictionary(): Promise<void> {
  if (words) return;
  const filePath = join(__dirname, '../../data/enable.txt');
  const content = await readFile(filePath, 'utf-8');
  words = new Set(
    content
      .split('\n')
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length > 0)
  );
  console.log(`Dictionary loaded: ${words.size} words`);
}

export function isValidWord(word: string): boolean {
  if (!words) throw new Error('Dictionary not loaded');
  if (!word || word.length === 0) return false;
  return words.has(word.toUpperCase());
}
