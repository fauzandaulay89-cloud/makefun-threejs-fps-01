// Bots: five Vultures defend, four Sentinels attack beside the player. Each
// bot walks the map's waypoint graph (breadth-first routes), holds a site or
// pushes a lane by role, and fights by the same rules as the player: it must
// see a target (field of view, range, line of sight), wait out a reaction
// delay, then fire in bursts with an aim error that shrinks while it stands
// still and grows with distance and target speed. Gunfire is heard: a shot
// within 20 m pulls nearby bots toward it. The spike carrier plants; when it
// is down, defenders rotate to the site and attackers hold it.
//
// Bot meshes are built LAZY, the first time a bot is stepped after the match
// state exists — building them from an empty actor list made every bot
// invisible in an earlier build.
import * as THREE from 'three';
import { createMover } from './player.js';
import { createLoadout } from './weapons.js';
import { findRoute, nearestWaypoint, waypoint } from './map.js';
import { range } from './rng.js';

const SENTINELS = ['Rook', 'Vega', 'Iris', 'Nox'];
const VULTURES = ['Ash', 'Krait', 'Moss', 'Pike', 'Wren'];
const REACT_MIN = 0.32;
const REACT_MAX = 0.62;
const SEE_RANGE = 55;
const FOV_COS = 0.35;
const HEAR_RANGE = 20;

const BODY_COLORS = { atk: 0x35c4a8, def: 0xe4572e };
const ARMOR_COLOR = 0x39415a;

function buildBody(scene, team) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_COLORS[team], roughness: 0.6, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: ARMOR_COLOR, roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), bodyMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), headMat);
  head.position.y = 1.62;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), darkMat);
  visor.position.set(0, 1.63, -0.15);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.26), darkMat);
  legs.position.y = 0.32;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.2, 1.15, -0.35);
  group.add(torso, head, visor, legs, gun);
  scene.add(group);
  return {
    group,
    hitMeshes: [
      { mesh: torso, part: 'torso' },
      { mesh: head, part: 'head' },
    ],
  };
}

export function createBots({ scene, colliders, combat, random, audio }) {
  const bots = [];
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();

  function makeBot(name, team, spawn) {
    const mover = createMover(colliders, spawn);
    const loadout = createLoadout();
    const bot = {
      id: name,
      name,
      team,
      isPlayer: false,
      mover,
      loadout,
      hitMeshes: null,
      group: null,
      armor: 0,
      alive: true,
      health: 100,
      flashTime: 0,
      // AI state
      role: 'push',
      route: [],
      routeIndex: 0,
      holdSpot: null,
      target: null,
      reactLeft: 0,
      aimTime: 0,
      burstLeft: 0,
      burstPause: 0,
      thinkLeft: random() * 0.1,
      plantProgress: 0,
      defuseProgress: 0,
      hearPoint: null,
      strafeDir: 1,
      strafeLeft: 0,
      keys: new Set(),
    };
    bots.push(bot);
    return bot;
  }

  // Meshes (and combat registration) happen on first step, once the match
  // state exists — never at construction time.
  function ensureBody(bot) {
    if (bot.group) return;
    const body = buildBody(scene, bot.team);
    bot.group = body.group;
    bot.hitMeshes = body.hitMeshes;
    combat.registerActor(bot, body.hitMeshes);
    syncBody(bot);
  }

  function spawnAll() {
    for (const name of SENTINELS) {
      makeBot(name, 'atk', { x: -6 + SENTINELS.indexOf(name) * 4, z: 16.5, yaw: 0 });
    }
    for (const name of VULTURES) {
      makeBot(name, 'def', { x: -8 + VULTURES.indexOf(name) * 4, z: -16.5, yaw: Math.PI });
    }
  }

  function resetRound(round) {
    // Attackers: two A, two B, one Mid (the player counts as the fifth push).
    // Defenders: two A, two B, one Mid.
    const atkPlans = [
      { route: ['atk', 'aLow', 'aMid', 'aTop', 'aSite'], hold: 'aSite' },
      { route: ['atk', 'bLow', 'bMid', 'bTop', 'bSite'], hold: 'bSite' },
      { route: ['atk', 'midLow', 'midEast', 'mid', 'midTop', 'aTop'], hold: 'aTop' },
      { route: ['atk', 'aLow', 'aMid', 'aTop', 'aSite'], hold: 'aHold' },
    ];
    const defPlans = [
      { hold: 'aSite', route: ['def', 'aHold', 'aSite'] },
      { hold: 'bSite', route: ['def', 'bHold', 'bSite'] },
      { hold: 'midWatch', route: ['def', 'midTop', 'midWatch'] },
      { hold: 'aWatch', route: ['def', 'midTop', 'aTop', 'aWatch'] },
      { hold: 'bWatch', route: ['def', 'midTop', 'bTop', 'bWatch'] },
    ];
    const atkBots = bots.filter((b) => b.team === 'atk');
    const defBots = bots.filter((b) => b.team === 'def');
    atkBots.forEach((bot, i) => {
      const plan = atkPlans[i % atkPlans.length];
      bot.route = [...plan.route];
      bot.routeIndex = 0;
      bot.holdSpot = plan.hold;
      bot.role = 'push';
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.hearPoint = null;
    });
    defBots.forEach((bot, i) => {
      const plan = defPlans[i % defPlans.length];
      bot.route = [...plan.route];
      bot.routeIndex = 0;
      bot.holdSpot = plan.hold;
      bot.role = 'push';
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.hearPoint = null;
    });
    // Loadouts: defenders hold rifles, attackers mix rifle and SMG.
    for (const bot of bots) {
      bot.loadout.refill();
      const pick = random();
      if (bot.team === 'def') {
        bot.loadout.buy('rifle');
        bot.loadout.switchTo('rifle');
      } else if (pick < 0.5) {
        bot.loadout.buy('rifle');
        bot.loadout.switchTo('rifle');
      } else {
        bot.loadout.buy('smg');
        bot.loadout.switchTo('smg');
      }
      if (random() < 0.4) bot.loadout.grenades = 1;
      bot.loadout.armor = 50;
      bot.armor = 50;
      combat.resetActor(bot);
      if (bot.group) {
        bot.group.visible = true;
        bot.group.rotation.set(0, 0, 0);
        bot.group.position.y = 0;
      }
    }
    void round;
  }

  function spawnPoint(bot) {
    return bot.team === 'atk'
      ? { x: -6 + SENTINELS.indexOf(bot.name) * 4, z: 16.5, yaw: 0 }
      : { x: -8 + VULTURES.indexOf(bot.name) * 4, z: -16.5, yaw: Math.PI };
  }

  function teleportToSpawn(bot) {
    const spawn = spawnPoint(bot);
    bot.mover.teleport(spawn.x, spawn.z, spawn.yaw);
    if (bot.group) {
      bot.group.position.copy(bot.mover.state.position);
      bot.group.rotation.y = bot.mover.state.yaw;
    }
  }

  function canSee(bot, enemy) {
    if (!enemy.alive) return false;
    bot.mover.eyePosition(tmpEye);
    enemy.mover.eyePosition(tmpTarget);
    tmpDir.subVectors(tmpTarget, tmpEye);
    const dist = tmpDir.length();
    if (dist > SEE_RANGE) return false;
    tmpDir.normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(bot.mover.state.pitch, bot.mover.state.yaw, 0, 'YXZ'),
    );
    if (tmpDir.dot(fwd) < FOV_COS && dist > 4) return false;
    return combat.lineOfSight(tmpEye, tmpTarget);
  }

  function nearestVisibleEnemy(bot, enemies) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive || e.team === bot.team) continue;
      if (!canSee(bot, e)) continue;
      const d = bot.mover.state.position.distanceToSquared(e.mover.state.position);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function aimError(bot, target) {
    // Error in radians: base by weapon, grows with distance and target speed,
    // shrinks while the bot stands still and keeps its aim.
    const def = bot.loadout.def();
    const dist = bot.mover.state.position.distanceTo(target.mover.state.position);
    const targetSpeed = Math.hypot(target.mover.state.velocity.x, target.mover.state.velocity.z);
    let err = def.spreadStill * 10 + dist * 0.002 + targetSpeed * 0.008;
    err *= Math.max(0.45, 1 - bot.aimTime * 0.35);
    if (bot.mover.groundSpeed() > 0.5) err *= 1.8;
    return err;
  }

  function turnToward(bot, x, z, dt, rate = 6) {
    const dx = x - bot.mover.state.position.x;
    const dz = z - bot.mover.state.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.mover.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.mover.state.yaw += step;
    return Math.abs(diff) < 0.12;
  }

  function moveToward(bot, x, z, dt) {
    const facing = turnToward(bot, x, z, dt);
    bot.keys.clear();
    if (facing) bot.keys.add('KeyW');
    return facing;
  }

  function syncBody(bot) {
    if (!bot.group) return;
    bot.group.position.copy(bot.mover.state.position);
    bot.group.rotation.y = bot.mover.state.yaw;
  }

  function stepBot(bot, dt, game) {
    ensureBody(bot);
    if (!bot.alive) return;
    bot.thinkLeft -= dt;
    bot.loadout.step(dt);
    // Outside a live round the bots stand at their spots: no walking, no
    // fighting during the buy phase or between rounds.
    if (game.phase !== 'live') {
      bot.keys.clear();
      bot.mover.step(dt, bot.keys);
      syncBody(bot);
      return;
    }
    const enemies = game.actors;
    const blinded = bot.flashTime > 0;

    // --- Perception, on a staggered tick so not every bot scans each step.
    if (bot.thinkLeft <= 0) {
      bot.thinkLeft = 0.12 + random() * 0.06;
      const seen = blinded ? null : nearestVisibleEnemy(bot, enemies);
      if (seen && bot.target !== seen) {
        bot.target = seen;
        bot.reactLeft = range(random, REACT_MIN, REACT_MAX);
        bot.aimTime = 0;
      } else if (!seen) {
        bot.target = null;
      }
      // Hearing: a recent shot pulls the bot toward it when idle.
      if (!bot.target && game.lastShot && game.lastShot.team !== bot.team) {
        const d = bot.mover.state.position.distanceTo(game.lastShot.pos);
        if (d < HEAR_RANGE && game.time - game.lastShot.time < 1.2) {
          bot.hearPoint = { x: game.lastShot.pos.x, z: game.lastShot.pos.z };
        }
      }
      // Objective overrides, re-planned each tick.
      if (game.spike.planted) {
        if (bot.team === 'def') {
          const wp = game.spike.site === 'A' ? 'aSite' : 'bSite';
          if (bot.role !== 'defuse') {
            bot.role = 'defuse';
            bot.route = findRoute(nearestWaypoint(bot.mover.state.position.x, bot.mover.state.position.z).id, wp);
            bot.routeIndex = 0;
          }
        } else {
          bot.role = 'hold';
          bot.holdSpot = game.spike.site === 'A' ? 'aSite' : 'bSite';
          bot.route = [];
        }
      } else if (bot.team === 'atk' && game.spike.carrier === bot && bot.role !== 'plant') {
        bot.role = 'plant';
        const site = bot.holdSpot === 'bSite' ? 'B' : 'A';
        const wp = site === 'A' ? 'aSite' : 'bSite';
        bot.route = findRoute(nearestWaypoint(bot.mover.state.position.x, bot.mover.state.position.z).id, wp);
        bot.routeIndex = 0;
      }
    }

    // --- Combat: face the target, burst fire with aim error.
    if (bot.target && bot.target.alive && !blinded) {
      const t = bot.target;
      t.mover.eyePosition(tmpTarget);
      const err = aimError(bot, t);
      const eye = bot.mover.eyePosition(tmpEye);
      tmpDir.subVectors(tmpTarget, eye).normalize();
      // Apply the error as a small random offset to the aim point.
      const aimX = tmpTarget.x + (random() * 2 - 1) * err * 8;
      const aimY = tmpTarget.y + (random() * 2 - 1) * err * 6 - 0.15;
      const aimZ = tmpTarget.z + (random() * 2 - 1) * err * 8;
      turnToward(bot, aimX, aimZ, dt, 9);
      bot.mover.state.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(aimY - eye.y, Math.hypot(aimX - eye.x, aimZ - eye.z))));
      bot.aimTime += dt;
      if (bot.reactLeft > 0) {
        bot.reactLeft -= dt;
        bot.keys.clear();
      } else if (bot.burstPause > 0) {
        bot.burstPause -= dt;
        bot.keys.clear();
        // Strafe while waiting between bursts.
        bot.strafeLeft -= dt;
        if (bot.strafeLeft <= 0) {
          bot.strafeDir *= -1;
          bot.strafeLeft = 0.5 + random() * 0.7;
        }
        bot.keys.add(bot.strafeDir > 0 ? 'KeyD' : 'KeyA');
      } else {
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(random() * 3);
        const spread = bot.loadout.spread(bot.mover.groundSpeed()) + err * 0.4;
        bot.mover.eyePosition(tmpMuzzle);
        const result = combat.shoot(bot, spread, tmpMuzzle);
        if (result) {
          audio.shot('enemy');
          bot.burstLeft -= 1;
          game.registerShot(bot, result);
          if (bot.burstLeft <= 0) bot.burstPause = 0.45 + random() * 0.5;
        }
      }
      bot.mover.step(dt, bot.keys);
      syncBody(bot);
      return;
    }

    // --- Plant / defuse: stand in the site and hold the action.
    if (!game.spike.planted && bot.role === 'plant' && game.spike.carrier === bot) {
      const site = game.spike.siteFor(bot);
      if (site && Math.abs(bot.mover.state.position.x - site.x) < 2.4 && Math.abs(bot.mover.state.position.z - site.z) < 2.4) {
        bot.plantProgress += dt;
        bot.keys.clear();
        if (bot.plantProgress >= 3.2) {
          game.plantSpike(bot, site.key);
          bot.plantProgress = 0;
        }
        bot.mover.step(dt, bot.keys);
        syncBody(bot);
        return;
      }
    }
    if (game.spike.planted && bot.team === 'def') {
      const spike = game.spike;
      const d = Math.hypot(bot.mover.state.position.x - spike.x, bot.mover.state.position.z - spike.z);
      if (d < 1.6) {
        bot.defuseProgress += dt;
        bot.keys.clear();
        if (bot.defuseProgress >= 4.0) {
          game.defuseSpike(bot);
          bot.defuseProgress = 0;
        }
        if (Math.floor(bot.defuseProgress * 2) !== Math.floor((bot.defuseProgress - dt) * 2)) audio.defuseBeep();
        bot.mover.step(dt, bot.keys);
        syncBody(bot);
        return;
      }
    }

    // --- Movement: walk the route, then hold.
    bot.keys.clear();
    if (bot.route.length > 0 && bot.routeIndex < bot.route.length) {
      const wp = waypoint(bot.route[bot.routeIndex]);
      const dx = wp.x - bot.mover.state.position.x;
      const dz = wp.z - bot.mover.state.position.z;
      if (Math.hypot(dx, dz) < 0.9) {
        bot.routeIndex += 1;
      } else {
        moveToward(bot, wp.x, wp.z, dt);
      }
    } else if (bot.holdSpot) {
      const wp = waypoint(bot.holdSpot);
      const dx = wp.x - bot.mover.state.position.x;
      const dz = wp.z - bot.mover.state.position.z;
      if (Math.hypot(dx, dz) > 1.2) {
        moveToward(bot, wp.x, wp.z, dt);
      } else {
        // Hold: face the lane the enemy comes from.
        const face = bot.team === 'def'
          ? { x: bot.mover.state.position.x, z: bot.mover.state.position.z + 10 }
          : { x: bot.mover.state.position.x, z: bot.mover.state.position.z - 10 };
        turnToward(bot, face.x, face.z, dt, 3);
        // Idle scan: occasionally glance at the other lane.
        if (bot.thinkLeft <= 0 && random() < 0.02) {
          bot.mover.state.yaw += (random() - 0.5) * 1.2;
        }
      }
    } else if (bot.hearPoint) {
      const dx = bot.hearPoint.x - bot.mover.state.position.x;
      const dz = bot.hearPoint.z - bot.mover.state.position.z;
      if (Math.hypot(dx, dz) < 1.5) bot.hearPoint = null;
      else moveToward(bot, bot.hearPoint.x, bot.hearPoint.z, dt);
    }
    bot.mover.step(dt, bot.keys);
    syncBody(bot);
  }

  function killBot(bot) {
    if (!bot.group) return;
    bot.group.rotation.x = -Math.PI / 2;
    bot.group.position.y = 0.25;
  }

  function reviveBot(bot) {
    if (!bot.group) return;
    bot.group.rotation.set(0, 0, 0);
    bot.group.position.y = 0;
    bot.group.visible = true;
  }

  return {
    bots,
    spawnAll,
    resetRound,
    teleportToSpawn,
    killBot,
    reviveBot,
    step(dt, game) {
      for (const bot of bots) stepBot(bot, dt, game);
    },
    living(team) {
      return bots.filter((b) => b.team === team && b.alive);
    },
    names: { atk: SENTINELS, def: VULTURES },
  };
}
