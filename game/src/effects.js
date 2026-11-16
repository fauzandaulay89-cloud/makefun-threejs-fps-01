// Transient visuals: bullet tracers, impact sparks and the spike's glow.
// Everything is pooled and reused: no object is created in a frame, ever.
// A tracer is a line that fades in 80 ms; a spark is a point in one shared
// THREE.Points cloud whose life is counted down in place.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 240;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  let sparkCursor = 0;

  // The spike's pulsing ring, shown while it is planted.
  const ringGeo = new THREE.RingGeometry(0.5, 0.72, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe4572e, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const spikeRing = new THREE.Mesh(ringGeo, ringMat);
  spikeRing.rotation.x = -Math.PI / 2;
  spikeRing.visible = false;
  scene.add(spikeRing);

  const tmpColor = new THREE.Color();

  function spawnSparks(x, y, z, count, colour, speed) {
    tmpColor.set(colour);
    for (let n = 0; n < count; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      sparkPos[i * 3] = x;
      sparkPos[i * 3 + 1] = y;
      sparkPos[i * 3 + 2] = z;
      sparkVel[i * 3] = (Math.random() * 2 - 1) * speed;
      sparkVel[i * 3 + 1] = Math.random() * speed * 0.9;
      sparkVel[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
      sparkCol[i * 3] = tmpColor.r;
      sparkCol[i * 3 + 1] = tmpColor.g;
      sparkCol[i * 3 + 2] = tmpColor.b;
      sparkLife[i] = 0.4 + Math.random() * 0.35;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  return {
    tracer(from, to) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      const attr = t.line.geometry.attributes.position;
      attr.array[0] = from.x;
      attr.array[1] = from.y;
      attr.array[2] = from.z;
      attr.array[3] = to.x;
      attr.array[4] = to.y;
      attr.array[5] = to.z;
      attr.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    impact(point, isFlesh) {
      if (isFlesh) spawnSparks(point.x, point.y, point.z, 10, 0xd43a2a, 2.2);
      else spawnSparks(point.x, point.y, point.z, 7, 0xf0a830, 3.2);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
        else t.line.material.opacity = (t.life / 0.09) * 0.9;
      }
      let anyAlive = false;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anyAlive = true;
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) {
          sparkPos[i * 3 + 1] = -100;
          continue;
        }
        sparkVel[i * 3 + 1] -= 9 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) {
          sparkPos[i * 3 + 1] = 0.02;
          sparkVel[i * 3 + 1] *= -0.3;
        }
      }
      if (anyAlive) sparkGeo.attributes.position.needsUpdate = true;
    },
    showSpike(x, z, planted) {
      spikeRing.visible = planted;
      if (planted) spikeRing.position.set(x, 0.06, z);
    },
    pulseSpike(time) {
      if (!spikeRing.visible) return;
      const s = 1 + Math.sin(time * 6) * 0.12;
      spikeRing.scale.set(s, s, 1);
      ringMat.opacity = 0.55 + Math.sin(time * 6) * 0.25;
    },
  };
}
