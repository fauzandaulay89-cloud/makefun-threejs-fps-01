// bots.js — The bot brain: waypoint routes, holds, reactions, hearing,
// rotates and the plant/defuse objective. Every bot returns the same
// intent object the human player produces, so one simulation step runs all.
//
// Roles are assigned at round start: attackers split between the two sites
// (the spike carrier plus a buddy take one, the rest the other or mid),
// defenders hold two on each site and one on mid. When the spike is
// planted, defenders rotate to it and attackers hold the site.

import { WAYPOINTS, findPath, nearestWaypoint, hasLineOfSight, siteAt } from './map.js';
import { eyeOf } from './combat.js';

const VIS_RANGE = 46;
const REACT_MIN = 0.22;
const REACT_MAX = 0.55;

/** Yaw that faces from `from` toward `to` (yaw 0 faces -z). */
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** Smallest signed angle from a to b, in [-PI, PI]. */
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Assign roles and opening routes for a fresh round. */
export function assignRoles(state) {
  const rng = state.rng;
  const atkSite = rng.chance(0.5) ? 'A' : 'B';
  const atkTarget = atkSite === 'A' ? 10 : 15;
  const otherSite = atkSite === 'A' ? 15 : 10;
  const attackers = state.agents.filter((a) => a.team === 0);
  const carrier = state.agents.find((a) => a.id === state.spike.carrierId);
  attackers.forEach((a, i) => {
    if (a === carrier) {
      a.role = 'carrier';
      a.targetWp = atkTarget;
    } else if (i === 1) {
      a.role = 'buddy';
      a.targetWp = atkTarget;
    } else if (i === 2) {
      a.role = 'flank';
      a.targetWp = 3; // mid doors, then rotate to the plant
    } else {
      a.role = 'split';
      a.targetWp = otherSite;
    }
    a.path = [];
    a.holdPos = null;
  });
  const defenders = state.agents.filter((a) => a.team === 1);
  const defPlan = [10, 22, 15, 23, 4]; // A, A-north, B, B-north, mid
  defenders.forEach((a, i) => {
    a.role = 'hold';
    a.targetWp = defPlan[i % defPlan.length];
    a.path = [];
    a.holdPos = null;
  });
}

/**
 * Nearest living enemy the bot can see right now (eye-level line of sight,
 * in range, not blinded). Returns the agent or null.
 */
export function visibleEnemy(state, bot) {
  if (bot.flash > 0.15) return null;
  const eye = eyeOf(bot);
  let best = null;
  let bestD = Infinity;
  for (const other of state.agents) {
    if (!other.alive || other.team === bot.team) continue;
    const dx = other.pos.x - bot.pos.x;
    const dz = other.pos.z - bot.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > VIS_RANGE * VIS_RANGE) continue;
    const oEye = eyeOf(other);
    if (!hasLineOfSight(eye.x, eye.y, eye.z, oEye.x, oEye.y, oEye.z)) continue;
    if (d2 < bestD) {
      bestD = d2;
      best = other;
    }
  }
  return best;
}

/** Steer along the bot's waypoint path; returns wish direction (mx, mz). */
function followPath(bot, dt) {
  if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) return { mx: 0, mz: 0, arrived: true };
  const node = WAYPOINTS[bot.path[bot.pathIdx]];
  const dx = node[0] - bot.pos.x;
  const dz = node[1] - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) {
    bot.pathIdx += 1;
    return followPath(bot, dt);
  }
  return { mx: dx / d, mz: dz / d, arrived: false };
}

/** Plan a route to a waypoint, from the bot's current position. */
function routeTo(bot, targetWp) {
  const from = nearestWaypoint(bot.pos.x, bot.pos.z);
  bot.path = findPath(from, targetWp);
  bot.pathIdx = 0;
  bot.targetWp = targetWp;
}

/** The bot's intent for this tick. */
export function botIntent(state, bot, dt) {
  const rng = state.rng;
  const intent = {
    mx: 0,
    mz: 0,
    yaw: bot.yaw,
    pitch: bot.pitch,
    crouch: false,
    jump: false,
    fire: false,
    reload: false,
    plant: false,
    defuse: false,
    flash: false,
    switchTo: null,
    speed: 1,
  };
  if (!bot.alive) return intent;
  if (state.phase === 'buy' || state.phase === 'roundEnd' || state.phase === 'matchEnd') {
    return intent; // stand still between rounds
  }

  // --- Senses ---------------------------------------------------------
  const enemy = visibleEnemy(state, bot);
  if (enemy) {
    if (bot.targetId !== enemy.id) {
      bot.targetId = enemy.id;
      // Reaction time: further targets take longer to notice.
      const d = Math.hypot(enemy.pos.x - bot.pos.x, enemy.pos.z - bot.pos.z);
      bot.reactionT = REACT_MIN + rng.range(0, REACT_MAX - REACT_MIN) + d * 0.004;
      bot.lastSeenPos = { x: enemy.pos.x, z: enemy.pos.z };
    } else {
      bot.lastSeenPos = { x: enemy.pos.x, z: enemy.pos.z };
    }
  } else if (bot.targetId !== null) {
    // Lost sight: keep the last known spot for a moment, then forget.
    bot.loseT = (bot.loseT || 0) + dt;
    if (bot.loseT > 1.2) {
      bot.targetId = null;
      bot.loseT = 0;
    }
  }

  // --- Objective: plant / defuse --------------------------------------
  const planted = state.spike.state === 'planted';
  if (bot.team === 0 && state.spike.carrierId === bot.id && !planted) {
    const site = siteAt(bot.pos.x, bot.pos.z);
    if (site && !enemy) {
      intent.plant = true; // plant when the site looks clear
      return intent;
    }
    // Carrier heads for the assigned site.
    if (bot.targetWp === null || bot.path.length === 0) routeTo(bot, bot.targetWp);
  }
  if (bot.team === 1 && planted) {
    const dx = state.spike.pos.x - bot.pos.x;
    const dz = state.spike.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.6 && !enemy) {
      intent.defuse = true; // defuse when nobody is shooting at us
      intent.yaw = yawTo(bot.pos, { x: state.spike.pos.x, z: state.spike.pos.z });
      return intent;
    }
    if (dist < 5) {
      // Close enough to walk straight to the spike across the open site.
      intent.mx = dx / dist;
      intent.mz = dz / dist;
      intent.yaw = yawTo(bot.pos, state.spike.pos);
      return intent;
    }
    // Rotate to the planted site.
    const siteWp = state.spike.site === 'A' ? 10 : 15;
    if (bot.targetWp !== siteWp || bot.path.length === 0) routeTo(bot, siteWp);
  }
  if (bot.team === 0 && planted) {
    // Attackers hold the planted site instead of pushing on.
    const siteWp = state.spike.site === 'A' ? 10 : 15;
    const dx = bot.pos.x - WAYPOINTS[siteWp][0];
    const dz = bot.pos.z - WAYPOINTS[siteWp][1];
    if (Math.hypot(dx, dz) > 6 && (bot.targetWp !== siteWp || bot.path.length === 0)) {
      routeTo(bot, siteWp);
    }
  }

  // --- Combat ----------------------------------------------------------
  if (enemy && bot.reactionT <= 0) {
    const eye = eyeOf(bot);
    const target = {
      x: enemy.pos.x,
      z: enemy.pos.z,
    };
    const dist = Math.hypot(target.x - bot.pos.x, target.z - bot.pos.z);
    // Aim error: grows with distance, target speed and our own movement.
    const targetSpeed = Math.hypot(enemy.vel.x, enemy.vel.z);
    const mySpeed = Math.hypot(bot.vel.x, bot.vel.z);
    const err = 0.008 + dist * 0.0009 + targetSpeed * 0.0016 + mySpeed * 0.003 +
      (bot.flash > 0 ? 0.25 : 0);
    bot.aimErr = err;
    const aimYaw = yawTo(bot.pos, target) + rng.gauss() * err;
    const aimPitch = Math.atan2(eyeOf(enemy).y - eye.y, dist) + rng.gauss() * err * 0.7;
    intent.yaw = aimYaw;
    intent.pitch = aimPitch;
    // Fire in bursts of 3-5 with a pause between bursts.
    if (bot.burstLeft <= 0) {
      if (bot.burstPause === undefined || bot.burstPause <= 0) {
        bot.burstLeft = rng.int(3, 5);
        bot.burstPause = rng.range(0.35, 0.8);
      } else {
        bot.burstPause -= dt;
      }
    }
    // Blind them first: occasionally open an engagement with a flashbang.
    if (bot.flashCount > 0 && dist > 10 && rng.next() < 0.004) {
      intent.flash = true;
    }
    if (bot.burstLeft > 0) {
      intent.fire = true;
      bot.burstLeft -= 1;
      if (bot.burstLeft === 0) bot.burstPause = rng.range(0.35, 0.8);
    }
    // Strafe while fighting, changing direction every second or so.
    bot.strafeT = (bot.strafeT || 0) - dt;
    if (bot.strafeT <= 0) {
      bot.strafeT = rng.range(0.6, 1.4);
      bot.strafeDir = rng.pick([-1, 0, 1]);
    }
    const sd = bot.strafeDir || 0;
    const sin = Math.sin(intent.yaw);
    const cos = Math.cos(intent.yaw);
    intent.mx = cos * sd * 0.7;
    intent.mz = -sin * sd * 0.7;
    // Reload when the mag is low and the fight pauses.
    if (bot.ammo <= 4 && bot.burstLeft <= 0) intent.reload = true;
    return intent;
  }
  if (bot.reactionT > 0) bot.reactionT -= dt;

  // --- Hearing: turn toward a recent gunshot, investigate if close -----
  if (!enemy && bot.heardAt && state.tick - bot.heardAt.tick < 90) {
    const dx = bot.heardAt.x - bot.pos.x;
    const dz = bot.heardAt.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    intent.yaw = yawTo(bot.pos, bot.heardAt);
    if (d < 14 && d > 3 && bot.path.length === 0) {
      routeTo(bot, nearestWaypoint(bot.heardAt.x, bot.heardAt.z));
    }
  }

  // --- Stuck detection: a path that makes no progress skips a node -----
  if (bot.path.length > 0 && bot.pathIdx < bot.path.length) {
    if (!bot.lastPos) bot.lastPos = { x: bot.pos.x, z: bot.pos.z };
    const moved = Math.hypot(bot.pos.x - bot.lastPos.x, bot.pos.z - bot.lastPos.z);
    if (moved > 0.5) {
      bot.lastPos = { x: bot.pos.x, z: bot.pos.z };
      bot.stuckT = 0;
    } else {
      bot.stuckT = (bot.stuckT || 0) + dt;
      if (bot.stuckT > 1.5) {
        bot.stuckT = 0;
        bot.pathIdx += 1; // skip the node we cannot reach
        bot.lastPos = { x: bot.pos.x, z: bot.pos.z };
      }
    }
  }

  // --- Movement: follow the route, then hold and watch -----------------
  if (bot.path.length === 0) {
    if (bot.targetWp !== null && bot.targetWp !== undefined) routeTo(bot, bot.targetWp);
    else {
      bot.holdPos = { x: bot.pos.x, z: bot.pos.z };
    }
  }
  const move = followPath(bot, dt);
  if (!move.arrived) {
    intent.mx = move.mx;
    intent.mz = move.mz;
    intent.yaw = yawTo(bot.pos, {
      x: bot.pos.x + move.mx,
      z: bot.pos.z + move.mz,
    });
    // Look toward the next waypoint, but glance at the last seen enemy.
    if (bot.lastSeenPos) {
      const d = Math.hypot(bot.lastSeenPos.x - bot.pos.x, bot.lastSeenPos.z - bot.pos.z);
      if (d < 20) intent.yaw = yawTo(bot.pos, bot.lastSeenPos);
    }
    return intent;
  }
  // Arrived: hold position, face the likely approach.
  if (!bot.holdPos) {
    bot.holdPos = { x: bot.pos.x, z: bot.pos.z };
    // Face the centre of the map (or the planted site) while holding.
    const look = planted && state.spike.pos
      ? state.spike.pos
      : { x: 0, z: bot.team === 0 ? -14 : 14 };
    bot.holdYaw = yawTo(bot.pos, look) + rng.range(-0.5, 0.5);
    // Decide once whether this bot holds crouched behind cover.
    bot.crouchHold = bot.role === 'hold' && rng.chance(0.4);
  }
  // Slow scan while holding.
  bot.scanT = (bot.scanT || 0) + dt;
  intent.yaw = (bot.holdYaw || 0) + Math.sin(bot.scanT * 0.45) * 0.55;
  intent.pitch = 0;
  intent.crouch = !!bot.crouchHold;
  if (bot.ammo < 8) intent.reload = true;
  return intent;
}
