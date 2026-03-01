import type { Tile } from './types.js';

export const TILE_DISTRIBUTION: { letter: string; points: number; count: number }[] = [
  { letter: 'A', points: 1,  count: 9 },
  { letter: 'B', points: 3,  count: 2 },
  { letter: 'C', points: 3,  count: 2 },
  { letter: 'D', points: 2,  count: 4 },
  { letter: 'E', points: 1,  count: 12 },
  { letter: 'F', points: 4,  count: 2 },
  { letter: 'G', points: 2,  count: 3 },
  { letter: 'H', points: 4,  count: 2 },
  { letter: 'I', points: 1,  count: 9 },
  { letter: 'J', points: 8,  count: 1 },
  { letter: 'K', points: 5,  count: 1 },
  { letter: 'L', points: 1,  count: 4 },
  { letter: 'M', points: 3,  count: 2 },
  { letter: 'N', points: 1,  count: 6 },
  { letter: 'O', points: 1,  count: 8 },
  { letter: 'P', points: 3,  count: 2 },
  { letter: 'Q', points: 10, count: 1 },
  { letter: 'R', points: 1,  count: 6 },
  { letter: 'S', points: 1,  count: 4 },
  { letter: 'T', points: 1,  count: 6 },
  { letter: 'U', points: 1,  count: 4 },
  { letter: 'V', points: 4,  count: 2 },
  { letter: 'W', points: 4,  count: 2 },
  { letter: 'X', points: 8,  count: 1 },
  { letter: 'Y', points: 4,  count: 2 },
  { letter: 'Z', points: 10, count: 1 },
  { letter: '',  points: 0,  count: 2 }, // blanks
];

// Maps letter -> point value. Blank tiles are excluded (they score 0 when played).
export const LETTER_POINTS: ReadonlyMap<string, number> = new Map(
  TILE_DISTRIBUTION
    .filter(({ letter }) => letter !== '')
    .map(({ letter, points }) => [letter.toUpperCase(), points]),
);

export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;
export const TOTAL_TILES = 100;

export function createTileBag(): Tile[] {
  const bag: Tile[] = [];
  for (const { letter, points, count } of TILE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      bag.push({ letter, points });
    }
  }
  return bag;
}

/**
 * Client-only cosmetic shuffle using Math.random().
 * NOT cryptographically secure — do NOT use for game-critical randomness.
 * The server uses secureShuffleBag (crypto.randomInt) in gameEngine.ts.
 */
export function shuffleBag(bag: Tile[]): Tile[] {
  const shuffled = [...bag];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
