// render.js — The three.js scene for Dusk Yard.
// Builds the world from the map data (map.js), keeps one mesh group per
// agent, a first-person viewmodel on the camera, and syncs everything from
// the simulation state each frame. Rendering never writes to the sim.

import * as THREE from 'three';
import { MAP, SOLIDS, SITES } from './map.js';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';

/** Procedural asphalt texture: speckle noise, lane paint, site circles. */
function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const rng = mulberry32(42);
  g.fillStyle = '#4a4640';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    const v = 58 + Math.floor(rng() * 26);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(Math.floor(rng() * 1024), Math.floor(rng() * 1024), 2, 2);
  }
  const px = (x) => ((x - MAP.minX) / MAP.width) * 1024;
  const pz = (z) => ((z - MAP.minZ) / MAP.depth) * 1024;
  const scaleX = 1024 / MAP.width;
  const scaleZ = 1024 / MAP.depth;
  // Faded lane paint: dashes down the three lanes.
  g.strokeStyle = 'rgba(201,162,39,0.55)';
  g.lineWidth = 3;
  g.setLineDash([18, 22]);
  for (const x of [-18, 0, 18]) {
    g.beginPath();
    g.moveTo(px(x), pz(14));
    g.lineTo(px(x), pz(-8));
    g.stroke();
  }
  g.setLineDash([]);
  // Site circles painted on the asphalt.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    g.strokeStyle = key === 'A' ? 'rgba(255,140,46,0.8)' : 'rgba(55,200,232,0.8)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(px(s.cx), pz(s.cz), s.r * scaleX, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = key === 'A' ? 'rgba(255,140,46,0.16)' : 'rgba(55,200,232,0.16)';
    g.fill();
  }
  // Cracks.
  g.strokeStyle = 'rgba(20,18,16,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const x = rng() * 1024;
    const y = rng() * 1024;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 90);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A canvas sprite with one big letter (site markers, name tags). */
function makeLabelSprite(text, color, scale = 1) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,8,14,0.55)';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(4, 4, 248, 120);
  g.fillStyle = color;
  g.font = 'bold 84px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4 * scale, 1.2 * scale, 1);
  return sprite;
}

/** Build the renderer and the world. Returns the render handle. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // --- Light: low warm sun + dusk hemisphere ---------------------------
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(24, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // --- Ground ------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.width + 2, MAP.depth + 2),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Solids: walls, crates, containers --------------------------------
  const jitter = mulberry32(7);
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.92 }),
    container: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.6, metalness: 0.35 }),
    crate: new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 }),
  };
  const lidMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.85 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.6, metalness: 0.3 });
  const capMat = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.8 });
  for (const s of SOLIDS) {
    const w = s.x1 - s.x0;
    const d = s.z1 - s.z0;
    const cx = (s.x0 + s.x1) / 2;
    const cz = (s.z0 + s.z1) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, s.h, d), mats[s.kind]);
    mesh.position.set(cx, s.h / 2, cz);
    mesh.castShadow = s.h > 1.5;
    mesh.receiveShadow = true;
    // Slight per-solid shade variation so the map does not read as flat.
    mesh.material = mesh.material.clone();
    mesh.material.color.offsetHSL(0, 0, (jitter() - 0.5) * 0.06);
    scene.add(mesh);
    if (s.kind === 'wall' && s.h >= 3) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06), capMat);
      cap.position.set(cx, s.h + 0.06, cz);
      scene.add(cap);
    }
    if (s.kind === 'crate') {
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.07, d * 0.92), lidMat);
      lid.position.set(cx, s.h + 0.035, cz);
      scene.add(lid);
    }
    if (s.kind === 'container') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.1, d * 0.2), stripeMat);
      stripe.position.set(cx, s.h * 0.55, cz);
      scene.add(stripe);
    }
  }

  // --- Site rings and floating letters -----------------------------------
  const siteRings = {};
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.28, s.r, 48),
      new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.cx, 0.03, s.cz);
    scene.add(ring);
    siteRings[key] = ring;
    const letter = makeLabelSprite(key, key === 'A' ? '#ff8c2e' : '#37c8e8');
    letter.position.set(s.cx, 3.4, s.cz);
    scene.add(letter);
  }

  // --- Skyline silhouettes + dusk moon -----------------------------------
  const skyRng = mulberry32(99);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x1c1626 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + skyRng() * 0.2;
    const r = 38 + skyRng() * 14;
    const h = 6 + skyRng() * 10;
    const b = new THREE.Mesh(new THREE.BoxGeometry(5 + skyRng() * 5, h, 5 + skyRng() * 5), skyMat);
    b.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
    scene.add(b);
  }
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xf5e6c8, fog: false }),
  );
  moon.position.set(-42, 34, -58);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // --- Agents --------------------------------------------------------------
  const agentMeshes = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.body, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: PALETTE.bodyDark, roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: PALETTE.gun, roughness: 0.45, metalness: 0.5 });
  for (let i = 0; i < 10; i++) {
    const team = i < 5 ? 0 : 1;
    const teamColor = team === 0 ? PALETTE.ember : PALETTE.vigil;
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.75 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.3), torsoMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.32), darkMat);
    vest.position.y = 1.08;
    group.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), bodyMat);
    head.position.y = 1.52;
    head.castShadow = true;
    group.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.visor, emissiveIntensity: 0.9 }),
    );
    visor.position.set(0, 1.54, 0.16);
    group.add(visor);
    const legs = [];
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(0.17, 0.72, 0.19);
      geo.translate(0, -0.36, 0);
      const leg = new THREE.Mesh(geo, darkMat);
      leg.position.set(side * 0.13, 0.74, 0);
      leg.castShadow = true;
      group.add(leg);
      legs.push(leg);
    }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), gunMat);
    gun.position.set(0.16, 1.12, 0.32);
    group.add(gun);
    scene.add(group);
    agentMeshes.push({ group, legs, torso, head, gun, swing: 0 });
  }

  // --- Spike ---------------------------------------------------------------
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.13, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: PALETTE.siteA, emissiveIntensity: 0.7, roughness: 0.4 }),
  );
  spike.add(spikeBody);
  const spikeLight = new THREE.PointLight(PALETTE.siteA, 0, 6, 1.5);
  spikeLight.position.y = 0.4;
  spike.add(spikeLight);
  spike.visible = false;
  scene.add(spike);

  // --- First-person viewmodel ----------------------------------------------
  const viewmodel = new THREE.Group();
  const vmGun = new THREE.MeshStandardMaterial({ color: 0x5f6776, roughness: 0.4, metalness: 0.55 });
  const vmAccent = new THREE.MeshStandardMaterial({ color: 0xc2c8d4, roughness: 0.35, metalness: 0.6 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.46), vmGun);
  viewmodel.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), vmAccent);
  barrel.position.set(0, 0.02, -0.34);
  viewmodel.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), vmGun);
  mag.position.set(0, -0.12, -0.02);
  viewmodel.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), vmAccent);
  sight.position.set(0, 0.09, -0.08);
  viewmodel.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.08), vmGun);
  grip.position.set(0, -0.1, 0.12);
  grip.rotation.x = 0.35;
  viewmodel.add(grip);
  viewmodel.position.set(0.19, -0.17, -0.38);
  camera.add(viewmodel);

  const muzzleWorld = new THREE.Vector3();

  function muzzleTip() {
    muzzleWorld.set(0.19, -0.14, -0.66);
    return camera.localToWorld(muzzleWorld);
  }

  return {
    renderer,
    scene,
    camera,
    viewmodel,
    muzzleTip,
    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    /**
     * Sync the scene from the simulation state. `player` is the human
     * agent (or the autopilot bot in screenshot mode). `time` is the
     * wall-clock seconds for idle animation; `shake` is explosion shake.
     */
    sync(state, player, time, shake) {
      // Camera: the player's eye, with recoil kick and shake.
      const eyeY = player.pos.y + (player.crouch ? MAP.crouchEye : MAP.eyeHeight);
      camera.position.set(player.pos.x, eyeY, player.pos.z);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch + (player.recoilKick || 0) * 0.9;
      camera.rotation.z = 0;
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.12;
        camera.position.y += (Math.random() - 0.5) * shake * 0.12;
        camera.rotation.z += (Math.random() - 0.5) * shake * 0.02;
      }

      // Viewmodel: bob with movement, kick with recoil.
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const bobPhase = time * 9;
      const bobAmp = Math.min(1, speed / 4.3) * 0.012;
      viewmodel.position.set(
        0.19 + Math.sin(bobPhase) * bobAmp,
        -0.17 + Math.abs(Math.cos(bobPhase)) * bobAmp * 0.7 - (player.crouch ? 0.02 : 0),
        -0.38 + (player.recoilKick || 0) * 1.6,
      );
      viewmodel.rotation.x = (player.recoilKick || 0) * 1.2;

      // Agents.
      for (let i = 0; i < state.agents.length; i++) {
        const a = state.agents[i];
        const m = agentMeshes[i];
        if (a.id === player.id) {
          m.group.visible = false; // first person: no own body
          continue;
        }
        m.group.visible = true;
        m.group.position.set(a.pos.x, a.pos.y, a.pos.z);
        if (!a.alive) {
          m.group.rotation.set(0, a.yaw + Math.PI, Math.PI / 2);
          m.group.position.y = 0.18;
          continue;
        }
        m.group.rotation.set(0, a.yaw + Math.PI, 0);
        const sp = Math.hypot(a.vel.x, a.vel.z);
        m.swing += sp * 0.11;
        const swing = Math.sin(m.swing) * 0.55 * Math.min(1, sp / 4.3);
        m.legs[0].rotation.x = swing;
        m.legs[1].rotation.x = -swing;
        m.group.position.y = a.pos.y + (a.crouch ? -0.28 : 0);
      }

      // Spike.
      const sp = state.spike;
      if (sp.state === 'planted' || sp.state === 'dropped') {
        spike.visible = true;
        spike.position.set(sp.pos.x, 0.07, sp.pos.z);
        spikeBody.material.emissiveIntensity = sp.state === 'planted' ? (Math.sin(time * 7) > 0 ? 1.6 : 0.25) : 0.5;
        spikeLight.intensity = sp.state === 'planted' ? (Math.sin(time * 7) > 0 ? 2.4 : 0.4) : 0;
      } else if (sp.state === 'carried') {
        const carrier = state.agents[sp.carrierId];
        if (carrier && carrier.id !== player.id && carrier.alive) {
          spike.visible = true;
          spike.position.set(carrier.pos.x, carrier.pos.y + 1.15, carrier.pos.z);
          spike.rotation.y = carrier.yaw + Math.PI;
          spikeBody.material.emissiveIntensity = 0.5;
          spikeLight.intensity = 0;
        } else {
          spike.visible = false;
        }
      } else {
        spike.visible = false;
      }

      // Site rings breathe while the spike is live.
      const pulse = 0.45 + Math.sin(time * 2.2) * 0.15;
      siteRings.A.material.opacity = pulse;
      siteRings.B.material.opacity = pulse;
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
