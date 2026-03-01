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
  // Check if the username contains a known safe substring that would otherwise trigger a false positive
  for (const safe of ALLOWED_SUBSTRINGS) {
    if (lower.includes(safe)) return false;
  }
  return BLOCKED_WORDS.some((word) => {
    const idx = lower.indexOf(word);
    if (idx === -1) return false;
    // Always block the worst slurs regardless of surrounding characters
    if (ALWAYS_BLOCK.has(word)) return true;
    // Check word boundaries: start/end of string or non-alphanumeric neighbor
    const before = idx === 0 || !/[a-z0-9]/.test(lower[idx - 1]);
    const after = idx + word.length >= lower.length || !/[a-z0-9]/.test(lower[idx + word.length]);
    return before && after;
  });
}
