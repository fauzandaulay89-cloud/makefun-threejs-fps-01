// Rounds: the match state machine. A match is first to 5 round wins (at
// most 9 rounds). Each round opens with a 12 s buy phase, then 100 s live.
// Attackers (the player's team) win by eliminating the defenders, or by
// planting the spike and letting its 35 s fuse run out; defenders win by
// eliminating the attackers, running the clock out unplanted, or defusing.
// Money is earned per round and per kill and spent in the buy menu: more
// than one weapon, armour and a flashbang. All of it is plain data and
// timers; the scene and the HUD only render what this module decides.
import { MAP } from './map.js';
import { WEAPONS, FLASH_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

export const BUY_ITEMS = [
  { id: 'smg', kind: 'weapon', name: WEAPONS.smg.name, price: WEAPONS.smg.price, key: '2' },
  { id: 'rifle', kind: 'weapon', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, key: '3' },
  { id: 'marksman', kind: 'weapon', name: WEAPONS.marksman.name, price: WEAPONS.marksman.price, key: '4' },
  { id: 'flash', kind: 'flash', name: 'Flashbang', price: FLASH_PRICE, key: '5' },
  { id: 'armor', kind: 'armor', name: 'Kevlar vest (50)', price: ARMOR_PRICE, key: '6' },
];

export function createRounds({ player, bots, audio, events }) {
  const state = {
    phase: 'buy',
    round: 1,
    score: { atk: 0, def: 0 },
    timeLeft: BUY_TIME,
    money: 800,
    kills: 0,
    deaths: 0,
    spike: {
      planted: false,
      site: null,
      x: 0,
      z: 0,
      fuseLeft: 0,
      carrier: null,
      // The site this bot is carrying toward (its hold spot decides it).
      siteFor(bot) {
        if (!bot) return null;
        const key = bot.holdSpot === 'bSite' || bot.holdSpot === 'bHold' ? 'B' : 'A';
        const site = MAP.sites[key];
        return { ...site, key };
      },
    },
    roundEndReason: '',
    matchWinner: null,
    plantProgress: 0,
    defuseProgress: 0,
    lastShot: null,
    time: 0,
  };

  function living(team) {
    if (team === 'atk') {
      return bots.living('atk').length + (player.alive ? 1 : 0);
    }
    return bots.living('def').length;
  }

  function pickCarrier() {
    const alive = bots.living('atk');
    if (alive.length === 0) {
      state.spike.carrier = null;
      return;
    }
    // Prefer a bot already heading for a site; otherwise any living attacker.
    state.spike.carrier = alive[0];
  }

  function startRound() {
    state.phase = 'buy';
    state.timeLeft = BUY_TIME;
    state.spike.planted = false;
    state.spike.site = null;
    state.spike.fuseLeft = 0;
    state.spike.carrier = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    pickCarrier();
    bots.resetRound(state.round);
    events.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundEndReason = reason;
    state.score[winner] += 1;
    const playerWon = winner === 'atk';
    state.money += playerWon ? WIN_REWARD : LOSS_REWARD;
    state.timeLeft = 4.5;
    audio.horn(playerWon);
    events.onRoundEnd(winner, reason, { ...state.score });
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.score.atk > state.score.def ? 'atk' : 'def';
    }
  }

  function nextRound() {
    if (state.matchWinner) {
      state.phase = 'matchEnd';
      events.onMatchEnd(state.matchWinner, { ...state.score });
      return;
    }
    state.round += 1;
    startRound();
  }

  function plantSpike(actor, siteKey) {
    const site = MAP.sites[siteKey];
    state.spike.planted = true;
    state.spike.site = siteKey;
    state.spike.x = site.x;
    state.spike.z = site.z;
    state.spike.fuseLeft = MAP.fuseTime;
    state.spike.carrier = null;
    if (actor.isPlayer) state.money += PLANT_REWARD;
    audio.plantBeep();
    events.onPlant(siteKey, actor.isPlayer);
  }

  function defuseSpike(actor) {
    state.spike.planted = false;
    state.spike.site = null;
    endRound('def', actor.isPlayer ? 'Spike defused by you' : `Spike defused by ${actor.name}`);
  }

  function onKill(victim, attacker) {
    if (attacker && attacker.isPlayer) {
      state.money += KILL_REWARD;
      state.kills += 1;
    }
    if (victim.isPlayer) state.deaths += 1;
    // The carrier's death passes the spike to another living attacker.
    if (state.spike.carrier === victim) pickCarrier();
    events.onKill(victim, attacker);
  }

  function buy(itemId) {
    if (state.phase !== 'buy') return { ok: false, why: 'Buy phase is over' };
    const item = BUY_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, why: 'Unknown item' };
    if (state.money < item.price) return { ok: false, why: 'Not enough money' };
    if (item.kind === 'weapon') {
      if (player.loadout.has(item.id)) return { ok: false, why: 'Already owned' };
      player.loadout.buy(item.id);
      player.loadout.switchTo(item.id);
    } else if (item.kind === 'flash') {
      if (player.loadout.grenades >= 1) return { ok: false, why: 'Already carrying one' };
      player.loadout.grenades = 1;
    } else if (item.kind === 'armor') {
      if (player.armor >= 50) return { ok: false, why: 'Armour already full' };
      player.armor = 50;
      player.loadout.armor = 50;
    }
    state.money -= item.price;
    audio.buy();
    events.onBuy(item);
    return { ok: true };
  }

  function step(dt) {
    state.time += dt;
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.phase = 'live';
        state.timeLeft = ROUND_TIME;
        events.onLive();
      }
      return;
    }
    if (state.phase === 'live') {
      state.timeLeft -= dt;
      if (state.spike.planted) {
        state.spike.fuseLeft -= dt;
        if (Math.floor(state.spike.fuseLeft) !== Math.floor(state.spike.fuseLeft + dt)) {
          audio.spikeBeep();
        }
        if (state.spike.fuseLeft <= 0) {
          endRound('atk', 'Spike detonated');
          return;
        }
      }
      if (living('def') === 0) {
        endRound('atk', 'Enemy team eliminated');
        return;
      }
      if (living('atk') === 0) {
        endRound('def', 'Your team was eliminated');
        return;
      }
      if (state.timeLeft <= 0) {
        endRound('def', state.spike.planted ? 'Time expired' : 'Time expired — spike never planted');
        return;
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) nextRound();
    }
  }

  return {
    state,
    startRound,
    endRound,
    plantSpike,
    defuseSpike,
    onKill,
    buy,
    step,
    living,
  };
}
