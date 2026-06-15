// multiplayer.js — Socket.io world server (CLAUDE.md Section 32).
// Phase 1: presence + chat. Phase 2: AUTHORITATIVE server-side combat — the
// server runs all attack loops, rolls every hit, owns dummy/boss HP and the
// boss AOE, writes XP/HP/loot to SQLite, and broadcasts results. Clients send
// intentions (start_attack/stop_attack) and only animate what the server reports.

const { maskProfanity } = require('./profanity');
const { calculateAccuracy, calculateMaxHit, computeGearStats, rollAttack } = require('./systems/CombatSystem');
const { levelFromXP, applyTrainingStyle } = require('./systems/XPSystem');

// World/map constants mirror the client WORLD object (GameScene.js Section 13).
const MAP_WIDTH = 40;
const MAP_HEIGHT = 90;
const SPAWN = { x: 20, y: 74 };       // lobby spawn-zone centre tile
const LOBBY_SPAWN_X = SPAWN.x;
const LOBBY_SPAWN_Y = SPAWN.y;
const MAX_MOVE_TILES = 10;            // teleport guard
const ROOM = 'server_1';
const TICK_MS = 2400;
// Wager replay cadence — cosmetic only (the fight is precomputed). Faster than
// the 2400ms combat tick so a result reveal isn't painfully slow: a 45-tick
// fight plays in ~22s, and the 200-tick safety cap is ~100s worst case.
const WAGER_REPLAY_INTERVAL_MS = 500;

// Boss constants (CLAUDE.md Section 8, boss.js)
const BOSS_TILE_X = 20;
const BOSS_TILE_Y = 15;
const BOSS_MAX_HP = 2000;
const BOSS_ID = 'minotaur';
const AOE_RADIUS_TILES = 5;
const AOE_DAMAGE = 10;
const AOE_INTERVAL_MS = 19200;        // 8 ticks
const AOE_WARNING_MS = 4800;          // 2 ticks before fire
const BOSS_RESPAWN_MS = 120000;       // 2 minutes (local)
const LOOT_DAMAGE_THRESHOLD = 25;
const INVENTORY_SLOTS = 20;

// Dummy tiers (same data as client/js/config/dummies.js)
const DUMMIES = [
  { level: 1, multiplier: 1, unlockAt: 0, guaranteedHit: true, hp: 100 },
  { level: 10, multiplier: 5, unlockAt: 10, guaranteedHit: true, hp: 100 },
  { level: 20, multiplier: 10, unlockAt: 20, guaranteedHit: false, hp: 100 },
  { level: 30, multiplier: 15, unlockAt: 30, guaranteedHit: false, hp: 100 },
  { level: 40, multiplier: 20, unlockAt: 40, guaranteedHit: false, hp: 100 },
  { level: 50, multiplier: 25, unlockAt: 50, guaranteedHit: false, hp: 100 },
  { level: 60, multiplier: 30, unlockAt: 60, guaranteedHit: false, hp: 100 },
  { level: 70, multiplier: 35, unlockAt: 70, guaranteedHit: false, hp: 100 },
  { level: 80, multiplier: 40, unlockAt: 80, guaranteedHit: false, hp: 100 },
  { level: 85, multiplier: 45, unlockAt: 85, guaranteedHit: false, hp: 100 },
  { level: 90, multiplier: 50, unlockAt: 90, guaranteedHit: false, hp: 100 },
  { level: 100, multiplier: 55, unlockAt: 90, guaranteedHit: false, hp: 100 },
];

// Boss loot table (same cumulative ranges as routes/combat.js)
const T1_ARMOR_IDS = [1, 2, 3, 4];
const T1_WEAPON_IDS = [9, 10, 11, 12];
const T2_ARMOR_IDS = [5, 6, 7, 8];
const T2_WEAPON_IDS = [13, 14, 15, 16];
function pick(ids) { return ids[Math.floor(Math.random() * ids.length)]; }
function rollLootItemId() {
  const roll = Math.random();
  if (roll < 0.35) return null;
  if (roll < 0.65) return pick(T1_ARMOR_IDS);
  if (roll < 0.80) return pick(T1_WEAPON_IDS);
  if (roll < 0.95) return pick(T2_ARMOR_IDS);
  return pick(T2_WEAPON_IDS);
}

module.exports = function initMultiplayer(io, db) {
  // --- DB prepared statements ---
  const getPlayerRow = db.prepare('SELECT display_name, current_hp, gender FROM players WHERE wallet_address = ?');
  const getPlayerXP = db.prepare('SELECT attack_xp, strength_xp, defense_xp FROM players WHERE wallet_address = ?');
  const getEquipped = db.prepare('SELECT * FROM equipped WHERE player_id = ?');
  const getItem = db.prepare('SELECT * FROM items WHERE id = ?');
  const setXP = db.prepare('UPDATE players SET attack_xp = ?, strength_xp = ?, defense_xp = ? WHERE wallet_address = ?');
  const updateHp = db.prepare('UPDATE players SET current_hp = ? WHERE wallet_address = ?');
  const getInvSlots = db.prepare('SELECT slot FROM inventory WHERE player_id = ?');
  const insertInv = db.prepare('INSERT INTO inventory (player_id, slot, item_id, quantity) VALUES (?, ?, ?, ?)');

  // --- In-memory world state (Section 32.3). Never persisted directly. ---
  const dummies = {};
  DUMMIES.forEach((tier) => {
    for (let j = 0; j < 3; j++) {
      dummies[`dummy_lv${tier.level}_${j}`] = {
        tierId: tier.level,
        currentHp: tier.hp,
        maxHp: tier.hp,
        guaranteedHit: tier.guaranteedHit,
        multiplier: tier.multiplier,
        unlockAt: tier.unlockAt,
        attackers: {},     // wallet → intervalId
        attackerXp: {},    // wallet → accumulated XP for the next kill
        attackerDmg: {},   // wallet → accumulated damage
        attackerStyle: {}, // wallet → training style
      };
    }
  });

  const worldState = {
    [ROOM]: {
      players: {},
      chat: [],
      dummies,
      challenges: {}, // challenge_id → { challengerWallet, accepterWallet, amount, currency, status, fightLog }
      boss: {
        currentHp: BOSS_MAX_HP,
        maxHp: BOSS_MAX_HP,
        state: 'ALIVE',
        aoeTimer: AOE_INTERVAL_MS,
        aoeWarningActive: false,
        respawnTimer: 0,
        respawnDuration: BOSS_RESPAWN_MS,
        damageLog: {},
        attackers: {}, // wallet → intervalId
        attackerStyle: {},
      },
    },
  };

  const walletToSocket = {};   // wallet → socket.id (one socket per wallet)
  const combatIntervals = {};  // wallet → intervalId (one active target per player)
  let nextChallengeId = 1;     // incrementing wager challenge id

  const insertWagerRecord = db.prepare(
    'INSERT INTO wager_challenges (challenger_wallet, accepter_wallet, amount, currency, status) VALUES (?, ?, ?, ?, ?)',
  );

  // Busy = mid-wager (from accept through fight completion). Blocks combat and
  // further wager actions (Section 32.8 / Hard Rule).
  function isPlayerBusy(wallet) {
    const player = worldState[ROOM].players[wallet];
    return !!(player && player.busyUntil && player.busyUntil > Date.now());
  }

  // --- Helpers ---

  // Snapshot a player's combat stats from SQLite (taken once at loop start).
  function getPlayerCombatStats(wallet) {
    const xp = getPlayerXP.get(wallet) || { attack_xp: 0, strength_xp: 0, defense_xp: 0 };
    const equipped = getEquipped.get(wallet);
    const equippedItems = [];
    let weapon = null;
    if (equipped) {
      for (const col of ['helmet_id', 'chestplate_id', 'platelegs_id', 'shield_id', 'weapon_id']) {
        const id = equipped[col];
        if (id) {
          const item = getItem.get(id);
          if (item) {
            equippedItems.push(item);
            if (col === 'weapon_id') weapon = item;
          }
        }
      }
    }
    const gear = computeGearStats(equippedItems);
    return {
      attack_level: levelFromXP(xp.attack_xp),
      strength_level: levelFromXP(xp.strength_xp),
      defense_level: levelFromXP(xp.defense_xp),
      total_accuracy_gear_stat: gear.totalAccuracy,
      total_strength_gear_stat: gear.totalStrength,
      total_defense_gear_stat: gear.totalDefense,
      weapon_str_bonus: weapon ? weapon.strength_stat : 0,
    };
  }

  function firstFreeSlot(wallet) {
    const used = new Set(getInvSlots.all(wallet).map((r) => r.slot));
    for (let s = 0; s < INVENTORY_SLOTS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  function clearCombatForPlayer(wallet) {
    if (combatIntervals[wallet]) {
      clearInterval(combatIntervals[wallet]);
      delete combatIntervals[wallet];
    }
    for (const dummy of Object.values(worldState[ROOM].dummies)) {
      if (wallet in dummy.attackers) {
        delete dummy.attackers[wallet];
        delete dummy.attackerXp[wallet];
        delete dummy.attackerDmg[wallet];
        delete dummy.attackerStyle[wallet];
      }
    }
    const boss = worldState[ROOM].boss;
    if (wallet in boss.attackers) {
      delete boss.attackers[wallet];
      delete boss.attackerStyle[wallet];
    }
  }

  function handleDummyKill(dummy, dummyId) {
    const xpGained = {};
    for (const [wallet, xpAmount] of Object.entries(dummy.attackerXp)) {
      if (xpAmount <= 0) continue;
      const style = dummy.attackerStyle[wallet] || 'strength';
      const split = applyTrainingStyle(xpAmount, style);
      xpGained[wallet] = xpAmount;

      // Persist XP only for wallets that exist in the DB
      const row = getPlayerXP.get(wallet);
      if (!row) continue;
      const oldLevels = {
        attack: levelFromXP(row.attack_xp),
        strength: levelFromXP(row.strength_xp),
        defense: levelFromXP(row.defense_xp),
      };
      const newXp = {
        attack: row.attack_xp + split.attack,
        strength: row.strength_xp + split.strength,
        defense: row.defense_xp + split.defense,
      };
      setXP.run(newXp.attack, newXp.strength, newXp.defense, wallet);

      for (const skill of ['attack', 'strength', 'defense']) {
        const nl = levelFromXP(newXp[skill]);
        if (nl > oldLevels[skill]) {
          const sid = walletToSocket[wallet];
          if (sid) io.to(sid).emit('level_up', { wallet_address: wallet, skill, newLevel: nl });
        }
      }
    }

    io.to(ROOM).emit('dummy_kill', { dummyId, attackerXp: xpGained });

    // Reset the dummy but keep attackers — players keep attacking after reset
    dummy.currentHp = dummy.maxHp;
    dummy.attackerXp = {};
    dummy.attackerDmg = {};
    io.to(ROOM).emit('dummy_reset', { dummyId });
  }

  function handleBossKill() {
    const boss = worldState[ROOM].boss;
    boss.state = 'DEAD';

    // Clear all boss attacker loops
    for (const [wallet, intervalId] of Object.entries(boss.attackers)) {
      clearInterval(intervalId);
      if (combatIntervals[wallet] === intervalId) delete combatIntervals[wallet];
    }
    boss.attackers = {};
    boss.attackerStyle = {};

    // Independent loot roll per qualifying player (damage >= 25)
    const loot = {};
    for (const [wallet, dmg] of Object.entries(boss.damageLog)) {
      if (dmg < LOOT_DAMAGE_THRESHOLD) continue;
      const lootId = rollLootItemId();
      if (!lootId) continue;
      const item = getItem.get(lootId);
      // Only write to DB-backed wallets with inventory space
      if (getPlayerRow.get(wallet)) {
        const free = firstFreeSlot(wallet);
        if (free !== -1) insertInv.run(wallet, free, lootId, 1);
      }
      loot[wallet] = { item_id: lootId, item_name: item ? item.name : null };
    }

    io.to(ROOM).emit('boss_died', { loot });

    boss.respawnTimer = boss.respawnDuration;
    boss.aoeWarningActive = false;
    setTimeout(() => {
      boss.currentHp = boss.maxHp;
      boss.state = 'ALIVE';
      boss.aoeTimer = AOE_INTERVAL_MS;
      boss.aoeWarningActive = false;
      boss.damageLog = {};
      io.to(ROOM).emit('boss_respawned', {});
      console.log('[mp] boss respawned');
    }, BOSS_RESPAWN_MS);
  }

  // --- Wager fight (Section 32.8) — fully simulated server-side, then streamed.
  // No food, no live input: both start at 100 HP, alternate attacks each tick.
  async function runWagerFight(challengeId, walletA, walletB, amount, currency) {
    const statsA = getPlayerCombatStats(walletA);
    const statsB = getPlayerCombatStats(walletB);
    let hpA = 100;
    let hpB = 100;

    // Keep both players busy for the whole replay (Hard Rule: busy through
    // completion). Far-future timestamp; cleared at the end.
    for (const w of [walletA, walletB]) {
      const p = worldState[ROOM].players[w];
      if (p) p.busyUntil = Number.MAX_SAFE_INTEGER;
    }

    // Compute the ENTIRE fight synchronously first.
    const fightLog = [];
    let tick = 0;
    const MAX_TICKS = 200; // safety cap
    while (hpA > 0 && hpB > 0 && tick < MAX_TICKS) {
      const atkEven = tick % 2 === 0;
      const attackerStats = atkEven ? statsA : statsB;
      const defenderStats = atkEven ? statsB : statsA;
      const attackerWallet = atkEven ? walletA : walletB;

      const accuracy = calculateAccuracy(
        { attack_level: attackerStats.attack_level, total_accuracy_gear_stat: attackerStats.total_accuracy_gear_stat },
        { defense_level: defenderStats.defense_level, total_defense_gear_stat: defenderStats.total_defense_gear_stat },
      );
      const maxHit = calculateMaxHit({
        strength_level: attackerStats.strength_level,
        total_strength_gear_stat: attackerStats.total_strength_gear_stat,
      }) + (attackerStats.weapon_str_bonus || 0);

      const result = rollAttack(accuracy, maxHit, false);
      if (atkEven) hpB = Math.max(0, hpB - result.damage);
      else hpA = Math.max(0, hpA - result.damage);

      fightLog.push({
        tick,
        attackerId: attackerWallet,
        damage: result.damage,
        defenderHp: atkEven ? hpB : hpA,
      });
      tick++;
    }

    const winner = hpA > 0 ? walletA : walletB;
    const loser = winner === walletA ? walletB : walletA;

    const challengerSocketId = walletToSocket[walletA];
    const accepterSocketId = walletToSocket[walletB];

    // Stream the precomputed log tick by tick (looks live).
    for (const entry of fightLog) {
      await new Promise((resolve) => setTimeout(resolve, WAGER_REPLAY_INTERVAL_MS));
      if (challengerSocketId) io.to(challengerSocketId).emit('wager_fight_tick', entry);
      if (accepterSocketId) io.to(accepterSocketId).emit('wager_fight_tick', entry);
    }

    // Fight records (result is final — Hard Rule #6)
    if (getPlayerRow.get(winner)) db.prepare('UPDATE players SET wins = wins + 1 WHERE wallet_address = ?').run(winner);
    if (getPlayerRow.get(loser)) db.prepare('UPDATE players SET losses = losses + 1 WHERE wallet_address = ?').run(loser);
    insertWagerRecord.run(walletA, walletB, amount, currency, 'completed');

    // Both reset to full HP, busy cleared (Section 11 / 4.3 settlement)
    for (const w of [walletA, walletB]) {
      const p = worldState[ROOM].players[w];
      if (p) { p.currentHp = 100; p.busyUntil = null; }
      if (getPlayerRow.get(w)) db.prepare('UPDATE players SET current_hp = 100 WHERE wallet_address = ?').run(w);
    }

    const resultPayload = {
      winner_wallet: winner,
      loser_wallet: loser,
      winner_name: (worldState[ROOM].players[winner] || {}).display_name || winner,
      loser_name: (worldState[ROOM].players[loser] || {}).display_name || loser,
      amount,
      currency,
    };
    if (challengerSocketId) io.to(challengerSocketId).emit('wager_fight_result', resultPayload);
    if (accepterSocketId) io.to(accepterSocketId).emit('wager_fight_result', resultPayload);

    delete worldState[ROOM].challenges[challengeId];
    console.log(`[mp] wager ${challengeId}: ${winner} beat ${loser} (${amount} ${currency})`);
  }

  // --- Boss AOE — single server-side interval, always running (Section 32.5) ---
  setInterval(() => {
    const boss = worldState[ROOM].boss;
    if (boss.state !== 'ALIVE') return;

    boss.aoeTimer -= 100;

    if (boss.aoeTimer <= AOE_WARNING_MS && !boss.aoeWarningActive) {
      boss.aoeWarningActive = true;
      io.to(ROOM).emit('boss_aoe_warning', {});
    }

    if (boss.aoeTimer <= 0) {
      boss.aoeWarningActive = false;
      boss.aoeTimer = AOE_INTERVAL_MS;

      const hitWallets = [];
      for (const [wallet, player] of Object.entries(worldState[ROOM].players)) {
        const dist = Math.sqrt((player.x - BOSS_TILE_X) ** 2 + (player.y - BOSS_TILE_Y) ** 2);
        if (dist <= AOE_RADIUS_TILES) {
          hitWallets.push(wallet);
          player.currentHp = Math.max(0, player.currentHp - AOE_DAMAGE);
          if (getPlayerRow.get(wallet)) updateHp.run(player.currentHp, wallet);

          if (player.currentHp <= 0) {
            // Death → respawn at lobby with full HP
            player.currentHp = 100;
            player.x = LOBBY_SPAWN_X;
            player.y = LOBBY_SPAWN_Y;
            if (getPlayerRow.get(wallet)) updateHp.run(100, wallet);
            clearCombatForPlayer(wallet);
            const sid = walletToSocket[wallet];
            if (sid) io.to(sid).emit('player_died', {});
          }
        }
      }

      io.to(ROOM).emit('boss_aoe_fire', { hitWallets });
    }
  }, 100);

  // --- Connection handling ---
  io.on('connection', (socket) => {
    socket.on('join_room', ({ wallet_address, display_name }) => {
      if (!wallet_address) return;
      const room = worldState[ROOM];

      const existing = walletToSocket[wallet_address];
      walletToSocket[wallet_address] = socket.id;
      if (existing && existing !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existing);
        if (oldSocket) oldSocket.disconnect(true);
      }
      socket.data.wallet = wallet_address;

      const dbRow = getPlayerRow.get(wallet_address);
      const player = {
        wallet_address,
        display_name: display_name || (dbRow && dbRow.display_name) || 'Player',
        x: SPAWN.x,
        y: SPAWN.y,
        currentHp: dbRow ? dbRow.current_hp : 100,
        gender: dbRow ? dbRow.gender : 'male',
      };
      room.players[wallet_address] = player;

      socket.join(ROOM);
      socket.emit('room_joined', {
        players: room.players,
        chat: room.chat,
        dummies: room.dummies,
        boss: { currentHp: room.boss.currentHp, maxHp: room.boss.maxHp, state: room.boss.state },
      });
      socket.to(ROOM).emit('player_joined', player);
      console.log(`[mp] ${player.display_name} (${wallet_address}) joined ${ROOM}`);
    });

    socket.on('player_move', ({ x, y }) => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      const player = worldState[ROOM].players[wallet];
      if (!player) return;

      const tx = Math.round(x);
      const ty = Math.round(y);
      const inBounds = Number.isFinite(tx) && Number.isFinite(ty)
        && tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT;
      const reachable = Math.hypot(tx - player.x, ty - player.y) <= MAX_MOVE_TILES;
      if (!inBounds || !reachable) {
        socket.emit('position_corrected', { x: player.x, y: player.y });
        return;
      }

      player.x = tx;
      player.y = ty;
      socket.to(ROOM).emit('player_moved', {
        wallet_address: wallet, x: tx, y: ty, currentHp: player.currentHp,
      });
    });

    // --- Combat: start/stop attack (Section 32.5) ---
    socket.on('start_attack', ({ target_type, target_id, style }) => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      if (isPlayerBusy(wallet)) { socket.emit('error', { error: 'player_busy' }); return; }
      const room = worldState[ROOM];

      // One active target per player — clear any existing loop first
      clearCombatForPlayer(wallet);

      const stats = getPlayerCombatStats(wallet);

      if (target_type === 'dummy') {
        const dummy = room.dummies[target_id];
        if (!dummy) return;

        const playerLevel = Math.max(stats.attack_level, stats.strength_level, stats.defense_level);
        if (playerLevel < dummy.unlockAt) {
          socket.emit('attack_rejected', { reason: 'level_requirement', required: dummy.unlockAt });
          return;
        }

        dummy.attackerStyle[wallet] = style || 'strength';

        const intervalId = setInterval(() => {
          if (!dummy || dummy.currentHp <= 0) {
            clearInterval(intervalId);
            delete combatIntervals[wallet];
            delete dummy.attackers[wallet];
            return;
          }
          const accuracy = calculateAccuracy(
            { attack_level: stats.attack_level, total_accuracy_gear_stat: stats.total_accuracy_gear_stat },
            { defense_level: 0, total_defense_gear_stat: 0 },
          );
          const maxHit = calculateMaxHit({
            strength_level: stats.strength_level,
            total_strength_gear_stat: stats.total_strength_gear_stat,
          }) + (stats.weapon_str_bonus || 0);

          const result = rollAttack(accuracy, maxHit, dummy.guaranteedHit);
          dummy.currentHp = Math.max(0, dummy.currentHp - result.damage);
          dummy.attackerXp[wallet] = (dummy.attackerXp[wallet] || 0) + (result.damage * dummy.multiplier);
          dummy.attackerDmg[wallet] = (dummy.attackerDmg[wallet] || 0) + result.damage;

          if (result.damage > 0) {
            io.to(ROOM).emit('combat_hit', {
              attackerId: wallet, targetType: 'dummy', targetId: target_id,
              damage: result.damage, targetHp: dummy.currentHp,
            });
          } else {
            io.to(ROOM).emit('combat_miss', { attackerId: wallet, targetType: 'dummy', targetId: target_id });
          }

          if (dummy.currentHp <= 0) handleDummyKill(dummy, target_id);
        }, TICK_MS);

        combatIntervals[wallet] = intervalId;
        dummy.attackers[wallet] = intervalId;
        return;
      }

      if (target_type === 'boss') {
        const boss = room.boss;
        if (boss.state !== 'ALIVE') return;
        boss.attackerStyle[wallet] = style || 'strength';

        const intervalId = setInterval(() => {
          if (boss.state !== 'ALIVE' || boss.currentHp <= 0) {
            clearInterval(intervalId);
            delete combatIntervals[wallet];
            delete boss.attackers[wallet];
            return;
          }
          const accuracy = calculateAccuracy(
            { attack_level: stats.attack_level, total_accuracy_gear_stat: stats.total_accuracy_gear_stat },
            { defense_level: 0, total_defense_gear_stat: 0 },
          );
          const maxHit = calculateMaxHit({
            strength_level: stats.strength_level,
            total_strength_gear_stat: stats.total_strength_gear_stat,
          }) + (stats.weapon_str_bonus || 0);

          const result = rollAttack(accuracy, maxHit, false);
          boss.currentHp = Math.max(0, boss.currentHp - result.damage);
          if (result.damage > 0) {
            boss.damageLog[wallet] = (boss.damageLog[wallet] || 0) + result.damage;
            io.to(ROOM).emit('combat_hit', {
              attackerId: wallet, targetType: 'boss', targetId: BOSS_ID,
              damage: result.damage, targetHp: boss.currentHp,
            });
          } else {
            io.to(ROOM).emit('combat_miss', { attackerId: wallet, targetType: 'boss', targetId: BOSS_ID });
          }

          if (boss.currentHp <= 0) handleBossKill();
        }, TICK_MS);

        combatIntervals[wallet] = intervalId;
        boss.attackers[wallet] = intervalId;
      }
    });

    socket.on('stop_attack', () => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      clearCombatForPlayer(wallet);
    });

    socket.on('player_hp_update', ({ currentHp }) => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      const player = worldState[ROOM].players[wallet];
      if (!player) return;
      if (Number.isFinite(currentHp)) {
        player.currentHp = Math.max(0, Math.min(100, currentHp));
      }
    });

    // --- Wager flow (Phase 3, Section 32.8). No real money — message-signing /
    // confirm only. Live challenge state in worldState; DB row on completion. ---

    socket.on('challenge_wager', ({ target_wallet, amount, currency }) => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      if (isPlayerBusy(wallet)) { socket.emit('error', { error: 'player_busy' }); return; }

      const targetSocketId = walletToSocket[target_wallet];
      if (!targetSocketId || !worldState[ROOM].players[target_wallet]) {
        socket.emit('error', { error: 'player_offline' });
        return;
      }
      if (target_wallet === wallet) return; // can't wager yourself
      if (isPlayerBusy(target_wallet)) { socket.emit('error', { error: 'target_busy' }); return; }

      // Currency minimums (locked): USDC $1–$5000 ($1 steps), SOL ≥0.01 (0.01 steps)
      const amt = Number(amount);
      if (!Number.isFinite(amt)) { socket.emit('error', { error: 'invalid_amount' }); return; }
      if (currency === 'USDC' && (amt < 1 || amt > 5000)) { socket.emit('error', { error: 'invalid_amount' }); return; }
      if (currency === 'SOL' && amt < 0.01) { socket.emit('error', { error: 'invalid_amount' }); return; }
      if (currency !== 'USDC' && currency !== 'SOL') { socket.emit('error', { error: 'invalid_amount' }); return; }

      const challengeId = nextChallengeId++;
      const stats = getPlayerCombatStats(wallet);
      worldState[ROOM].challenges[challengeId] = {
        challengerWallet: wallet, accepterWallet: target_wallet, amount: amt, currency, status: 'pending', fightLog: null,
      };

      io.to(targetSocketId).emit('wager_challenge', {
        challenge_id: challengeId,
        from_wallet: wallet,
        from_name: worldState[ROOM].players[wallet].display_name,
        from_levels: { attack: stats.attack_level, strength: stats.strength_level, defense: stats.defense_level },
        amount: amt,
        currency,
      });
    });

    socket.on('accept_wager', ({ challenge_id }) => {
      const wallet = socket.data.wallet;
      const challenge = worldState[ROOM].challenges[challenge_id];
      if (!challenge || challenge.accepterWallet !== wallet || challenge.status !== 'pending') return;
      if (isPlayerBusy(wallet)) { socket.emit('error', { error: 'player_busy' }); return; }

      challenge.status = 'accepted';
      // Both busy now — the challenger has 60s to confirm or cancel.
      const until = Date.now() + 60000;
      if (worldState[ROOM].players[wallet]) worldState[ROOM].players[wallet].busyUntil = until;
      if (worldState[ROOM].players[challenge.challengerWallet]) {
        worldState[ROOM].players[challenge.challengerWallet].busyUntil = until;
      }

      const stats = getPlayerCombatStats(wallet);
      const challengerSocketId = walletToSocket[challenge.challengerWallet];
      if (challengerSocketId) {
        io.to(challengerSocketId).emit('wager_accepted', {
          challenge_id,
          to_wallet: wallet,
          to_name: worldState[ROOM].players[wallet].display_name,
          to_levels: { attack: stats.attack_level, strength: stats.strength_level, defense: stats.defense_level },
        });
      }
    });

    socket.on('decline_wager', ({ challenge_id }) => {
      const wallet = socket.data.wallet;
      const challenge = worldState[ROOM].challenges[challenge_id];
      if (!challenge || challenge.accepterWallet !== wallet || challenge.status !== 'pending') return;

      const challengerSocketId = walletToSocket[challenge.challengerWallet];
      if (challengerSocketId) io.to(challengerSocketId).emit('wager_declined', { challenge_id });
      delete worldState[ROOM].challenges[challenge_id];
    });

    socket.on('confirm_wager', async ({ challenge_id }) => {
      const wallet = socket.data.wallet;
      const challenge = worldState[ROOM].challenges[challenge_id];
      // Fight only starts on confirm — accept alone never starts it (Hard Rule #1)
      if (!challenge || challenge.challengerWallet !== wallet || challenge.status !== 'accepted') return;
      challenge.status = 'confirmed';
      await runWagerFight(challenge_id, challenge.challengerWallet, challenge.accepterWallet, challenge.amount, challenge.currency);
    });

    socket.on('cancel_wager', ({ challenge_id }) => {
      const wallet = socket.data.wallet;
      const challenge = worldState[ROOM].challenges[challenge_id];
      if (!challenge || challenge.challengerWallet !== wallet || challenge.status !== 'accepted') return;

      // V1: no escrow, no penalty — just notify and clear busy flags.
      const accepterSocketId = walletToSocket[challenge.accepterWallet];
      if (accepterSocketId) io.to(accepterSocketId).emit('wager_cancelled', { challenge_id, penalty_paid: false });
      if (worldState[ROOM].players[wallet]) worldState[ROOM].players[wallet].busyUntil = null;
      if (worldState[ROOM].players[challenge.accepterWallet]) {
        worldState[ROOM].players[challenge.accepterWallet].busyUntil = null;
      }
      delete worldState[ROOM].challenges[challenge_id];
    });

    socket.on('send_chat', ({ message }) => {
      const wallet = socket.data.wallet;
      if (!wallet || typeof message !== 'string') return;
      const player = worldState[ROOM].players[wallet];
      if (!player) return;
      const trimmed = message.trim().slice(0, 200);
      if (!trimmed) return;
      const entry = { name: player.display_name, message: maskProfanity(trimmed), timestamp: Date.now() };
      worldState[ROOM].chat.push(entry);
      if (worldState[ROOM].chat.length > 100) worldState[ROOM].chat.shift();
      io.to(ROOM).emit('chat_message', entry);
    });

    socket.on('disconnect', () => {
      const wallet = socket.data.wallet;
      if (!wallet) return;
      if (walletToSocket[wallet] !== socket.id) return; // a newer socket owns it

      clearCombatForPlayer(wallet); // Hard Rule #2: never leave orphaned intervals

      // Tear down any non-running wager challenge involving this player so the
      // counterpart isn't left busy and no challenge object is orphaned. (A
      // confirmed fight already in its streaming loop is left to finish.)
      for (const [cid, ch] of Object.entries(worldState[ROOM].challenges)) {
        if (ch.status === 'confirmed') continue;
        if (ch.challengerWallet !== wallet && ch.accepterWallet !== wallet) continue;
        const other = ch.challengerWallet === wallet ? ch.accepterWallet : ch.challengerWallet;
        const otherSocketId = walletToSocket[other];
        if (worldState[ROOM].players[other]) worldState[ROOM].players[other].busyUntil = null;
        if (otherSocketId) io.to(otherSocketId).emit('wager_cancelled', { challenge_id: Number(cid), penalty_paid: false });
        delete worldState[ROOM].challenges[cid];
      }

      delete walletToSocket[wallet];
      delete worldState[ROOM].players[wallet];
      socket.to(ROOM).emit('player_left', { wallet_address: wallet });
      console.log(`[mp] ${wallet} left ${ROOM}`);
    });
  });

  return { worldState };
};
