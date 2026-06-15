// profanity.js — client-side mirror of the server profanity filter
// (server/routes/player.js). Used for instant feedback on the character
// creation screen and to filter chat sends (chat is local-only with no server
// route, so the client is the sole enforcer there). The server independently
// re-checks display names, so keep this list in sync with the server's.

const CLIENT_PROFANITY = [
  'fuck', 'fack', 'fuk', 'fuc', 'phuck',
  'shit', 'shyt', 'bitch', 'biatch', 'cunt',
  'asshole', 'ass', 'dick', 'pussy', 'cock', 'twat',
  'nigger', 'nigga', 'faggot', 'faggit', 'whore', 'slut', 'bastard',
];

const CLIENT_LEET = {
  '@': 'a', '4': 'a', '3': 'e', '0': 'o', '1': 'i', '!': 'i', '$': 's', '5': 's',
};

function normaliseForProfanity(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4301!$5]/g, (ch) => CLIENT_LEET[ch] || ch)
    .replace(/[^a-z]/g, '');
}

function containsProfanity(text) {
  const normalised = normaliseForProfanity(text);
  return CLIENT_PROFANITY.some((word) => normalised.includes(word));
}
