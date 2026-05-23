import { describe, it, expect } from 'vitest';
import { containsProfanity } from '../profanityFilter.js';

describe('containsProfanity', () => {
  it('blocks profanity even when a benign substring is also present', () => {
    expect(containsProfanity('passfuck')).toBe(true);   // "pass" must not exempt "fuck"
    expect(containsProfanity('classnigger')).toBe(true); // "class" must not exempt "nigger"
    expect(containsProfanity('grasscunt')).toBe(true);
  });

  it('still allows benign words whose only match is inside an allowed substring', () => {
    expect(containsProfanity('grass')).toBe(false);       // "ass" inside "grass"
    expect(containsProfanity('classic')).toBe(false);
    expect(containsProfanity('scunthorpe')).toBe(false);  // "cunt" inside "scunthorpe"
    expect(containsProfanity('cocktail')).toBe(false);
  });

  it('blocks bare slurs and respects word boundaries for milder words', () => {
    expect(containsProfanity('fuck')).toBe(true);
    expect(containsProfanity('alice')).toBe(false);
    expect(containsProfanity('ass')).toBe(true);          // standalone, boundaries satisfied
  });
});
