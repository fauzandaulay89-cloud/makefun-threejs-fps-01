// main.js — Browser bootstrap for Dusk Yard.
// Owns the game loop: fixed-step simulation, event/sound/tracer draining,
// HUD, audio and rendering. Screenshot modes (?shot=start|play|site|end)
// stage a deterministic scene and freeze it for capture.

import { createMatch, step, buyFor, STEP } from './sim.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { currentSpread } from './combat.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { FUSE_SECONDS } from './rounds.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | site | end | null
const SEED = parseInt(params.get('seed') || '20261117', 10);

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const effects = createEffects(renderer.scene);
const audio = createAudio();
const names = [];

let state = null;
let buyOpen = true;
let paused = false;
let shake = 0;
let shotCam = null;
let lastEventIdx = 0;
let lastSoundIdx = 0;
let lastPhase = null;
let framesRendered = 0;

const hud = createHud(document, {
  onStart() {
    audio.ensure();
    hud.hideOverlays();
    input.lock();
  },
  onRestart() {
    startMatch((Date.now() % 2147483647) >>> 0);
    hud.hideOverlays();
    input.lock();
  },
  onBuy(kind, id) {
    const player = state.agents[0];
    if (buyFor(state, player, kind, id)) audio.buy();
    else audio.dry();
  },
  onBuyToggle() {
    if (state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.setBuyOpen(buyOpen);
    }
  },
});

const input = createInput(canvas, {
  onAnyGesture() {
    audio.ensure();
  },
  onBuyToggle() {
    if (state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.setBuyOpen(buyOpen);
    }
  },
  onCycleWeapon(dir) {
    const player = state.agents[0];
    const owned = WEAPON_ORDER.filter((id) => player.owned[id]);
    if (owned.length < 2) return;
    const cur = owned.indexOf(player.weapon);
    const next = owned[(cur + dir + owned.length) % owned.length];
    input.input.switchTo = next;
  },
});

canvas.addEventListener('click', () => {
  if (SHOT) return; // screenshot mode: no pointer lock
  if (state.phase === 'matchEnd') return;
  if (!input.locked()) input.lock();
});

// Number keys buy from the menu while it is open (instead of switching).
window.addEventListener('keydown', (e) => {
  if (state.phase !== 'buy' || !buyOpen) return;
  const buyKeys = { Digit1: ['weapon', 'smg'], Digit2: ['weapon', 'rifle'], Digit3: ['weapon', 'marksman'], Digit4: ['armor', 'armor'], Digit5: ['flash', 'flash'] };
  const item = buyKeys[e.code];
  if (!item) return;
  input.input.switchTo = null;
  const player = state.agents[0];
  if (buyFor(state, player, item[0], item[1])) audio.buy();
});

window.addEventListener('resize', () => renderer.resize());

function startMatch(seed, autopilot = false) {
  state = createMatch(seed, { autopilot });
  names.length = 0;
  for (const a of state.agents) names.push(a.name);
  lastEventIdx = 0;
  lastSoundIdx = 0;
  lastPhase = null;
  buyOpen = true;
  hud.setBuyOpen(true);
  hud.resetFeed();
  hud.showStart();
  state.tracers.length = 0;
}

/** Distance from the player to a sound, for attenuation. */
function distToPlayer(s) {
  const p = state.agents[0].pos;
  return Math.hypot(s.x - p.x, s.z - p.z);
}

function drainEvents() {
  const player = state.agents[0];
  for (let i = lastEventIdx; i < state.events.length; i++) {
    const ev = state.events[i];
    switch (ev.type) {
      case 'roundStart':
        hud.banner(`ROUND ${ev.round}`, 'BUY PHASE — PRESS B FOR THE SHOP');
        buyOpen = true;
        hud.setBuyOpen(true);
        break;
      case 'roundLive':
        hud.banner('GO GO GO', 'TAKE A SITE · PLANT THE SPIKE', 1800);
        break;
      case 'hit':
        if (ev.shooterId === player.id) {
          hud.showHitmarker(ev.headshot, false);
          audio.hit(ev.headshot);
        }
        break;
      case 'kill':
        if (ev.killerId === player.id) {
          hud.showHitmarker(ev.headshot, true);
          audio.kill();
        }
        if (ev.victimId === player.id) {
          hud.banner('YOU ARE DOWN', 'YOUR TEAM FIGHTS ON', 2200);
        }
        break;
      case 'planted':
        audio.planted();
        hud.banner('SPIKE PLANTED', `SITE ${ev.site} · ${FUSE_SECONDS} SECONDS TO DETONATION`, 3000);
        break;
      case 'defused':
        audio.defuseBeep();
        hud.banner('SPIKE DEFUSED', '', 2600);
        break;
      case 'spikeDropped':
        hud.banner('SPIKE DROPPED', 'PICK IT UP, EMBER', 2000);
        break;
      case 'spikePickup':
        if (ev.byId === player.id) hud.banner('YOU HAVE THE SPIKE', 'HOLD E IN A SITE TO PLANT', 2200);
        break;
      case 'roundEnd': {
        const won = ev.winner === player.team;
        hud.banner(
          won ? 'ROUND WON' : 'ROUND LOST',
          `${ev.reason.toUpperCase()} · ${ev.score[0]} — ${ev.score[1]}`,
          3200,
        );
        if (ev.reason === 'detonation') {
          audio.explosion();
          shake = 1.4;
          if (state.spike.pos) effects.explosion(state.spike.pos);
        } else if (won) audio.roundWin();
        else audio.roundLose();
        break;
      }
      case 'matchEnd':
        hud.showEnd(ev.winner, ev.score);
        input.unlock();
        break;
      default:
        break;
    }
  }
  lastEventIdx = state.events.length;
}

function drainSounds() {
  for (let i = lastSoundIdx; i < state.sounds.length; i++) {
    const s = state.sounds[i];
    const d = distToPlayer(s);
    switch (s.type) {
      case 'shot':
        audio.shot(s.weapon, d);
        break;
      case 'dry':
        if (d < 3) audio.dry();
        break;
      case 'reload':
        if (d < 12) audio.reload();
        break;
      case 'step':
        if (d < 16) audio.step(d);
        break;
      case 'buy':
        if (d < 3) audio.buy();
        break;
      case 'flashThrow':
        if (d < 20) audio.flashThrow();
        break;
      case 'flashPop':
        audio.flashPop(d);
        break;
      case 'planted':
        audio.plantBeep();
        break;
      case 'defused':
        audio.defuseBeep();
        break;
      default:
        break;
    }
  }
  lastSoundIdx = state.sounds.length;
}

function drainTracers() {
  for (const t of state.tracers) {
    effects.tracer(t.from, t.to, t.color);
    if (t.blocked) effects.impact(t.to);
    if (t.shooterId === 0) {
      effects.muzzleFlash(renderer.muzzleTip(), renderer.camera);
    }
  }
  state.tracers.length = 0;
}

// ------------------------------------------------------------ screenshot staging

/** Step the sim until `cond(state)` is true or the tick cap is hit. */
function stepUntil(cond, maxTicks) {
  const idle = { keys: new Set(), mouseDX: 0, mouseDY: 0, mouseDown: false, jumpQueued: false, reloadQueued: false, flashQueued: false, switchTo: null };
  let n = 0;
  while (!cond(state) && n < maxTicks) {
    step(state, idle, STEP);
    n++;
  }
}

function setupShot(mode) {
  if (mode === 'start') {
    startMatch(SEED);
    stepUntil(() => state.tick >= 30, 30);
    shotCam = { x: 0, y: 1.62, z: 17.2, yaw: 0, pitch: -0.02 };
    paused = true;
    hud.showStart();
  } else if (mode === 'play') {
    startMatch(SEED, true);
    stepUntil(() => state.phase === 'live' && state.phaseT > 2, 60 * 60);
    shotCam = { x: 2.5, y: 1.62, z: 11, yaw: 0.27, pitch: -0.01 };
    paused = true;
    hud.hideOverlays();
    hud.setBuyOpen(false);
  } else if (mode === 'site') {
    startMatch(SEED, true);
    stepUntil(() => state.spike.state === 'planted', 60 * 150);
    if (state.spike.state === 'planted') {
      const plantedTick = state.tick;
      stepUntil(() => state.tick >= plantedTick + 180, 60 * 4);
      shotCam = { x: -16, y: 1.62, z: -8.2, yaw: 0.35, pitch: -0.06 };
    } else {
      // Fallback: no plant in time — frame the mid fight instead.
      shotCam = { x: 2.5, y: 1.62, z: 11, yaw: 0.27, pitch: -0.01 };
    }
    paused = true;
    hud.hideOverlays();
    hud.setBuyOpen(false);
  } else if (mode === 'end') {
    startMatch(SEED, true);
    stepUntil(() => state.phase === 'matchEnd', 60 * 60 * 15);
    shotCam = { x: 0, y: 1.62, z: 10, yaw: 0, pitch: -0.02 };
    paused = true;
    hud.showEnd(state.matchWinner, state.score);
  }
  // Skip draining the staged events: no banners over the screenshot.
  lastEventIdx = state.events.length;
  lastSoundIdx = state.sounds.length;
  window.__ready = true;
}

// ------------------------------------------------------------ main loop

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      step(state, input.input, STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    // Buy menu closes when the buy phase ends.
    if (lastPhase === 'buy' && state.phase !== 'buy') {
      buyOpen = false;
      hud.setBuyOpen(false);
    }
    lastPhase = state.phase;
  }
  drainEvents();
  drainSounds();
  drainTracers();

  const player = state.agents[0];
  const viewAgent = player.alive
    ? player
    : state.agents.find((a) => a.team === player.team && a.alive) || player;
  const spread = currentSpread(player, WEAPONS[player.weapon]);
  hud.update(state, player, spread, names);
  renderer.sync(state, viewAgent, now / 1000, shake);
  if (shotCam) {
    renderer.camera.position.set(shotCam.x, shotCam.y, shotCam.z);
    renderer.camera.rotation.y = shotCam.yaw;
    renderer.camera.rotation.x = shotCam.pitch;
    renderer.camera.rotation.z = 0;
  }
  shake = Math.max(0, shake - dt * 1.8);
  effects.update(dt);
  renderer.render();
  framesRendered++;
  if (framesRendered === 3 && !SHOT) window.__ready = true;
}

// ------------------------------------------------------------ boot

if (SHOT) {
  setupShot(SHOT);
} else {
  startMatch((Date.now() % 2147483647) >>> 0);
}
requestAnimationFrame(frame);
