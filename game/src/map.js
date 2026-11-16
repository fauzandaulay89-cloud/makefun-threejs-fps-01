// The map: "Dusk Yard", an original container yard at dusk. 52 x 40 m, two
// plant sites (A west, B east), three lanes (A Long, Mid, B Lane) and a
// waypoint graph the bots walk. Every box is a collider for movement and a
// surface a bullet stops on. Plain geometry only: no models, no textures
// loaded from disk — the site letters are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  halfX: 26,
  halfZ: 20,
  // Attackers (the player's team) spawn south, defenders north.
  attackerSpawn: { x: 0, z: 16.5, yaw: 0 },
  defenderSpawn: { x: 0, z: -16.5, yaw: Math.PI },
  sites: {
    A: { x: -20, z: -13, half: 3.4 },
    B: { x: 20, z: -13, half: 3.4 },
  },
  plantTime: 3.2,
  defuseTime: 4.0,
  fuseTime: 35,
};

// Waypoint graph: node id -> { x, z, links: [ids] }. Bots plan a route by
// breadth-first search over this graph, then walk the nodes in order.
const WAYPOINTS = [
  { id: 'atk', x: 0, z: 16.5, links: ['aLow', 'midLow', 'bLow'] },
  { id: 'aLow', x: -14, z: 15, links: ['atk', 'aMid'] },
  { id: 'aMid', x: -21, z: 7, links: ['aLow', 'aTop'] },
  { id: 'aTop', x: -21, z: -4, links: ['aMid', 'aSite', 'midTop'] },
  { id: 'aSite', x: -20, z: -13, links: ['aTop', 'aHold'] },
  { id: 'aHold', x: -16, z: -15.5, links: ['aSite', 'midTop'] },
  { id: 'midLow', x: 0, z: 8, links: ['atk', 'midEast'] },
  { id: 'midEast', x: 3.4, z: 4, links: ['midLow', 'mid'] },
  { id: 'mid', x: 0, z: 0, links: ['midEast', 'midTop'] },
  { id: 'midTop', x: 0, z: -8, links: ['mid', 'aTop', 'bTop', 'def'] },
  { id: 'bLow', x: 14, z: 15, links: ['atk', 'bMid'] },
  { id: 'bMid', x: 21, z: 7, links: ['bLow', 'bTop'] },
  { id: 'bTop', x: 21, z: -4, links: ['bMid', 'bSite', 'midTop'] },
  { id: 'bSite', x: 20, z: -13, links: ['bTop', 'bHold'] },
  { id: 'bHold', x: 16, z: -15.5, links: ['bSite', 'midTop'] },
  { id: 'def', x: 0, z: -16.5, links: ['midTop', 'aHold', 'bHold'] },
  { id: 'aWatch', x: -21, z: -9.5, links: ['aTop'] },
  { id: 'bWatch', x: 21, z: -9.5, links: ['bTop'] },
  { id: 'midWatch', x: 0, z: -11, links: ['midTop'] },
];

export function findRoute(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    const node = WAYPOINTS.find((w) => w.id === current);
    if (!node) continue;
    for (const next of node.links) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === toId) {
        const path = [toId];
        let step = current;
        while (step !== null) {
          path.unshift(step);
          step = prev.get(step);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toId];
}

export function waypoint(id) {
  return WAYPOINTS.find((w) => w.id === id) ?? WAYPOINTS[0];
}

export function nearestWaypoint(x, z) {
  let best = WAYPOINTS[0];
  let bestD = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

function letterTexture(letter, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = colour;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.95, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.9, metalness: 0.05 }),
    containerA: new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.75, metalness: 0.25 }),
    containerB: new THREE.MeshStandardMaterial({ color: 0x2e6f6a, roughness: 0.75, metalness: 0.25 }),
    containerC: new THREE.MeshStandardMaterial({ color: 0x5a6e8a, roughness: 0.75, metalness: 0.25 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 0.9, metalness: 0.05 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0xe4572e, roughness: 0.6, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 }),
    line: new THREE.MeshBasicMaterial({ color: 0xf0a830 }),
    siteA: new THREE.MeshBasicMaterial({ color: 0x35c4a8, transparent: true, opacity: 0.28 }),
    siteB: new THREE.MeshBasicMaterial({ color: 0x35c4a8, transparent: true, opacity: 0.28 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe6b0 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 14), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter: a yard walled on all four sides, open to the dusk sky.
  box(52.8, 0.4, 40.8, 0, -0.2, 0, mats.asphalt);
  box(0.6, 5.2, 40.8, -26.3, 2.6, 0, mats.wall);
  box(0.6, 5.2, 40.8, 26.3, 2.6, 0, mats.wall);
  box(52.8, 5.2, 0.6, 0, 2.6, -20.3, mats.wall);
  box(52.8, 5.2, 0.6, 0, 2.6, 20.3, mats.wall);

  // Lane paint: a faded centre line down Mid.
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 30), mats.line.clone());
  midLine.material.opacity = 0.35;
  midLine.material.transparent = true;
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.set(0, 0.02, 2);
  group.add(midLine);

  // Site A (west): container stack forming a pocket, crates for cover.
  box(6.1, 2.6, 2.5, -23, 1.3, -13, mats.containerA);
  box(6.1, 2.6, 2.5, -23, 3.9, -13, mats.containerB);
  box(2.5, 2.6, 6.1, -17.4, 1.3, -17.4, mats.containerC);
  box(1.4, 1.1, 1.4, -19, 0.55, -9.5, mats.crate);
  box(1.4, 1.1, 1.4, -17.2, 0.55, -9.5, mats.crate);
  box(1.4, 1.1, 1.4, -18.1, 0.55, -15.8, mats.crate);
  cylinder(0.42, 0.42, 1.05, -21.5, 0.53, -9.8, mats.barrel);
  cylinder(0.42, 0.42, 1.05, -15.8, 0.53, -11.2, mats.barrel);

  // Site B (east): mirrored pocket, different container colours.
  box(6.1, 2.6, 2.5, 23, 1.3, -13, mats.containerB);
  box(6.1, 2.6, 2.5, 23, 3.9, -13, mats.containerA);
  box(2.5, 2.6, 6.1, 17.4, 1.3, -17.4, mats.containerC);
  box(1.4, 1.1, 1.4, 19, 0.55, -9.5, mats.crate);
  box(1.4, 1.1, 1.4, 17.2, 0.55, -9.5, mats.crate);
  box(1.4, 1.1, 1.4, 18.1, 0.55, -15.8, mats.crate);
  cylinder(0.42, 0.42, 1.05, 21.5, 0.53, -9.8, mats.barrel);
  cylinder(0.42, 0.42, 1.05, 15.8, 0.53, -11.2, mats.barrel);

  // Mid: a low blockhouse with a door gap, crates on both flanks, barrels.
  // A container at z=6 breaks the straight sightline from the defender side
  // to the attacker spawn, so nobody can snipe the spawn down Mid; the lane
  // bends around it through the east gap.
  box(2.4, 2.6, 1.2, 0, 1.3, 6, mats.containerA);
  box(3.2, 2.4, 1.2, -2.6, 1.2, -2, mats.containerC);
  box(3.2, 2.4, 1.2, 2.6, 1.2, -2, mats.containerC);
  box(8.4, 1.0, 1.2, 0, 2.9, -2, mats.dark);
  box(1.4, 1.1, 1.4, -6.5, 0.55, 3.5, mats.crate);
  box(1.4, 1.1, 1.4, 6.5, 0.55, 3.5, mats.crate);
  box(1.4, 1.1, 1.4, -6.5, 0.55, -7.5, mats.crate);
  box(1.4, 1.1, 1.4, 6.5, 0.55, -7.5, mats.crate);
  cylinder(0.42, 0.42, 1.05, -4.4, 0.53, -5.4, mats.barrel);
  cylinder(0.42, 0.42, 1.05, 4.4, 0.53, -5.4, mats.barrel);

  // A Long / B Lane: staggered containers make corners and sightlines.
  box(2.5, 2.6, 6.1, -23.4, 1.3, 2, mats.containerC);
  box(2.5, 2.6, 6.1, -23.4, 1.3, 9.5, mats.containerB);
  box(1.4, 1.1, 1.4, -19.5, 0.55, 5, mats.crate);
  box(2.5, 2.6, 6.1, 23.4, 1.3, 2, mats.containerB);
  box(2.5, 2.6, 6.1, 23.4, 1.3, 9.5, mats.containerC);
  box(1.4, 1.1, 1.4, 19.5, 0.55, 5, mats.crate);

  // Spawn cover: low walls so neither spawn is a fishbowl.
  box(4.0, 1.1, 0.8, -4, 0.55, 13.5, mats.crate);
  box(4.0, 1.1, 0.8, 4, 0.55, 13.5, mats.crate);
  box(4.0, 1.1, 0.8, -4, 0.55, -13.5, mats.crate);
  box(4.0, 1.1, 0.8, 4, 0.55, -13.5, mats.crate);

  // Floodlight poles: tall masts with a glowing lamp head (light comes from
  // the sun and hemisphere lights; these are visual anchors, not lights).
  for (const [x, z] of [[-12, -18], [12, -18], [-12, 18], [12, 18], [0, -19]]) {
    box(0.25, 7, 0.25, x, 3.5, z, mats.dark);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.5), mats.lamp);
    lamp.position.set(x, 7.1, z);
    group.add(lamp);
  }

  // Site floor glows and floating letter signs.
  for (const [key, mat] of [['A', mats.siteA], ['B', mats.siteB]]) {
    const site = MAP.sites[key];
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(site.half * 2, site.half * 2), mat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(site.x, 0.03, site.z);
    group.add(glow);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(key, '#35c4a8'), transparent: true }),
    );
    sign.position.set(site.x, 4.6, site.z);
    group.add(sign);
  }

  // Dusk sky: a big gradient dome, warm at the horizon, deep blue above.
  const skyGeo = new THREE.SphereGeometry(180, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x1b2340) },
      mid: { value: new THREE.Color(0x8a5a3a) },
      bottom: { value: new THREE.Color(0x2a2118) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bottom, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Light: a low amber sun from the west, a cool blue hemisphere fill.
  const hemi = new THREE.HemisphereLight(new THREE.Color(0x8a97c0), new THREE.Color(0x2a2118), 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb45e), 2.6);
  sun.position.set(-30, 16, 18);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x5a7ab0), 0.75);
  fill.position.set(20, 12, -14);
  scene.add(fill);

  void PALETTE;
  return { colliders, shootables, group, waypoints: WAYPOINTS };
}
