// Combat: one code path for the player and every bot. A shot is a ray from
// the shooter's eye with spread; the first thing it meets is either the map
// (an impact spark) or an actor's head or torso mesh (damage, head shots
// multiply). Armour absorbs half of what remains. Flashbangs are thrown
// projectiles with a short fuse: anyone with line of sight who is facing the
// burst is blinded for up to ~2.8 s. All hot-loop vectors are reused.
import * as THREE from 'three';

const FLASH_FUSE = 1.4;
const FLASH_RANGE = 26;

export function createCombat({ scene, world, effects, audio, random }) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const actors = [];
  const grenades = [];
  const tmpDir = new THREE.Vector3();
  const tmpFrom = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });

  // Flat cache of every actor hit mesh, rebuilt when an actor registers.
  // A shot raycasts the map and this list separately and takes the nearer
  // hit, so no per-shot array is built.
  let targetMeshes = null;
  function getTargetMeshes() {
    if (targetMeshes) return targetMeshes;
    targetMeshes = [];
    for (const a of actors) targetMeshes.push(...a.hitMeshes);
    return targetMeshes;
  }

  function buildInvisibleHitMeshes(actor) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), mat);
    torso.position.y = 1.05;
    torso.userData.actor = actor;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat);
    head.position.y = 1.62;
    head.userData.actor = actor;
    head.userData.part = 'head';
    group.add(torso, head);
    scene.add(group);
    return { group, meshes: [torso, head] };
  }

  function registerActor(actor, hitMeshes) {
    // hitMeshes: [{mesh, part}] built by the caller (bot bodies), or null for
    // an invisible capsule (the player, who has no visible body of their own).
    if (!hitMeshes) {
      const built = buildInvisibleHitMeshes(actor);
      actor.hitGroup = built.group;
      actor.hitMeshes = built.meshes;
    } else {
      for (const { mesh, part } of hitMeshes) {
        mesh.userData.actor = actor;
        mesh.userData.part = part;
      }
      actor.hitMeshes = hitMeshes.map((h) => h.mesh);
    }
    targetMeshes = null;
    actor.alive = true;
    actor.health = 100;
    actor.flashTime = 0;
    actors.push(actor);
    return actor;
  }

  function damage(victim, amount, part) {
    if (!victim.alive) return { killed: false, dealt: 0 };
    let dealt = amount;
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, dealt * 0.5);
      victim.armor -= absorbed;
      dealt -= absorbed;
    }
    victim.health -= dealt;
    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      return { killed: true, dealt, part };
    }
    return { killed: false, dealt, part };
  }

  function shoot(shooter, spread, muzzle) {
    const loadout = shooter.loadout;
    if (!loadout.takeRound()) return null;
    loadout.pullTrigger();
    const def = loadout.def();
    shooter.mover.eyePosition(tmpFrom);
    tmpDir.set(0, 0, -1).applyEuler(new THREE.Euler(shooter.mover.state.pitch, shooter.mover.state.yaw, 0, 'YXZ'));
    tmpDir.x += (random() * 2 - 1) * spread;
    tmpDir.y += (random() * 2 - 1) * spread;
    tmpDir.z += (random() * 2 - 1) * spread;
    tmpDir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(tmpFrom, tmpDir);
    const wallHit = raycaster.intersectObjects(world.shootables, false)[0] ?? null;
    const bodyHits = raycaster.intersectObjects(getTargetMeshes(), false);
    let bodyHit = null;
    for (const h of bodyHits) {
      const a = h.object.userData.actor;
      if (a && a.alive && a !== shooter) {
        bodyHit = h;
        break;
      }
    }
    const hit = bodyHit && (!wallHit || bodyHit.distance < wallHit.distance) ? bodyHit : wallHit;
    const muzzlePos = muzzle ?? tmpFrom;
    if (!hit) {
      tmpTo.copy(tmpFrom).addScaledVector(tmpDir, 60);
      effects.tracer(muzzlePos, tmpTo);
      return { hit: false };
    }
    tmpTo.copy(hit.point);
    effects.tracer(muzzlePos, tmpTo);
    const actorHit = hit.object.userData.actor;
    if (!actorHit || !actorHit.alive) {
      effects.impact(hit.point, false);
      return { hit: false, point: hit.point };
    }
    const part = hit.object.userData.part;
    const mult = part === 'head' ? def.headMult : 1;
    const result = damage(actorHit, def.damage * mult, part);
    effects.impact(hit.point, true);
    return { hit: true, victim: actorHit, part, killed: result.killed, dealt: result.dealt, point: hit.point };
  }

  function lineOfSight(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    raycaster.far = 120;
    return hits.length === 0;
  }

  function throwFlash(thrower) {
    if (thrower.loadout.grenades <= 0) return false;
    thrower.loadout.grenades -= 1;
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    thrower.mover.eyePosition(tmpFrom);
    mesh.position.copy(tmpFrom);
    tmpDir.set(0, 0, -1).applyEuler(new THREE.Euler(thrower.mover.state.pitch, thrower.mover.state.yaw, 0, 'YXZ'));
    const vel = new THREE.Vector3(tmpDir.x * 15, tmpDir.y * 15 + 3.5, tmpDir.z * 15);
    scene.add(mesh);
    grenades.push({ mesh, vel, fuse: FLASH_FUSE, bounces: 0, thrower });
    return true;
  }

  function detonate(g) {
    const pos = g.mesh.position;
    audio.flash();
    effects.impact(pos, false);
    for (const a of actors) {
      if (!a.alive) continue;
      a.mover.eyePosition(tmpEye);
      tmpDir.subVectors(pos, tmpEye);
      const dist = tmpDir.length();
      if (dist > FLASH_RANGE) continue;
      if (dist > 3 && !lineOfSight(tmpEye, pos)) continue;
      // Facing the burst blinds fully; turned away, only a short dazzle.
      tmpTo.set(0, 0, -1).applyEuler(new THREE.Euler(a.mover.state.pitch, a.mover.state.yaw, 0, 'YXZ'));
      const facing = tmpDir.normalize().dot(tmpTo);
      const factor = facing > 0.2 ? 1 : 0.35;
      const strength = Math.max(0, 1 - dist / FLASH_RANGE) * factor;
      a.flashTime = Math.max(a.flashTime, 0.35 + strength * 2.45);
    }
    scene.remove(g.mesh);
  }

  function stepGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y <= 0.09) {
        p.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
        g.bounces += 1;
      }
      if (g.fuse <= 0 || g.bounces >= 2) {
        detonate(g);
        grenades.splice(i, 1);
      }
    }
  }

  return {
    actors,
    registerActor,
    damage,
    shoot,
    lineOfSight,
    throwFlash,
    step(dt) {
      stepGrenades(dt);
      for (const a of actors) {
        if (a.flashTime > 0) a.flashTime = Math.max(0, a.flashTime - dt);
        // Keep the player's invisible hit meshes glued to their body.
        if (a.hitGroup) {
          a.hitGroup.position.copy(a.mover.state.position);
          a.hitGroup.rotation.y = a.mover.state.yaw;
          // Crouching lowers the capsule: scale the group down.
          const s = a.mover.state.crouching ? 0.72 : 1;
          a.hitGroup.scale.set(1, s, 1);
        }
      }
    },
    resetActor(actor) {
      actor.alive = true;
      actor.health = 100;
      actor.flashTime = 0;
      if (actor.hitGroup) actor.hitGroup.visible = true;
    },
    hideActor(actor) {
      if (actor.hitGroup) actor.hitGroup.visible = false;
    },
    eyeOf(actor, out) {
      return actor.mover.eyePosition(out ?? tmpEye);
    },
  };
}
