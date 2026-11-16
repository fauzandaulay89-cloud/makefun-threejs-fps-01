// rng.js — Seeded deterministic randomness for Dusk Yard.
// Every random choice in the match (spread, bot decisions, spawn jitter)
// draws from one mulberry32 stream held on the match state, so a headless
// run with a fixed seed reproduces itself tick for tick.

/** A mulberry32 generator: small, fast, deterministic for a 32-bit seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make a random source bound to one stream.
 * next()      uniform [0, 1)
 * range(a, b) uniform [a, b)
 * int(a, b)   uniform integer in [a, b]
 * pick(arr)   one element of arr
 * chance(p)   true with probability p
 * gauss()     roughly standard-normal, mean 0, sd ~1 (sum of 3 uniforms)
 */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(a, b) {
      return a + (b - a) * next();
    },
    int(a, b) {
      return a + Math.floor(next() * (b - a + 1));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
    gauss() {
      return (next() + next() + next() - 1.5) * 1.1547;
    },
  };
}

/** Small deterministic hash of a string, for deriving per-agent seeds. */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
