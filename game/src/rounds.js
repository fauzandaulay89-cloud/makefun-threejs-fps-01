// rounds.js — Round and match flow, and the economy.
// Pure functions over the match state: buy phase, live round, plant and
// defuse, round settlement, and the first-to-5 match win.
//
// Round flow:
//   buy (12 s) -> live (100 s) -> roundEnd (5 s) -> buy ...
// A round ends on elimination, spike explosion, defuse, or the clock
// running out with no plant (defenders win). First team to 5 rounds
// takes the match.

import { ECONOMY, WEAPONS, ARMOR, FLASHBANG } from './weapons.js';
import { SPAWNS, SITES } from './map.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3.5;
export const DEFUSE_SECONDS = 5;
export const FUSE_SECONDS = 45;
export const ROUND_END_SECONDS = 5;
export const WIN_ROUNDS = 5;

/** Reset every agent to its spawn for a new round, keeping money and kills. */
export function startRound(state) {
  state.round += 1;
  state.phase = 'buy';
  state.phaseT = 0;
  state.roundTime = ROUND_SECONDS;
  state.spike = {
    state: 'carried',
    carrierId: null,
    site: null,
    pos: null,
    plantT: 0,
    fuseT: FUSE_SECONDS,
    defuseT: 0,
    defuserId: null,
  };
  state.flashes = [];
  for (const agent of state.agents) {
    const spawn = SPAWNS[agent.team][agent.spawnIndex];
    agent.pos.x = spawn.x + state.rng.range(-0.4, 0.4);
    agent.pos.z = spawn.z + state.rng.range(-0.4, 0.4);
    agent.pos.y = 0;
    agent.vel.x = 0;
    agent.vel.y = 0;
    agent.vel.z = 0;
    agent.hp = 100;
    agent.armor = agent.boughtArmor ? ARMOR.armor : 0;
    agent.alive = true;
    agent.crouch = false;
    agent.onGround = true;
    agent.bloom = 0;
    agent.recoilKick = 0;
    agent.fireCooldown = 0;
    agent.reloading = false;
    agent.triggerHeld = false;
    agent.flash = 0;
    agent.planting = false;
    agent.defusing = false;
    agent.plantProg = 0;
    agent.defuseProg = 0;
    agent.path = [];
    agent.pathIdx = 0;
    agent.holdPos = null;
    agent.targetId = null;
    agent.reactionT = 0;
    agent.burstLeft = 0;
    agent.heardAt = null;
    agent.lastSeenPos = null;
    agent.flashCount = agent.boughtFlash ? 1 : 0;
    // Face the map: attackers north, defenders south.
    agent.yaw = agent.team === 0 ? 0 : Math.PI;
    agent.pitch = 0;
    // A new round refills every owned weapon's magazine and reserve.
    agent.ammoByWeapon = agent.ammoByWeapon || {};
    for (const id of Object.keys(agent.owned || { pistol: true })) {
      const w = WEAPONS[id];
      if (w) agent.ammoByWeapon[id] = { ammo: w.mag, reserve: w.reserve };
    }
    const cur = WEAPONS[agent.weapon];
    agent.ammo = cur.mag;
    agent.reserve = cur.reserve;
  }
  // The spike starts with the player when they are an attacker, else the
  // first living attacker bot. It rides with its carrier until planted.
  const carrier = state.agents.find((a) => a.team === 0 && a.isPlayer) ||
    state.agents.find((a) => a.team === 0);
  state.spike.carrierId = carrier ? carrier.id : null;
  state.events.push({ tick: state.tick, type: 'roundStart', round: state.round });
}

/** Buy a weapon for an agent. Returns true on a completed purchase. */
export function buyWeapon(state, agent, weaponId) {
  if (state.phase !== 'buy') return false;
  const w = WEAPONS[weaponId];
  if (!w || w.price === 0) return false;
  if (agent.money < w.price) return false;
  if (agent.weapon === weaponId) return false;
  agent.money -= w.price;
  agent.weapon = weaponId;
  agent.ammo = w.mag;
  agent.reserve = w.reserve;
  agent.reloading = false;
  state.sounds.push({ tick: state.tick, type: 'buy', x: agent.pos.x, z: agent.pos.z });
  return true;
}

/** Buy kevlar for an agent. */
export function buyArmor(state, agent) {
  if (state.phase !== 'buy' || agent.money < ARMOR.price) return false;
  if (agent.boughtArmor) return false;
  agent.money -= ARMOR.price;
  agent.boughtArmor = true;
  agent.armor = ARMOR.armor;
  return true;
}

/** Buy a flashbang for an agent. */
export function buyFlash(state, agent) {
  if (state.phase !== 'buy' || agent.money < FLASHBANG.price) return false;
  if (agent.flashCount >= FLASHBANG.maxCarry) return false;
  agent.money -= FLASHBANG.price;
  agent.flashCount += 1;
  agent.boughtFlash = true;
  return true;
}

/** Bots buy for themselves at the start of the buy phase. */
export function botBuy(state, agent) {
  if (!agent.bot) return;
  // Prefer the rifle, fall back to the SMG, keep the pistol when broke.
  if (agent.money >= WEAPONS.rifle.price + 200) buyWeapon(state, agent, 'rifle');
  else if (agent.money >= WEAPONS.smg.price + 200) buyWeapon(state, agent, 'smg');
  if (agent.money >= ARMOR.price + 200) buyArmor(state, agent);
  if (agent.money >= FLASHBANG.price + 200 && state.rng.chance(0.5)) buyFlash(state, agent);
}

/** Settle a finished round: bonuses, score, and the next phase. */
export function settleRound(state, winnerTeam, reason) {
  state.score[winnerTeam] += 1;
  for (const agent of state.agents) {
    const won = agent.team === winnerTeam;
    agent.money = Math.min(
      ECONOMY.maxMoney,
      agent.money + (won ? ECONOMY.winBonus : ECONOMY.lossBonus),
    );
    // A new round means a fresh magazine and no carried armour unless bought.
    agent.boughtArmor = false;
    agent.boughtFlash = false;
  }
  state.roundWinner = winnerTeam;
  state.roundReason = reason;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.events.push({
    tick: state.tick,
    type: 'roundEnd',
    round: state.round,
    winner: winnerTeam,
    reason,
    score: [state.score[0], state.score[1]],
  });
  state.sounds.push({ tick: state.tick, type: winnerTeam === 0 ? 'roundWinAtk' : 'roundWinDef', x: 0, z: 0 });
  if (state.score[winnerTeam] >= WIN_ROUNDS) {
    state.phase = 'matchEnd';
    state.matchWinner = winnerTeam;
    state.events.push({
      tick: state.tick,
      type: 'matchEnd',
      winner: winnerTeam,
      score: [state.score[0], state.score[1]],
    });
  }
}

/** Check every round-end condition. Called once per simulation tick. */
export function checkRoundEnd(state) {
  if (state.phase !== 'live') return;
  const planted = state.spike.state === 'planted';
  // The fuse and the defuse decide first: they end the round even when
  // one team is already wiped out (a planted spike still ticks).
  if (planted && state.spike.fuseT <= 0) {
    settleRound(state, 0, 'detonation');
    return;
  }
  if (state.spike.state === 'defused') {
    settleRound(state, 1, 'defuse');
    return;
  }
  const atkAlive = state.agents.some((a) => a.team === 0 && a.alive);
  const defAlive = state.agents.some((a) => a.team === 1 && a.alive);
  if (!atkAlive && !planted) {
    settleRound(state, 1, 'elimination');
    return;
  }
  if (!atkAlive && planted) {
    // Attackers are gone but the spike ticks on: defenders must defuse
    // or survive the fuse. The round continues.
    return;
  }
  if (!defAlive) {
    settleRound(state, 0, 'elimination');
    return;
  }
  if (state.roundTime <= 0 && !planted) {
    settleRound(state, 1, 'time');
  }
}

/** Is an agent standing in a plant zone with the spike in hand? */
export function canPlant(state, agent) {
  if (state.spike.state !== 'carried' || state.spike.carrierId !== agent.id) return null;
  if (!agent.alive) return null;
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = agent.pos.x - s.cx;
    const dz = agent.pos.z - s.cz;
    if (dx * dx + dz * dz <= s.r * s.r) return key;
  }
  return null;
}

/** Is an agent close enough to the planted spike to defuse it? */
export function canDefuse(state, agent) {
  if (state.spike.state !== 'planted' || !agent.alive) return false;
  if (agent.team !== 1) return false;
  const dx = agent.pos.x - state.spike.pos.x;
  const dz = agent.pos.z - state.spike.pos.z;
  return dx * dx + dz * dz <= 1.6 * 1.6;
}
