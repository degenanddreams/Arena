// DevMode.js — local-only test mode (roadmap §35, Prompt A).
//
// Trigger: open the game with ?dev=maxstats on localhost / 127.0.0.1, e.g.
//   http://localhost:3000?dev=maxstats
//
// When active it asks the server to max the REST player's combat stats to level
// 99, restore HP, and equip the highest available tier of every gear slot, so
// the rest of the polish pass can be tested quickly (e.g. kill the boss fast).
// Double-gated: this client check requires localhost AND the server endpoint
// refuses when NODE_ENV=production.

const DevMode = {
  isActive() {
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    const localhost = host === 'localhost' || host === '127.0.0.1';
    return params.get('dev') === 'maxstats' && localhost;
  },

  // Applies max stats to `wallet` if the mode is active. Resolves to true on
  // success, false otherwise. Never throws — boot continues regardless.
  async applyIfActive(wallet) {
    if (!this.isActive()) return false;
    try {
      const res = await fetch(`/api/player/${wallet}/dev_maxstats`, { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        console.log('[DevMode] max stats applied:', data);
        return true;
      }
      console.warn('[DevMode] dev_maxstats refused:', data && data.reason);
    } catch (err) {
      console.warn('[DevMode] dev_maxstats request failed:', err);
    }
    return false;
  },
};
