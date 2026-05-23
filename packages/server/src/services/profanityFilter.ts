// Blocked words list — checked as substrings of the lowercased username.
// Keep sorted for readability. This is intentionally not exhaustive but covers
// the most common offensive terms and slurs.
const BLOCKED_WORDS = [
  'anal',
  'anus',
  'arse',
  'ass',
  'ballsack',
  'bastard',
  'bitch',
  'blowjob',
  'bollock',
  'boner',
  'boob',
  'butt',
  'chink',
  'clit',
  'cock',
  'coon',
  'crap',
  'cunt',
  'damn',
  'dick',
  'dildo',
  'dyke',
  'fag',
  'feck',
  'fellat',
  'fuck',
  'goddamn',
  'homo',
  'jerk',
  'jizz',
  'kike',
  'knob',
  'labia',
  'muff',
  'negro',
  'nigga',
  'nigger',
  'nonce',
  'nude',
  'penis',
  'piss',
  'poop',
  'porn',
  'prick',
  'pube',
  'pussy',
  'queer',
  'rape',
  'rectum',
  'retard',
  'scrot',
  'semen',
  'sex',
  'shit',
  'slut',
  'smegma',
  'spic',
  'spunk',
  'tit',
  'tosser',
  'turd',
  'twat',
  'vagina',
  'wank',
  'whore',
];

// Words that should always be blocked as substrings (never appear in legitimate words)
const ALWAYS_BLOCK = new Set([
  'fuck', 'nigger', 'nigga', 'cunt', 'kike', 'spic', 'twat', 'slut', 'whore',
]);

// Usernames that contain blocked substrings but are clearly not profane.
// Checked against the lowercased username before profanity scanning.
const ALLOWED_SUBSTRINGS = new Set([
  'assassin', 'class', 'classic', 'bass', 'mass', 'pass', 'grass',
  'cockpit', 'cocktail', 'hancock', 'peacock',
  'scunthorpe', 'dickens', 'dickson',
  'therapist', 'buckshot',
]);

export function containsProfanity(username: string): boolean {
  const lower = username.toLowerCase();

  // Mark character ranges belonging to a known-safe substring so a blocked
  // word appearing *inside* such a word (e.g. "ass" in "grass", "cunt" in
  // "scunthorpe") is exempt — but unrelated profanity elsewhere is still caught.
  const covered = new Array<boolean>(lower.length).fill(false);
  for (const safe of ALLOWED_SUBSTRINGS) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(safe, from);
      if (idx === -1) break;
      for (let i = idx; i < idx + safe.length; i++) covered[i] = true;
      from = idx + 1;
    }
  }

  const isCovered = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (!covered[i]) return false;
    return true;
  };

  return BLOCKED_WORDS.some((word) => {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(word, from);
      if (idx === -1) return false;
      from = idx + 1;
      const end = idx + word.length;
      if (isCovered(idx, end)) continue; // benign occurrence, keep scanning
      if (ALWAYS_BLOCK.has(word)) return true;
      const before = idx === 0 || !/[a-z0-9]/.test(lower[idx - 1]);
      const after = end >= lower.length || !/[a-z0-9]/.test(lower[end]);
      if (before && after) return true;
    }
  });
}
