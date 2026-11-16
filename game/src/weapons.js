// weapons.js — The armoury and the economy.
// Every weapon is pure data: damage, fire rate, magazine, spread, recoil,
// reload time and price. Combat reads this table; the buy menu renders it.

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'P9 Sidearm',
    short: 'P9',
    price: 0,
    damage: 26,
    headMult: 2.0,
    fireInterval: 0.16, // seconds between shots (semi-auto, hold to fire)
    auto: false,
    mag: 12,
    reserve: 48,
    reloadTime: 1.5,
    spreadBase: 0.011, // radians of cone at rest
    spreadMove: 0.02,
    spreadAir: 0.05,
    recoil: 0.011, // bloom added per shot
    recoilMax: 0.055,
    range: 60,
    tracer: 0xffe08a,
  },
  smg: {
    id: 'smg',
    name: 'Vex-9 SMG',
    short: 'VEX',
    price: 900,
    damage: 22,
    headMult: 2.0,
    fireInterval: 0.085,
    auto: true,
    mag: 32,
    reserve: 128,
    reloadTime: 2.0,
    spreadBase: 0.016,
    spreadMove: 0.026,
    spreadAir: 0.06,
    recoil: 0.009,
    recoilMax: 0.075,
    range: 45,
    tracer: 0xffd27a,
  },
  rifle: {
    id: 'rifle',
    name: 'AR-77 Duskline',
    short: 'AR-77',
    price: 2700,
    damage: 33,
    headMult: 2.0,
    fireInterval: 0.1,
    auto: true,
    mag: 30,
    reserve: 90,
    reloadTime: 2.4,
    spreadBase: 0.008,
    spreadMove: 0.02,
    spreadAir: 0.055,
    recoil: 0.012,
    recoilMax: 0.06,
    range: 80,
    tracer: 0xfff2b0,
  },
  marksman: {
    id: 'marksman',
    name: 'Longbow-50',
    short: 'LB-50',
    price: 4200,
    damage: 82,
    headMult: 2.5,
    fireInterval: 1.15,
    auto: false,
    mag: 5,
    reserve: 15,
    reloadTime: 3.1,
    spreadBase: 0.002,
    spreadMove: 0.035,
    spreadAir: 0.08,
    recoil: 0.05,
    recoilMax: 0.09,
    range: 120,
    tracer: 0xcfe8ff,
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'marksman'];

export const ARMOR = {
  id: 'armor',
  name: 'Kevlar Vest',
  short: 'KEV',
  price: 650,
  armor: 100,
};

export const FLASHBANG = {
  id: 'flash',
  name: 'Flashbang',
  short: 'FLASH',
  price: 200,
  maxCarry: 2,
};

// Economy: money in dollars, Counter-Strike style.
export const ECONOMY = {
  startMoney: 800,
  winBonus: 3250,
  lossBonus: 1900,
  killReward: 300,
  plantReward: 300,
  maxMoney: 16000,
};

/** Price list for the buy menu, in display order. */
export const BUY_ITEMS = [
  { kind: 'weapon', id: 'smg' },
  { kind: 'weapon', id: 'rifle' },
  { kind: 'weapon', id: 'marksman' },
  { kind: 'armor', id: 'armor' },
  { kind: 'flash', id: 'flash' },
];

/** Damage after armour: armour soaks half, losing half the soaked amount. */
export function applyArmor(damage, armor) {
  if (armor <= 0) return { damage, armor: 0 };
  const soaked = Math.min(damage * 0.5, armor);
  return { damage: damage - soaked * 0.5, armor: armor - soaked };
}
