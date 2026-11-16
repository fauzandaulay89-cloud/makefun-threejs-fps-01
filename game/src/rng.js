// Deterministic randomness for the whole game. The seed comes from the
// URL (?seed=N) so a screenshot capture replays exactly; a live match seeds
// from the clock instead. Anything that can change a round goes through
// this one source — never Math.random() inside the simulation — which is
// what makes bot behaviour and ?shot= captures reproducible.
export function mulberry32(seedValue) {
  let state = seedValue | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A roll in [low, high) drawn from a seeded source.
export function range(random, low, high) {
  return low + random() * (high - low);
}

// One element of an array, picked from a seeded source.
export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}
