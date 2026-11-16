// sim.js — The deterministic match simulation.
// Fixed-step (60 Hz), pure logic: no DOM, no three.js, no Date. Every
// random draw comes from the match RNG, so the same seed replays the same
// match. The browser renders this state; Node runs it headless for the
// dossier (runHeadlessMatch). One step per agent: intent -> movement ->
// weapons -> objective channels -> round checks.
//
// Agent ids: 0-4 attackers (Ember), 5-9 defenders (Vigil). Agent 0 is the
// human player unless the match runs on autopilot (headless).

import { makeRng } from './rng.js';
import { MAP, collideCircle, rayWalls, siteAt, hasLineOfSight } from './map.js';
import { WEAPONS, ECONOMY } from './weapons.js';
import { eyeOf, aimDir, tryFire, startReload } from './combat.js';
import { botIntent, assignRoles } from './bots.js';
import { playerIntent } from './player.js';
import {
  BUY_SECONDS, ROUND_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS, FUSE_SECONDS,
  ROUND_END_SECONDS, WIN_ROUNDS, startRound, settleRound, checkRoundEnd,
  botBuy, buyWeapon, buyArmor, buyFlash, canPlant, canDefuse,
} from './rounds.js';

export const STEP = 1 / 60;

const WALK_SPEED = 4.3;
const CROUCH_SPEED = 2.2;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 8;
const JUMP_SPEED = 5.4;
const GRAVITY = 15;

const ATK_NAMES = ['Ash', 'Cinder', 'Flint', 'Smolder', 'Ember'];
const DEF_NAMES = ['Sentry', 'Haven', 'Bulwark', 'Pike', 'Rook'];

function makeAgent(id, team, spawnIndex, isPlayer) {
  return {
    id,
    team,
    spawnIndex,
    isPlayer,
    bot: !isPlayer,
    name: isPlayer ? 'YOU' : team === 0 ? ATK_NAMES[id] : DEF_NAMES[id - 5],
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: team === 0 ? 0 : Math.PI,
    pitch: 0,
    hp: 100,
    armor: 0,
    alive: true,
    crouch: false,
    onGround: true,
    weapon: 'pistol',
    owned: { pistol: true },
    ammoByWeapon: { pistol: { ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    ammo: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    money: ECONOMY.startMoney,
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    boughtArmor: false,
    boughtFlash: false,
    flashCount: 0,
    bloom: 0,
    recoilKick: 0,
    fireCooldown: 0,
    reloading: false,
    reloadT: 0,
    triggerHeld: false,
    flash: 0,
    planting: false,
    defusing: false,
    plantProg: 0,
    defuseProg: 0,
    path: [],
    pathIdx: 0,
    targetWp: null,
    holdPos: null,
    holdYaw: 0,
    role: null,
    targetId: null,
    reactionT: 0,
    burstLeft: 0,
    burstPause: 0,
    heardAt: null,
    lastSeenPos: null,
    lastAttackerId: null,
    lastDamageTick: -999,
    stepT: 0,
    scanT: 0,
  };
}

/** Create a fresh match. autopilot: true drives the player slot with a bot. */
export function createMatch(seed, opts = {}) {
  const autopilot = !!opts.autopilot;
  const state = {
    seed,
    rng: makeRng(seed),
    tick: 0,
    time: 0,
    phase: 'buy',
    phaseT: 0,
    round: 0,
    score: [0, 0],
    roundTime: ROUND_SECONDS,
    roundWinner: null,
    roundReason: null,
    matchWinner: null,
    spike: {
      state: 'carried',
      carrierId: null,
      site: null,
      pos: null,
      plantT: 0,
      fuseT: FUSE_SECONDS,
      defuseT: 0,
      defuserId: null,
    },
    flashes: [],
    tracers: [],
    events: [],
    sounds: [],
    stats: { shots: 0, hits: 0, plants: 0, defuses: 0, flashes: 0 },
    agents: [],
  };
  for (let i = 0; i < 10; i++) {
    state.agents.push(makeAgent(i, i < 5 ? 0 : 1, i % 5, i === 0 && !autopilot));
  }
  beginRound(state);
  return state;
}

/** Start a round: reset positions, assign roles, let bots buy. */
export function beginRound(state) {
  startRound(state);
  assignRoles(state);
  for (const agent of state.agents) {
    if (agent.bot) botBuy(state, agent);
  }
}

/** Move a value toward a target by at most maxDelta. */
function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(target, cur + maxDelta);
  if (cur > target) return Math.max(target, cur - maxDelta);
  return cur;
}

/** Acceleration-based movement with collision and gravity. */
function integrateMovement(state, agent, intent, dt) {
  const speed = (intent.crouch ? CROUCH_SPEED : WALK_SPEED) * (intent.speed || 1);
  let wx = intent.mx;
  let wz = intent.mz;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  const tx = wx * speed;
  const tz = wz * speed;
  const accel = agent.onGround ? GROUND_ACCEL : AIR_ACCEL;
  agent.vel.x = approach(agent.vel.x, tx, accel * dt);
  agent.vel.z = approach(agent.vel.z, tz, accel * dt);
  if (intent.jump && agent.onGround) {
    agent.vel.y = JUMP_SPEED;
    agent.onGround = false;
  }
  agent.vel.y -= GRAVITY * dt;
  agent.pos.x += agent.vel.x * dt;
  agent.pos.z += agent.vel.z * dt;
  agent.pos.y += agent.vel.y * dt;
  if (agent.pos.y <= 0) {
    agent.pos.y = 0;
    agent.vel.y = 0;
    agent.onGround = true;
  }
  collideCircle(agent.pos, MAP.agentRadius);
  agent.crouch = intent.crouch;
}

/** Switch to an owned weapon, keeping per-weapon ammo. */
function switchWeapon(state, agent, weaponId) {
  if (!agent.owned[weaponId] || agent.weapon === weaponId) return;
  agent.ammoByWeapon[agent.weapon] = { ammo: agent.ammo, reserve: agent.reserve };
  agent.weapon = weaponId;
  const entry = agent.ammoByWeapon[weaponId] || {
    ammo: WEAPONS[weaponId].mag,
    reserve: WEAPONS[weaponId].reserve,
  };
  agent.ammo = entry.ammo;
  agent.reserve = entry.reserve;
  agent.reloading = false;
  agent.fireCooldown = 0.15;
}

/** Throw a flashbang: it detonates 0.6 s later, 12 m ahead (or at a wall). */
function throwFlash(state, agent) {
  if (agent.flashCount <= 0 || agent.reloading) return;
  agent.flashCount -= 1;
  const eye = eyeOf(agent);
  const dir = aimDir(agent.yaw, agent.pitch);
  const wallT = rayWalls(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 12);
  const dist = Math.min(12, wallT === Infinity ? 12 : Math.max(1, wallT - 0.5));
  state.flashes.push({
    x: eye.x + dir.x * dist,
    y: Math.max(0.4, eye.y + dir.y * dist),
    z: eye.z + dir.z * dist,
    detonateTick: state.tick + 36,
  });
  state.sounds.push({ tick: state.tick, type: 'flashThrow', x: agent.pos.x, z: agent.pos.z });
  state.stats.flashes += 1;
}

/** Resolve a flashbang detonation: blind everyone looking at it. */
function detonateFlash(state, flash) {
  state.sounds.push({ tick: state.tick, type: 'flashPop', x: flash.x, z: flash.z });
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    const dx = flash.x - agent.pos.x;
    const dz = flash.z - agent.pos.z;
    const dy = flash.y - (agent.pos.y + 1.5);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 26) continue;
    const eye = eyeOf(agent);
    if (!hasLineOfSight(eye.x, eye.y, eye.z, flash.x, flash.y, flash.z)) continue;
    // Facing the flash matters: looking away barely blinds.
    const fwd = aimDir(agent.yaw, agent.pitch);
    const dot = (fwd.x * dx + fwd.y * dy + fwd.z * dz) / Math.max(0.001, dist);
    const factor = dot > 0.2 ? 1 : dot < -0.5 ? 0.15 : 0.5;
    const blind = Math.max(0.25, 2.6 * (1 - dist / 26) * factor);
    agent.flash = Math.max(agent.flash, blind);
    if (agent.isPlayer) {
      state.events.push({ tick: state.tick, type: 'flashed', amount: blind });
    }
  }
}

/** One fixed step of the match. input is the human input snapshot. */
export function step(state, input, dt) {
  state.tick += 1;
  state.time += dt;

  // --- Phase clocks ----------------------------------------------------
  if (state.phase === 'buy') {
    state.phaseT += dt;
    if (state.phaseT >= BUY_SECONDS) {
      state.phase = 'live';
      state.phaseT = 0;
      state.events.push({ tick: state.tick, type: 'roundLive', round: state.round });
    }
  } else if (state.phase === 'live') {
    state.phaseT += dt;
    if (state.spike.state === 'planted') {
      state.spike.fuseT -= dt;
    } else {
      state.roundTime -= dt;
    }
  } else if (state.phase === 'roundEnd') {
    state.phaseT += dt;
    if (state.phaseT >= ROUND_END_SECONDS) beginRound(state);
  }

  // --- Flashbang detonations -------------------------------------------
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    if (state.tick >= state.flashes[i].detonateTick) {
      detonateFlash(state, state.flashes[i]);
      state.flashes.splice(i, 1);
    }
  }

  // --- Agents ------------------------------------------------------------
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    if (agent.flash > 0) agent.flash = Math.max(0, agent.flash - dt);
    agent.recoilKick = Math.max(0, agent.recoilKick - dt * 0.35);

    const intent = agent.isPlayer
      ? playerIntent(input, agent, dt)
      : botIntent(state, agent, dt);
    agent.yaw = intent.yaw;
    agent.pitch = intent.pitch;

    if (state.phase === 'live' || state.phase === 'buy') {
      integrateMovement(state, agent, intent, dt);
    }

    // Footsteps: a soft sound every stride while moving on the ground.
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    if (agent.onGround && speed > 2 && state.phase === 'live') {
      agent.stepT -= dt * speed;
      if (agent.stepT <= 0) {
        agent.stepT = 2.2;
        state.sounds.push({ tick: state.tick, type: 'step', x: agent.pos.x, z: agent.pos.z });
      }
    }

    if (state.phase !== 'live') continue;

    // Weapons.
    if (intent.switchTo) switchWeapon(state, agent, intent.switchTo);
    if (intent.reload) startReload(state, agent);
    const shot = tryFire(state, agent, intent.fire, dt);
    if (shot && shot.hit) state.stats.hits += 1;
    if (shot && !shot.dry) state.stats.shots += 1;
    if (intent.flash) throwFlash(state, agent);

    // Plant channel (attacker carrying the spike, standing in a site).
    const site = canPlant(state, agent);
    if (site && intent.plant) {
      agent.plantProg += dt;
      agent.planting = true;
      if (agent.plantProg >= PLANT_SECONDS) {
        state.spike.state = 'planted';
        state.spike.site = site;
        state.spike.pos = { x: agent.pos.x, z: agent.pos.z };
        state.spike.carrierId = null;
        state.spike.fuseT = FUSE_SECONDS;
        agent.money = Math.min(16000, agent.money + 300);
        agent.planting = false;
        agent.plantProg = 0;
        state.stats.plants += 1;
        state.events.push({ tick: state.tick, type: 'planted', site, byId: agent.id });
        state.sounds.push({ tick: state.tick, type: 'planted', x: agent.pos.x, z: agent.pos.z });
      }
    } else {
      agent.planting = false;
      agent.plantProg = Math.max(0, agent.plantProg - dt * 2);
    }

    // Defuse channel (defender beside the planted spike).
    if (canDefuse(state, agent) && intent.defuse) {
      agent.defuseProg += dt;
      agent.defusing = true;
      state.spike.defuserId = agent.id;
      if (agent.defuseProg >= DEFUSE_SECONDS) {
        state.spike.state = 'defused';
        state.stats.defuses += 1;
        state.events.push({ tick: state.tick, type: 'defused', byId: agent.id });
        state.sounds.push({ tick: state.tick, type: 'defused', x: agent.pos.x, z: agent.pos.z });
      }
    } else {
      agent.defusing = false;
      agent.defuseProg = Math.max(0, agent.defuseProg - dt * 2);
      if (state.spike.defuserId === agent.id) state.spike.defuserId = null;
    }
  }

  // --- Dropped spike pickup ----------------------------------------------
  if (state.spike.state === 'dropped') {
    for (const agent of state.agents) {
      if (!agent.alive || agent.team !== 0) continue;
      const dx = agent.pos.x - state.spike.pos.x;
      const dz = agent.pos.z - state.spike.pos.z;
      if (dx * dx + dz * dz < 1.1 * 1.1) {
        state.spike.state = 'carried';
        state.spike.carrierId = agent.id;
        state.spike.pos = null;
        state.events.push({ tick: state.tick, type: 'spikePickup', byId: agent.id });
        break;
      }
    }
  }

  checkRoundEnd(state);

  // Keep the queues bounded: the browser drains them every frame.
  if (state.events.length > 90) state.events.splice(0, state.events.length - 90);
  if (state.sounds.length > 64) state.sounds.splice(0, state.sounds.length - 64);
}

/** Buy helpers exposed to the browser HUD (buy menu clicks). */
export function buyFor(state, agent, kind, id) {
  if (kind === 'weapon') return buyWeapon(state, agent, id);
  if (kind === 'armor') return buyArmor(state, agent);
  if (kind === 'flash') return buyFlash(state, agent);
  return false;
}

// ------------------------------------------------------------ headless run

/** FNV-1a hash of a string, for the determinism check. */
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Run a whole match headless with all-bot players (the human slot is also
 * a bot) and return a deterministic summary. Two runs with the same seed
 * must return byte-identical JSON.
 */
export function runHeadlessMatch(seed) {
  const state = createMatch(seed, { autopilot: true });
  const idleInput = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    jumpQueued: false,
    reloadQueued: false,
    flashQueued: false,
    switchTo: null,
  };
  const maxTicks = 60 * 60 * 15; // 15 minutes of match, hard cap
  while (state.phase !== 'matchEnd' && state.tick < maxTicks) {
    step(state, idleInput, STEP);
  }
  const agents = state.agents.map((a) => ({
    id: a.id,
    team: a.team,
    x: Math.round(a.pos.x * 1000) / 1000,
    z: Math.round(a.pos.z * 1000) / 1000,
    hp: Math.round(a.hp * 100) / 100,
    money: a.money,
    kills: a.kills,
    deaths: a.deaths,
    shotsFired: a.shotsFired,
    shotsHit: a.shotsHit,
  }));
  const summary = {
    seed,
    ticks: state.tick,
    rounds: state.round,
    score: state.score,
    winner: state.matchWinner,
    stats: state.stats,
    agents,
  };
  summary.hash = fnv1a(JSON.stringify(summary));
  return summary;
}
