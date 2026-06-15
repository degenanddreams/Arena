// FoodSystem.js — eat mechanic and cooldown tracking per CLAUDE.md Section 10.
// Heals +5 HP per Cooked Chicken (item_id 17), hard-capped at 100 (no
// overheal). Eating sets a 1-tick eat cooldown and skips the next attack.
// HP persists to SQLite after every eat (never localStorage).

class FoodSystem {
  constructor(scene) {
    this.scene = scene;
    this.eatCooldownRemaining = 0;   // ms remaining on eat cooldown
    this.attackDelayRemaining = 0;   // ticks to skip on next attack
  }

  canEat() {
    return this.eatCooldownRemaining <= 0;
  }

  async eat() {
    if (!this.canEat()) return { success: false, reason: 'cooldown' };

    const registry = this.scene.registry;
    const inventory = registry.get('inventory') || [];

    // Check inventory has Cooked Chicken (item_id 17)
    const chickenSlot = inventory.find((i) => i.item_id === 17);
    if (!chickenSlot) return { success: false, reason: 'no_food' };

    const player = registry.get('player');

    // Apply heal — capped at 100, no overheal
    const newHp = Math.min(100, player.current_hp + 5);
    const actualHeal = newHp - player.current_hp;

    try {
      // Remove one chicken from inventory (server-side)
      const removeRes = await fetch('/api/inventory/remove_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: TEST_WALLET, item_id: 17, quantity: 1, slot: chickenSlot.slot,
        }),
      });
      const removeData = await removeRes.json();
      if (!removeData.success) throw new Error(removeData.reason || 'remove_failed');

      // Persist HP — must survive a browser refresh
      await fetch(`/api/player/${TEST_WALLET}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_hp: newHp }),
      });
    } catch (err) {
      console.error('Eat failed:', err);
      return { success: false, reason: 'server_error' };
    }

    // Mirror the change locally
    registry.set('inventory', inventory.filter((i) => i.slot !== chickenSlot.slot));
    player.current_hp = newHp;
    registry.set('player', { ...player });

    // Set cooldowns: 1 tick between eats, eating skips the next attack
    this.eatCooldownRemaining = TIMING.EAT_COOLDOWN_MS;
    this.attackDelayRemaining = TIMING.EAT_ATTACK_DELAY_TICKS;

    this.scene.game.events.emit('player-data-updated');
    return { success: true, healAmount: actualHeal, newHp };
  }

  update(delta) {
    this.eatCooldownRemaining = Math.max(0, this.eatCooldownRemaining - delta);
  }

  // Called by combat loop before firing an attack
  consumeAttackDelay() {
    if (this.attackDelayRemaining > 0) {
      this.attackDelayRemaining--;
      return true; // skip this attack
    }
    return false; // proceed with attack
  }
}
