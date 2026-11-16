// combat.js — Hitscan shooting: spread, recoil, ray vs walls and bodies,
// damage with headshots and armour. Pure math, no rendering, no DOM.
//
// A shot is a ray from the shooter's eye. The ray first meets the nearest
// wall (rayWalls) or the nearest agent capsule (body segment + head sphere);
// the nearer one wins. Spread is a cone around the aim direction sampled
// with the match RNG, so the same seed replays the same shots.

import { MAP, rayWalls } from './map.js';
import { WEAPONS, applyArmor } from './weapons.js';

const EYE = MAP.eyeHeight;
const CROUCH_EYE = MAP.crouchEye;

/** Eye position of an agent (crouch lowers it). */
export function eyeOf(agent) {
  return {
    x: agent.pos.x,
    y: agent.pos.y + (agent.crouch ? CROUCH_EYE : EYE),
    z: agent.pos.z,
  };
}

/** Aim direction from yaw/pitch (yaw 0 faces -z, i.e. north). */
export function aimDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

/** Current spread cone (radians) for an agent holding a weapon. */
export function currentSpread(agent, weapon) {
  const speed = Math.hypot(agent.vel.x, agent.vel.z);
  let spread = weapon.spreadBase + agent.bloom;
  if (speed > 0.5) spread += weapon.spreadMove * Math.min(1, speed / 4.2);
  if (!agent.onGround) spread += weapon.spreadAir;
  if (agent.crouch) spread *= 0.8;
  return spread;
}

/**
 * Ray vs an agent capsule: body is the segment y+0.25..y+1.45 (radius 0.38),
 * head is a sphere at y+1.62 (radius 0.24). Returns {t, part} or null.
 * The segment test is a ray-vs-cylinder approximation: sample the closest
 * approach of the ray to the body axis, then check the radius.
 */
export function rayAgent(ox, oy, oz, dx, dy, dz, target, maxT) {
  // Head sphere first (small, highest value).
  const hx = target.pos.x;
  const hy = target.pos.y + 1.62;
  const hz = target.pos.z;
  const hr = 0.24;
  const ocx = ox - hx;
  const ocy = oy - hy;
  const ocz = oz - hz;
  const b = ocx * dx + ocy * dy + ocz * dz;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - hr * hr;
  const disc = b * b - c;
  if (disc > 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0.01 && t < maxT) return { t, part: 'head' };
  }
  // Body: closest approach of the ray to the vertical axis segment.
  // Project onto the XZ plane: the ray passes within radius of the axis,
  // and the height at that point must be inside the body span.
  const rx = target.pos.x - ox;
  const rz = target.pos.z - oz;
  const denom = dx * dx + dz * dz;
  if (denom < 1e-9) return null;
  let t = (rx * dx + rz * dz) / denom;
  if (t < 0.01 || t > maxT) return null;
  const px = ox + dx * t;
  const pz = oz + dz * t;
  const ddx = px - target.pos.x;
  const ddz = pz - target.pos.z;
  if (ddx * ddx + ddz * ddz > 0.38 * 0.38) return null;
  const py = oy + dy * t;
  if (py < target.pos.y + 0.2 || py > target.pos.y + 1.5) return null;
  return { t, part: 'body' };
}

/**
 * Fire one hitscan shot. Returns a result object describing the shot for
 * the event log, tracer rendering and sound:
 * { hit, victimId, part, damage, end: {x,y,z} (ray end / impact point),
 *   blocked: bool }
 * Applies damage and kill bookkeeping on the state.
 */
export function fireShot(state, shooter) {
  const weapon = WEAPONS[shooter.weapon];
  const eye = eyeOf(shooter);
  const base = aimDir(shooter.yaw, shooter.pitch);
  const spread = currentSpread(shooter, weapon);
  // Sample a direction inside the spread cone with the match RNG.
  const r = spread * Math.sqrt(state.rng.next());
  const a = state.rng.next() * Math.PI * 2;
  // Orthonormal basis around the aim direction.
  let ux = -base.z;
  let uy = 0;
  let uz = base.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = base.y * uz - base.z * uy;
  const vy = base.z * ux - base.x * uz;
  const vz = base.x * uy - base.y * ux;
  const dx = base.x + (ux * Math.cos(a) + vx * Math.sin(a)) * r;
  const dy = base.y + (uy * Math.cos(a) + vy * Math.sin(a)) * r;
  const dz = base.z + (uz * Math.cos(a) + vz * Math.sin(a)) * r;
  const dl = Math.hypot(dx, dy, dz);
  const ndx = dx / dl;
  const ndy = dy / dl;
  const ndz = dz / dl;

  const maxT = weapon.range;
  const wallT = rayWalls(eye.x, eye.y, eye.z, ndx, ndy, ndz, maxT);
  let bestT = wallT;
  let victim = null;
  let part = null;
  for (const other of state.agents) {
    if (!other.alive || other.id === shooter.id) continue;
    const hit = rayAgent(eye.x, eye.y, eye.z, ndx, ndy, ndz, other, maxT);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      victim = other;
      part = hit.part;
    }
  }

  const end = {
    x: eye.x + ndx * (bestT === Infinity ? maxT : bestT),
    y: eye.y + ndy * (bestT === Infinity ? maxT : bestT),
    z: eye.z + ndz * (bestT === Infinity ? maxT : bestT),
  };
  const result = {
    hit: victim !== null,
    victimId: victim ? victim.id : null,
    part,
    damage: 0,
    end,
    blocked: victim === null && wallT !== Infinity,
    wallT,
  };
  // Queue a tracer for the renderer (bounded; the sim never reads it).
  if (state.tracers && state.tracers.length < 48) {
    state.tracers.push({
      from: { x: eye.x, y: eye.y, z: eye.z },
      to: end,
      color: weapon.tracer,
      shooterId: shooter.id,
      blocked: result.blocked,
    });
  }
  if (!victim) return result;

  let damage = weapon.damage;
  if (part === 'head') damage *= weapon.headMult;
  // Distance falloff: full damage to 15 m, then down to 60% at max range.
  const falloff = Math.max(0.6, 1 - (0.4 * Math.max(0, bestT - 15)) / Math.max(1, weapon.range - 15));
  damage *= falloff;
  const after = applyArmor(damage, victim.armor);
  damage = after.damage;
  victim.armor = after.armor;
  victim.hp -= damage;
  result.damage = damage;
  shooter.shotsHit = (shooter.shotsHit || 0) + 1;
  victim.lastAttackerId = shooter.id;
  victim.lastDamageTick = state.tick;
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    shooter.kills += 1;
    shooter.money = Math.min(16000, shooter.money + 300);
    state.events.push({
      tick: state.tick,
      type: 'kill',
      killerId: shooter.id,
      victimId: victim.id,
      headshot: part === 'head',
      weapon: shooter.weapon,
    });
    // The spike drops to the nearest living attacker when its carrier dies.
    if (state.spike.carrierId === victim.id) dropSpike(state, victim);
    // Round-end is checked by the simulation step after each tick.
  }
  state.events.push({
    tick: state.tick,
    type: 'hit',
    shooterId: shooter.id,
    victimId: victim.id,
    damage,
    headshot: part === 'head',
  });
  return result;
}

/** The spike carrier died: the spike waits for a living attacker to pick up. */
export function dropSpike(state, dead) {
  state.spike.state = 'dropped';
  state.spike.carrierId = null;
  state.spike.pos = { x: dead.pos.x, z: dead.pos.z };
  state.spike.dropTick = state.tick;
  state.events.push({ tick: state.tick, type: 'spikeDropped', x: dead.pos.x, z: dead.pos.z });
}

/**
 * Try to fire the shooter's weapon this tick. Handles fire interval,
 * ammo, reload state and recoil bloom. Returns the shot result, or null
 * when no shot was fired (cooling down, reloading, empty, or not firing).
 * `wantFire` is the trigger state (held for autos, edge for semi-autos).
 */
export function tryFire(state, agent, wantFire, dt) {
  const weapon = WEAPONS[agent.weapon];
  agent.fireCooldown -= dt;
  agent.bloom = Math.max(0, agent.bloom - dt * 0.09);
  if (agent.reloading) {
    agent.reloadT -= dt;
    if (agent.reloadT <= 0) {
      agent.reloading = false;
      const need = weapon.mag - agent.ammo;
      const take = Math.min(need, agent.reserve);
      agent.ammo += take;
      agent.reserve -= take;
    }
    return null;
  }
  if (!wantFire) {
    agent.triggerHeld = false;
    return null;
  }
  if (!weapon.auto && agent.triggerHeld) return null;
  agent.triggerHeld = true;
  if (agent.fireCooldown > 0) return null;
  if (agent.ammo <= 0) {
    agent.fireCooldown = 0.25; // dry-fire click
    state.sounds.push({ tick: state.tick, type: 'dry', x: agent.pos.x, z: agent.pos.z });
    return { dry: true };
  }
  agent.fireCooldown = weapon.fireInterval;
  agent.ammo -= 1;
  agent.shotsFired = (agent.shotsFired || 0) + 1;
  agent.bloom = Math.min(weapon.recoilMax, agent.bloom + weapon.recoil);
  agent.recoilKick = Math.min(0.09, (agent.recoilKick || 0) + 0.014);
  const result = fireShot(state, agent);
  state.sounds.push({
    tick: state.tick,
    type: 'shot',
    weapon: agent.weapon,
    x: agent.pos.x,
    z: agent.pos.z,
  });
  // Gunfire is loud: bots inside 26 m hear it and turn toward the sound.
  for (const other of state.agents) {
    if (!other.alive || other.id === agent.id || !other.bot) continue;
    const dx = other.pos.x - agent.pos.x;
    const dz = other.pos.z - agent.pos.z;
    if (dx * dx + dz * dz < 26 * 26) {
      other.heardAt = { x: agent.pos.x, z: agent.pos.z, tick: state.tick };
    }
  }
  return result;
}

/** Start a reload if the magazine is not full and reserve ammo remains. */
export function startReload(state, agent) {
  const weapon = WEAPONS[agent.weapon];
  if (agent.reloading || agent.ammo >= weapon.mag || agent.reserve <= 0) return false;
  agent.reloading = true;
  agent.reloadT = weapon.reloadTime;
  state.sounds.push({ tick: state.tick, type: 'reload', x: agent.pos.x, z: agent.pos.z });
  return true;
}
