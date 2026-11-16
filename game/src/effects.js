// effects.js — Tracers, muzzle flash, impact sparks and the spike blast.
// Pools of preallocated objects: nothing is allocated in the hot loop,
// tracers and sparks are recycled.

import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 128;

/**
 * Create the effects layer for a scene. Returns { tracer(from, to, color),
 * impact(point), muzzleFlash(), explosion(point), update(dt) }.
 * `from`/`to`/`point` are plain {x, y, z} objects.
 */
export function createEffects(scene) {
  // --- Tracers ---------------------------------------------------------
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // --- Sparks ----------------------------------------------------------
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffc46b,
    size: 0.09,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  sparkPoints.visible = false;
  scene.add(sparkPoints);
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparks.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  let sparkIdx = 0;

  // --- Muzzle flash + explosion light ----------------------------------
  const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
  scene.add(flashLight);
  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  let flashLife = 0;

  const blastLight = new THREE.PointLight(0xff7a2e, 0, 40, 1.2);
  scene.add(blastLight);
  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0xff8c2e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  blastMesh.visible = false;
  scene.add(blastMesh);
  let blastLife = 0;
  let blastPos = { x: 0, y: 0, z: 0 };

  function tracer(from, to, color) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % MAX_TRACERS;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x;
    pos[1] = from.y;
    pos[2] = from.z;
    pos[3] = to.x;
    pos[4] = to.y;
    pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color || 0xffe08a);
    t.line.visible = true;
    t.life = 0.09;
  }

  function impact(point) {
    for (let n = 0; n < 7; n++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % MAX_SPARKS;
      s.x = point.x;
      s.y = point.y;
      s.z = point.z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2.2 + 0.6;
      const sp = Math.random() * 2.4 + 0.8;
      s.vx = Math.cos(a) * sp;
      s.vy = up;
      s.vz = Math.sin(a) * sp;
      s.life = 0.35 + Math.random() * 0.2;
    }
    sparkPoints.visible = true;
  }

  function muzzleFlash(worldPos, camera) {
    flashLife = 0.055;
    flashLight.position.copy(worldPos);
    flashLight.intensity = 14;
    flashMesh.position.copy(worldPos);
    flashMesh.visible = true;
    flashMesh.lookAt(camera.position);
  }

  function explosion(point) {
    blastLife = 0.7;
    blastPos = { x: point.x, y: point.y + 0.5, z: point.z };
    blastLight.position.set(blastPos.x, blastPos.y + 1, blastPos.z);
    blastLight.intensity = 60;
    blastMesh.position.set(blastPos.x, blastPos.y, blastPos.z);
    blastMesh.visible = true;
    for (let n = 0; n < 40; n++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % MAX_SPARKS;
      s.x = blastPos.x;
      s.y = blastPos.y;
      s.z = blastPos.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = Math.random() * 9 + 3;
      s.vx = Math.cos(a) * Math.cos(b) * sp;
      s.vy = Math.abs(Math.sin(b)) * sp + 2;
      s.vz = Math.sin(a) * Math.cos(b) * sp;
      s.life = 0.6 + Math.random() * 0.5;
    }
    sparkPoints.visible = true;
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        t.line.material.opacity = 0;
      } else {
        t.line.material.opacity = t.life / 0.09;
      }
    }
    let anySpark = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparks[i];
      if (s.life <= 0) {
        sparkPos[i * 3 + 1] = -999;
        continue;
      }
      anySpark = true;
      s.life -= dt;
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.02) {
        s.y = 0.02;
        s.vy *= -0.3;
      }
      sparkPos[i * 3] = s.x;
      sparkPos[i * 3 + 1] = s.y;
      sparkPos[i * 3 + 2] = s.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkPoints.visible = anySpark;
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = Math.max(0, flashLife / 0.055) * 14;
      flashMesh.material.opacity = Math.max(0, flashLife / 0.055);
      if (flashLife <= 0) {
        flashLight.intensity = 0;
        flashMesh.visible = false;
      }
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = Math.max(0, blastLife / 0.7);
      const r = (1 - k) * 9 + 0.5;
      blastMesh.scale.set(r, r, r);
      blastMesh.material.opacity = k * 0.75;
      blastLight.intensity = k * 60;
      if (blastLife <= 0) {
        blastMesh.visible = false;
        blastLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, muzzleFlash, explosion, update };
}
