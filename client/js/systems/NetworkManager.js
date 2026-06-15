// NetworkManager.js — owns the Socket.io connection and all client emit/on
// logic (CLAUDE.md Section 32, Phase 1). A singleton `network` is created on
// load. Degrades gracefully to single-player if Socket.io isn't available.
//
// Identity: the multiplayer wallet defaults to test_wallet_001 but can be
// overridden per browser via ?wallet=... (and ?name=...) so two windows can be
// tested as distinct wallets while honouring Hard Rule #8 (one socket/wallet).

class NetworkManager {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.wallet = params.get('wallet') || 'test_wallet_001';
    this.nameOverride = params.get('name') || null;
    this.callbacks = {};
    this.socket = (typeof io !== 'undefined') ? io() : null;
  }

  connect(displayName) {
    if (!this.socket) return;
    this.socket.emit('join_room', {
      wallet_address: this.wallet,
      display_name: this.nameOverride || displayName,
    });
  }

  // Emit helpers
  sendMove(x, y) {
    if (this.socket) this.socket.emit('player_move', { x, y });
  }

  sendChat(message) {
    if (this.socket) this.socket.emit('send_chat', { message });
  }

  // Combat intentions (Phase 2 — server runs the loop and decides outcomes)
  startAttack(targetType, targetId, style) {
    if (this.socket) this.socket.emit('start_attack', { target_type: targetType, target_id: targetId, style });
  }

  stopAttack() {
    if (this.socket) this.socket.emit('stop_attack', {});
  }

  sendHpUpdate(currentHp) {
    if (this.socket) this.socket.emit('player_hp_update', { currentHp });
  }

  // Wager flow (Phase 3)
  sendChallenge(targetWallet, amount, currency) {
    if (this.socket) this.socket.emit('challenge_wager', { target_wallet: targetWallet, amount, currency });
  }

  acceptWager(challengeId) {
    if (this.socket) this.socket.emit('accept_wager', { challenge_id: challengeId });
  }

  declineWager(challengeId) {
    if (this.socket) this.socket.emit('decline_wager', { challenge_id: challengeId });
  }

  confirmWager(challengeId) {
    if (this.socket) this.socket.emit('confirm_wager', { challenge_id: challengeId });
  }

  cancelWager(challengeId) {
    if (this.socket) this.socket.emit('cancel_wager', { challenge_id: challengeId });
  }

  // Event registration
  on(event, callback) {
    if (this.socket) this.socket.on(event, callback);
  }

  // Remove all listeners for an event (used to avoid duplicate handlers if the
  // GameScene is re-created — the socket is a long-lived global).
  off(event) {
    if (this.socket) this.socket.off(event);
  }
}

// Singleton
const network = new NetworkManager();
