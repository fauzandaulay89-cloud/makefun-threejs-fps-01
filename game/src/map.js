// map.js — Dusk Yard: the map, its collision and its bot routes.
// Pure data and pure math (no three.js, no DOM) so the headless simulation
// and the browser renderer share exactly one map.
//
// Layout, 52 x 40 m (x -26..26, z -20..20), attackers south, defenders north:
//   * three north-south lanes: west (A), mid, east (B)
//   * A site in the north-west corner, B site in the north-east corner
//   * mid runs straight into the defender spawn — the classic flank
//   * long divider walls split the lanes, each with one cross-passage gap
//   * crates and low walls give cover without blocking sightlines outright

export const MAP = {
  width: 52,
  depth: 40,
  minX: -26,
  maxX: 26,
  minZ: -20,
  maxZ: 20,
  wallHeight: 3.4,
  eyeHeight: 1.62,
  crouchEye: 1.08,
  agentRadius: 0.38,
  agentHeight: 1.78,
};

// Every solid box: {x0, z0, x1, z1, h, kind} — axis-aligned, y from 0 to h.
// kind: 'wall' (tall, blocks sight), 'crate' (low, blocks movement, not sight),
// 'container' (tall metal, blocks both).
export const SOLIDS = [
  // Perimeter
  { x0: -27, z0: -21, x1: 27, z1: -20, h: 4, kind: 'wall' },
  { x0: -27, z0: 20, x1: 27, z1: 21, h: 4, kind: 'wall' },
  { x0: -27, z0: -20, x1: -26, z1: 20, h: 4, kind: 'wall' },
  { x0: 26, z0: -20, x1: 27, z1: 20, h: 4, kind: 'wall' },
  // Lane dividers (west / east), each with a cross-passage gap at z -4..-2
  { x0: -12, z0: -8, x1: -10, z1: -4, h: 3.4, kind: 'wall' },
  { x0: -12, z0: -2, x1: -10, z1: 14, h: 3.4, kind: 'wall' },
  { x0: 10, z0: -8, x1: 12, z1: -4, h: 3.4, kind: 'wall' },
  { x0: 10, z0: -2, x1: 12, z1: 14, h: 3.4, kind: 'wall' },
  // Site approach walls: narrow the lane entrances into the sites
  { x0: -24, z0: -10, x1: -18, z1: -8, h: 3.2, kind: 'wall' },
  { x0: -14, z0: -10, x1: -12, z1: -8, h: 3.2, kind: 'wall' },
  { x0: 12, z0: -10, x1: 14, z1: -8, h: 3.2, kind: 'wall' },
  { x0: 18, z0: -10, x1: 24, z1: -8, h: 3.2, kind: 'wall' },
  // Mid "double doors": two stubs, a 3 m gap in the middle
  { x0: -4, z0: 1.5, x1: -1.5, z1: 3, h: 3.4, kind: 'wall' },
  { x0: 1.5, z0: 1.5, x1: 4, z1: 3, h: 3.4, kind: 'wall' },
  // Defender-spawn screen walls: mid may pass, the sides may not
  { x0: -10, z0: -13, x1: -4, z1: -11, h: 3.2, kind: 'wall' },
  { x0: 4, z0: -13, x1: 10, z1: -11, h: 3.2, kind: 'wall' },
  // Site pocket walls (defenders rotate around their south end)
  { x0: -12, z0: -18, x1: -10, z1: -12, h: 3.0, kind: 'wall' },
  { x0: 10, z0: -18, x1: 12, z1: -12, h: 3.0, kind: 'wall' },
  // Metal containers — tall cover in the lanes
  { x0: -24.5, z0: 8, x1: -21.5, z1: 10.5, h: 2.6, kind: 'container' },
  { x0: 21.5, z0: 8, x1: 24.5, z1: 10.5, h: 2.6, kind: 'container' },
  { x0: -8.5, z0: -7.5, x1: -5.5, z1: -5.5, h: 2.4, kind: 'container' },
  { x0: 5.5, z0: -7.5, x1: 8.5, z1: -5.5, h: 2.4, kind: 'container' },
  // Crates — low cover (block movement, not eye-level sight)
  { x0: -3.5, z0: 6, x1: -1.5, z1: 8, h: 1.2, kind: 'crate' },
  { x0: 1.5, z0: -3.5, x1: 3.5, z1: -1.5, h: 1.2, kind: 'crate' },
  { x0: -5, z0: -9, x1: -3, z1: -7.5, h: 1.0, kind: 'crate' },
  { x0: -24, z0: 4.5, x1: -21.5, z1: 7.5, h: 1.4, kind: 'crate' },
  { x0: 21.5, z0: 4.5, x1: 24, z1: 7.5, h: 1.4, kind: 'crate' },
  { x0: -22, z0: -4, x1: -20, z1: -2, h: 1.1, kind: 'crate' },
  { x0: 20, z0: -4, x1: 22, z1: -2, h: 1.1, kind: 'crate' },
  { x0: -16, z0: -7, x1: -14, z1: -5, h: 2.2, kind: 'crate' },
  { x0: 14, z0: -7, x1: 16, z1: -5, h: 2.2, kind: 'crate' },
  { x0: -22, z0: -16, x1: -20, z1: -14, h: 1.3, kind: 'crate' },
  { x0: 20, z0: -16, x1: 22, z1: -14, h: 1.3, kind: 'crate' },
  { x0: -16.5, z0: -17, x1: -14.5, z1: -15, h: 1.3, kind: 'crate' },
  { x0: 14.5, z0: -17, x1: 16.5, z1: -15, h: 1.3, kind: 'crate' },
  { x0: -9, z0: 18, x1: -7, z1: 19.5, h: 1.2, kind: 'crate' },
  { x0: 7, z0: 18, x1: 9, z1: 19.5, h: 1.2, kind: 'crate' },
  { x0: -9, z0: -19, x1: -7, z1: -17.5, h: 1.2, kind: 'crate' },
  { x0: 7, z0: -19, x1: 9, z1: -17.5, h: 1.2, kind: 'crate' },
];

export const SITES = {
  A: { name: 'A', cx: -18, cz: -14, r: 4.2, color: 0xff8c2e },
  B: { name: 'B', cx: 18, cz: -14, r: 4.2, color: 0x37c8e8 },
};

export const SPAWNS = {
  // team 0 = attackers (Ember), south; team 1 = defenders (Vigil), north
  0: [
    { x: -6, z: 17.5 },
    { x: -2, z: 18 },
    { x: 2, z: 18 },
    { x: 6, z: 17.5 },
    { x: 0, z: 16 },
  ],
  1: [
    { x: -6, z: -17.5 },
    { x: -2, z: -18 },
    { x: 2, z: -18 },
    { x: 6, z: -17.5 },
    { x: 0, z: -16 },
  ],
};

// Waypoint graph for bot navigation. Nodes are (x, z); edges are walkable
// straight lines (checked against SOLIDS when the graph was designed).
export const WAYPOINTS = [
  [0, 17], // 0 attacker spawn
  [0, 12], // 1 mid south
  [0, 5], // 2 mid doors south
  [0, 0], // 3 mid doors north
  [0, -8], // 4 mid north
  [0, -16], // 5 defender spawn
  [-11, -3], // 6 west cross-passage
  [-18, 2], // 7 west lane mid
  [-18, -6], // 8 west lane north
  [-16, -9], // 9 A gap
  [-18, -14], // 10 site A
  [11, -3], // 11 east cross-passage
  [18, 2], // 12 east lane mid
  [18, -6], // 13 east lane north
  [16, -9], // 14 B gap
  [18, -14], // 15 site B
  [-18, 12], // 16 west lane south
  [18, 12], // 17 east lane south
  [-6, 16], // 18 attacker spawn west
  [6, 16], // 19 attacker spawn east
  [-6, -16], // 20 defender spawn west
  [6, -16], // 21 defender spawn east
  [-18, -17], // 22 site A north
  [18, -17], // 23 site B north
];

export const EDGES = [
  [0, 1], [0, 18], [0, 19], [1, 2], [1, 18], [1, 19],
  [2, 3], [3, 4], [3, 6], [3, 11], [4, 5], [4, 6], [4, 11],
  [4, 20], [4, 21], [5, 20], [5, 21],
  [6, 7], [6, 8], [7, 8], [7, 16], [8, 9], [9, 10],
  [10, 22], [11, 12], [11, 13], [12, 13], [12, 17], [13, 14],
  [14, 15], [15, 23], [16, 18], [17, 19],
];

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

/** Breadth-first path between waypoint indices; returns node indices. */
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nxt of ADJ[cur]) {
      if (prev[nxt] !== -1) continue;
      prev[nxt] = cur;
      if (nxt === to) {
        const path = [to];
        let n = to;
        while (n !== from) {
          n = prev[n];
          path.unshift(n);
        }
        return path;
      }
      queue.push(nxt);
    }
  }
  return [from];
}

/** Index of the waypoint nearest to (x, z). */
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ------------------------------------------------------------ collision

/** Push a circle (x, z, radius) out of every solid it overlaps. Mutates pos. */
export function collideCircle(pos, radius) {
  for (const s of SOLIDS) {
    const cx = Math.max(s.x0, Math.min(pos.x, s.x1));
    const cz = Math.max(s.z0, Math.min(pos.z, s.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - s.x0;
      const pr = s.x1 - pos.x;
      const pt = pos.z - s.z0;
      const pb = s.z1 - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = s.x0 - radius;
      else if (m === pr) pos.x = s.x1 + radius;
      else if (m === pt) pos.z = s.z0 - radius;
      else pos.z = s.z1 + radius;
    }
  }
  pos.x = Math.max(MAP.minX + radius, Math.min(MAP.maxX - radius, pos.x));
  pos.z = Math.max(MAP.minZ + radius, Math.min(MAP.maxZ - radius, pos.z));
}

/**
 * Ray vs AABB (slab test). Returns the smallest t in [0, maxT] where the ray
 * enters the box, or Infinity. The ray is o + t*d.
 */
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  // x slab
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.x0 || ox > box.x1) return Infinity;
  } else {
    let t1 = (box.x0 - ox) / dx;
    let t2 = (box.x1 - ox) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  // y slab (box spans y 0..h)
  if (Math.abs(dy) < 1e-9) {
    if (oy < 0 || oy > box.h) return Infinity;
  } else {
    let t1 = (0 - oy) / dy;
    let t2 = (box.h - oy) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  // z slab
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.z0 || oz > box.z1) return Infinity;
  } else {
    let t1 = (box.z0 - oz) / dz;
    let t2 = (box.z1 - oz) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** Nearest wall hit distance along a ray, or Infinity when it flies clear. */
export function rayWalls(ox, oy, oz, dx, dy, dz, maxT) {
  let best = Infinity;
  for (const s of SOLIDS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, s, maxT);
    if (t < best) best = t;
  }
  return best;
}

/** True when the segment between two eye-level points is not blocked by a wall. */
export function hasLineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const t = rayWalls(ax, ay, az, dx / len, dy / len, dz / len, len);
  return t === Infinity;
}

/** True when (x, z) lies inside a bomb site's plant zone. */
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = x - s.cx;
    const dz = z - s.cz;
    if (dx * dx + dz * dz <= s.r * s.r) return key;
  }
  return null;
}

/** A point a few metres ahead of an agent, used for flashbang throws. */
export function pointAhead(pos, yaw, dist) {
  return {
    x: pos.x - Math.sin(yaw) * dist,
    z: pos.z - Math.cos(yaw) * dist,
  };
}
