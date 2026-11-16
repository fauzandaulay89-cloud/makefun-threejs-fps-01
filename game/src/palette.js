// palette.js — The Dusk Yard look: one dusk palette, used by the 3D scene,
// the HUD and the site markers, so the whole game reads as one place.

export const PALETTE = {
  // Sky and light
  sky: 0x2b2140, // deep dusk violet
  fog: 0x2b2140,
  sun: 0xffa35c, // low warm sun
  sunIntensity: 1.5,
  hemiSky: 0x8a7bd8,
  hemiGround: 0x3a2a1a,
  hemiIntensity: 0.8,

  // Ground and structures
  ground: 0x4a4640, // worn asphalt
  groundLine: 0xc9a227, // faded lane paint
  concrete: 0x6f6a63, // perimeter and mid walls
  concreteDark: 0x55504a,
  metal: 0x46536b, // steel containers
  metalDark: 0x333d4f,
  wood: 0x8a6a3f, // crates
  woodDark: 0x6e5230,
  trim: 0xd8d2c4, // wall caps and edges

  // Sites
  siteA: 0xff8c2e, // ember orange
  siteB: 0x37c8e8, // cool cyan

  // Teams
  ember: 0xff7a2e, // attackers — warm ember
  emberDark: 0xb34d12,
  vigil: 0x3fb6ff, // defenders — cool vigil blue
  vigilDark: 0x1d6fb8,

  // Agents and gear
  body: 0x3c3f46,
  bodyDark: 0x2a2c31,
  visor: 0xffd27a,
  gun: 0x1e2024,
  gunAccent: 0x8f96a3,

  // HUD
  hudText: '#e8e2d4',
  hudDim: '#9a937f',
  hudGood: '#7ee081',
  hudBad: '#ff6b5e',
  hudGold: '#e8c15a',
};
