// profanity.js — shared server-side profanity filter.
// Mirrors the normalisation used by routes/player.js (display-name rejection)
// so chat and names are filtered consistently. player.js keeps its own copy to
// avoid touching the existing REST routes; keep these word lists in sync.

const PROFANITY = [
  'fuck', 'fack', 'fuk', 'fuc', 'phuck',
  'shit', 'shyt', 'bitch', 'biatch', 'cunt',
  'asshole', 'ass', 'dick', 'pussy', 'cock', 'twat',
  'nigger', 'nigga', 'faggot', 'faggit', 'whore', 'slut', 'bastard',
];

const LEET_SUBSTITUTIONS = {
  '@': 'a', '4': 'a', '3': 'e', '0': 'o', '1': 'i', '!': 'i', '$': 's', '5': 's',
};

// Lowercase, apply leet substitutions, strip everything that isn't a-z.
function normaliseForProfanity(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4301!$5]/g, (ch) => LEET_SUBSTITUTIONS[ch] || ch)
    .replace(/[^a-z]/g, '');
}

function containsProfanity(text) {
  const normalised = normaliseForProfanity(text);
  return PROFANITY.some((word) => normalised.includes(word));
}

// Mask offending whitespace-delimited tokens with *** (keeps clean words).
function maskProfanity(text) {
  return String(text)
    .split(/(\s+)/)
    .map((token) => (/\S/.test(token) && containsProfanity(token) ? '***' : token))
    .join('');
}

module.exports = { normaliseForProfanity, containsProfanity, maskProfanity };
