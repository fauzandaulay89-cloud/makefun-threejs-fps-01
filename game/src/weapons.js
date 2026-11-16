// Weapons: the catalogue, the per-actor loadout state, and the first-person
// view model. Damage and spread live here; the ray and the hit live in
// combat.js, so a bot and the player fire through the same numbers. A
// flashbang is a thrown projectile, not a hitscan weapon: its flight lives
// in combat.js, its stock lives here.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    damage: 30, headMult: 4, fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, zoom: 1, kind: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Hornet-9 SMG', price: 900, mag: 28, reserve: 84,
    damage: 21, headMult: 4, fireGap: 0.075, reloadTime: 1.7, auto: true,
    spreadStill: 0.006, spreadMove: 0.034, zoom: 1, kind: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'Longbow-5 Rifle', price: 2700, mag: 30, reserve: 90,
    damage: 34, headMult: 4, fireGap: 0.095, reloadTime: 1.9, auto: true,
    spreadStill: 0.002, spreadMove: 0.026, zoom: 1, kind: 'rifle',
  },
  marksman: {
    id: 'marksman', name: 'Needle-7 Marksman', price: 4100, mag: 5, reserve: 15,
    damage: 88, headMult: 4, fireGap: 1.05, reloadTime: 2.6, auto: false,
    spreadStill: 0.0008, spreadMove: 0.05, zoom: 2.2, kind: 'marksman',
  },
};

export const FLASH_PRICE = 250;
export const ARMOR_PRICE = 650;

export function createLoadout() {
  const owned = {
    sidearm: { mag: WEAPONS.sidearm.mag, reserve: WEAPONS.sidearm.reserve },
  };
  return {
    owned,
    current: 'sidearm',
    cooldown: 0,
    reloadLeft: 0,
    kick: 0,
    flash: 0,
    grenades: 0,
    armor: 0,
    switchLeft: 0,
    def() {
      return WEAPONS[this.current];
    },
    has(id) {
      return Boolean(this.owned[id]);
    },
    buy(id) {
      if (this.has(id)) return false;
      this.owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    // Refill what the actor owns at a round start: full mags, fresh reserve.
    refill() {
      for (const id of Object.keys(this.owned)) {
        this.owned[id].mag = WEAPONS[id].mag;
        this.owned[id].reserve = WEAPONS[id].reserve;
      }
      this.cooldown = 0;
      this.reloadLeft = 0;
      this.flash = 0;
      this.kick = 0;
      this.grenades = 0;
    },
    switchTo(id) {
      if (!this.has(id) || this.current === id || this.reloadLeft > 0) return false;
      this.current = id;
      this.switchLeft = 0.35;
      this.cooldown = Math.max(this.cooldown, 0.35);
      return true;
    },
    ready() {
      const slot = this.owned[this.current];
      return slot.mag > 0 && this.cooldown === 0 && this.reloadLeft === 0 && this.switchLeft === 0;
    },
    takeRound() {
      const slot = this.owned[this.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    pullTrigger() {
      this.cooldown = this.def().fireGap;
      this.flash = 0.06;
      this.kick = this.def().id === 'marksman' ? 0.11 : 0.055;
    },
    reload() {
      const slot = this.owned[this.current];
      const def = this.def();
      if (this.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return false;
      this.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = this.def();
      const moving = Math.min(1, speed / 5.4);
      return def.spreadStill + moving * def.spreadMove;
    },
    step(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.switchLeft = Math.max(0, this.switchLeft - dt);
      this.kick += (0 - this.kick) * Math.min(1, dt * 14);
      if (this.reloadLeft > 0) {
        this.reloadLeft = Math.max(0, this.reloadLeft - dt);
        if (this.reloadLeft === 0) {
          const slot = this.owned[this.current];
          const def = this.def();
          const need = def.mag - slot.mag;
          const take = Math.min(need, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
      }
    },
  };
}

// The first-person view model: a boxy gun built from the palette, a muzzle
// flash plane and a point light that fires with it. One model per weapon,
// only the current one visible. Attached to the camera, so it never needs a
// world transform of its own.
export function createViewModel(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.8, metalness: 0.1 });

  function build(kind) {
    const model = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      piece.position.set(x, y, z);
      model.add(piece);
      return piece;
    };
    if (kind === 'sidearm') {
      add(0.06, 0.09, 0.24, 0, 0, -0.1, bodyMat);
      add(0.05, 0.11, 0.07, 0, -0.09, 0.02, grip);
    } else if (kind === 'smg') {
      add(0.08, 0.09, 0.34, 0, 0, -0.12, bodyMat);
      add(0.04, 0.04, 0.3, 0, 0.02, -0.3, grip);
      add(0.05, 0.12, 0.06, 0, -0.1, 0.0, grip);
    } else if (kind === 'marksman') {
      add(0.09, 0.1, 0.55, 0, 0, -0.18, bodyMat);
      add(0.05, 0.05, 0.06, 0, 0.075, -0.12, dark);
      add(0.04, 0.04, 0.42, 0, 0.02, -0.42, grip);
      add(0.06, 0.1, 0.08, 0, -0.09, 0.05, grip);
    } else {
      add(0.09, 0.1, 0.44, 0, 0, -0.16, bodyMat);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.4, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.28, grip);
      add(0.03, 0.06, 0.1, 0, 0.07, -0.05, dark);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {
    sidearm: build('sidearm'),
    smg: build('smg'),
    rifle: build('rifle'),
    marksman: build('marksman'),
  };
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = null;
  return {
    setWeapon(id) {
      if (current === id) return;
      if (current) models[current].visible = false;
      current = id;
      models[current].visible = true;
    },
    step(loadout, dt) {
      const model = models[current];
      model.position.z = -0.42 + loadout.kick;
      model.rotation.x = loadout.kick * 2.2 + (loadout.reloadLeft > 0 ? -0.5 : 0);
      model.position.y = -0.2 - loadout.switchLeft * 0.25;
      flash.visible = loadout.flash > 0;
      flash.rotation.z = loadout.flash * 30;
      flashLight.intensity = loadout.flash > 0 ? 18 : 0;
      void dt;
    },
  };
}
