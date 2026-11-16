// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|site|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady. window.__game exposes the live state for testing
// (and for a headless smoke test to drive the player without pointer lock).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap, MAP } from './map.js';
import { createInput } from './input.js';
import { createMover } from './player.js';
import { createLoadout, createViewModel } from './weapons.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createBots } from './bots.js';
import { createRounds, BUY_ITEMS } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 120);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 300);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const combat = createCombat({ scene, world: map, effects, audio, random });
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots({ scene, colliders: map.colliders, combat, random, audio });
bots.spawnAll();

// --- The player actor: the same shape as a bot, so combat treats both alike.
const playerMover = createMover(map.colliders, MAP.attackerSpawn);
const playerLoadout = createLoadout();
playerLoadout.buy('rifle');
playerLoadout.switchTo('rifle');
const player = {
  id: 'you',
  name: 'You',
  team: 'atk',
  isPlayer: true,
  mover: playerMover,
  loadout: playerLoadout,
  armor: 0,
  alive: true,
  health: 100,
  flashTime: 0,
};
combat.registerActor(player, null);
const viewModel = createViewModel(camera);
viewModel.setWeapon('rifle');
let viewModelCurrent = playerLoadout.current;

const actors = [player, ...bots.bots];

const game = {
  time: 0,
  phase: 'buy',
  spike: null, // set by rounds
  actors,
  lastShot: null,
  registerShot(shooter, result) {
    if (!result) return;
    game.lastShot = { team: shooter.team, pos: shooter.mover.state.position.clone(), time: game.time };
    if (!result.hit) return;
    if (shooter.isPlayer) {
      hud.hitMarker(result.killed, shot ? 4000 : 120);
      audio.hit(result.killed);
    }
    if (result.killed) {
      const victim = result.victim;
      if (victim.isPlayer) {
        audio.hurt();
        hud.damageFlash();
      } else {
        bots.killBot(victim);
        combat.hideActor(victim);
      }
      hud.killfeed(shooter.name, victim.name, result.part === 'head');
      rounds.onKill(victim, shooter);
    } else if (result.victim.isPlayer) {
      audio.hurt();
      hud.damageFlash();
    }
  },
  plantSpike(actor, siteKey) {
    rounds.plantSpike(actor, siteKey);
  },
  defuseSpike(actor) {
    rounds.defuseSpike(actor);
  },
};

const rounds = createRounds({
  player,
  bots,
  audio,
  events: {
    onRoundStart(round) {
      resetPositions();
      hud.hideBuy();
      hud.setSpike('carry');
      hud.toast(`Round ${round} — buy phase`);
      if (!shot) hud.showOverlay('start');
    },
    onLive() {
      hud.hideBuy();
      hud.hideOverlay();
      hud.toast('Round live — plant the spike at A or B');
    },
    onRoundEnd(winner, reason, score) {
      hud.hideBuy();
      hud.setSpike('none');
      if (!shot) hud.showOverlay('roundEnd', { win: winner === 'atk', reason, score });
    },
    onMatchEnd(winner, score) {
      hud.hideBuy();
      if (!shot) hud.showOverlay('matchEnd', { win: winner === 'atk', score });
    },
    onPlant(siteKey, byPlayer) {
      hud.setSpike('planted', MAP.fuseTime);
      hud.toast(byPlayer ? `Spike planted at ${siteKey} — defend it` : `Spike planted at ${siteKey} — hold the site`);
    },
    onKill() {
      hud.setMoney(rounds.state.money);
    },
    onBuy() {
      hud.setMoney(rounds.state.money);
      refreshBuy();
    },
  },
});
game.spike = rounds.state.spike;

function resetPositions() {
  playerMover.teleport(MAP.attackerSpawn.x, MAP.attackerSpawn.z, MAP.attackerSpawn.yaw);
  playerLoadout.refill();
  playerLoadout.switchTo(playerLoadout.has('rifle') ? 'rifle' : 'sidearm');
  player.armor = playerLoadout.armor > 0 ? 50 : player.armor;
  combat.resetActor(player);
  player.alive = true;
  player.health = 100;
  for (const bot of bots.bots) {
    bots.teleportToSpawn(bot);
    bots.reviveBot(bot);
    combat.resetActor(bot);
  }
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (rounds.state.phase === 'matchEnd') {
    hud.showOverlay('matchEnd', { win: rounds.state.matchWinner === 'atk', score: rounds.state.score });
  } else if (rounds.state.phase === 'roundEnd') {
    hud.showOverlay('roundEnd', { win: rounds.state.score.atk > rounds.state.score.def, reason: rounds.state.roundEndReason, score: rounds.state.score });
  } else if (!cleared) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (!player.alive) {
    // Spectate the first living teammate while down.
    const mate = bots.living('atk')[0];
    if (mate) {
      mate.mover.eyePosition(camera.position);
      camera.rotation.set(mate.mover.state.pitch, mate.mover.state.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(playerMover.state.position.x, playerMover.state.position.y + playerMover.state.eye, playerMover.state.position.z);
  camera.rotation.set(playerMover.state.pitch, playerMover.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const p = playerMover.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

const tmpMuzzle = new THREE.Vector3();
function playerShoot() {
  const spread = playerLoadout.spread(playerMover.groundSpeed());
  camera.getWorldPosition(tmpMuzzle);
  const result = combat.shoot(player, spread, tmpMuzzle);
  if (result) {
    audio.shot(playerLoadout.def().kind);
    playerMover.recoil(0.008 + random() * 0.004, (random() * 2 - 1) * 0.004);
    game.registerShot(player, result);
    hud.setAmmo(playerLoadout.owned[playerLoadout.current].mag, playerLoadout.owned[playerLoadout.current].reserve);
  } else if (playerLoadout.owned[playerLoadout.current].mag === 0) {
    audio.dryFire();
  }
}

function refreshBuy() {
  const owned = Object.keys(playerLoadout.owned);
  hud.showBuy(BUY_ITEMS, rounds.state.money, owned);
}

function tryPlayerAction(dt) {
  // Plant: hold E inside a site while the spike is not planted.
  // Defuse: hold E next to the planted spike.
  const spike = rounds.state.spike;
  const p = playerMover.state.position;
  if (rounds.state.phase !== 'live' || !player.alive) {
    rounds.state.plantProgress = 0;
    rounds.state.defuseProgress = 0;
    hud.setAction(null, 0);
    return;
  }
  if (input.state.keys.has('KeyE')) {
    if (!spike.planted) {
      for (const key of ['A', 'B']) {
        const site = MAP.sites[key];
        if (Math.abs(p.x - site.x) < site.half && Math.abs(p.z - site.z) < site.half) {
          rounds.state.plantProgress += dt;
          hud.setAction('Planting spike…', rounds.state.plantProgress / MAP.plantTime);
          if (rounds.state.plantProgress >= MAP.plantTime) {
            rounds.plantSpike(player, key);
            rounds.state.plantProgress = 0;
            hud.setAction(null, 0);
          }
          return;
        }
      }
    } else {
      const d = Math.hypot(p.x - spike.x, p.z - spike.z);
      if (d < 1.8) {
        rounds.state.defuseProgress += dt;
        hud.setAction('Defusing spike…', rounds.state.defuseProgress / MAP.defuseTime);
        if (Math.floor(rounds.state.defuseProgress * 2) !== Math.floor((rounds.state.defuseProgress - dt) * 2)) audio.defuseBeep();
        if (rounds.state.defuseProgress >= MAP.defuseTime) {
          rounds.defuseSpike(player);
          rounds.state.defuseProgress = 0;
          hud.setAction(null, 0);
        }
        return;
      }
    }
  }
  rounds.state.plantProgress = 0;
  rounds.state.defuseProgress = 0;
  hud.setAction(null, 0);
}

let started = false;
let cleared = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.phase === 'matchEnd') {
    // Fresh match.
    rounds.state.round = 1;
    rounds.state.score = { atk: 0, def: 0 };
    rounds.state.matchWinner = null;
    rounds.state.money = 800;
    rounds.startRound();
    input.requestLock();
    return;
  }
  if (rounds.state.phase === 'roundEnd') return;
  input.requestLock();
});

hud.onBuy((itemId) => {
  const result = rounds.buy(itemId);
  if (!result.ok) {
    audio.deny();
    hud.toast(result.why);
  } else {
    viewModel.setWeapon(playerLoadout.current);
    hud.setWeapon(playerLoadout.def().name);
  }
});

function step(dt) {
  game.time += dt;
  elapsed += dt;
  const phase = rounds.state.phase;
  game.phase = phase;

  // Player movement and actions, only while alive and the round is running.
  if (player.alive && (phase === 'buy' || phase === 'live')) {
    const look = input.takeLook();
    playerMover.look(look.x, look.y);
    playerMover.step(dt, input.state.keys);
    if (phase === 'live') {
      if (input.state.firing && playerLoadout.ready()) playerShoot();
      if (input.consume('KeyR') && playerLoadout.reload()) audio.reload();
      if (input.consume('KeyG') && playerLoadout.grenades > 0) {
        if (combat.throwFlash(player)) hud.toast('Flashbang out');
      }
      if (input.consume('Digit1')) playerLoadout.switchTo('sidearm');
      if (input.consume('Digit2')) playerLoadout.switchTo('smg');
      if (input.consume('Digit3')) playerLoadout.switchTo('rifle');
      if (input.consume('Digit4')) playerLoadout.switchTo('marksman');
      if (input.consume('KeyM')) {
        const muted = audio.toggleMute();
        hud.toast(muted ? 'Sound muted' : 'Sound on');
      }
      tryPlayerAction(dt);
    }
  }
  playerLoadout.step(dt);
  viewModel.step(playerLoadout, dt);
  if (playerLoadout.current !== viewModelCurrent) {
    viewModel.setWeapon(playerLoadout.current);
    viewModelCurrent = playerLoadout.current;
    hud.setWeapon(playerLoadout.def().name);
  }

  // Zoom: the marksman scope narrows the field of view while held.
  const zoomTarget = input.state.zooming && playerLoadout.def().zoom > 1 ? 74 / playerLoadout.def().zoom : 74;
  camera.fov += (zoomTarget - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();

  // Buy menu: B toggles it during the buy phase; number keys buy directly.
  if (input.consume('KeyB') && phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) refreshBuy();
    else hud.hideBuy();
  }
  if (phase === 'buy' && buyOpen) {
    for (const item of BUY_ITEMS) {
      if (input.consume(`Digit${item.key}`)) {
        const result = rounds.buy(item.id);
        if (!result.ok) {
          audio.deny();
          hud.toast(result.why);
        } else {
          viewModel.setWeapon(playerLoadout.current);
          hud.setWeapon(playerLoadout.def().name);
        }
      }
    }
  }

  bots.step(dt, game);
  combat.step(dt);
  rounds.step(dt);
  game.phase = rounds.state.phase;
  effects.step(dt);
  effects.showSpike(rounds.state.spike.x, rounds.state.spike.z, rounds.state.spike.planted);
  effects.pulseSpike(elapsed);

  // HUD: every setter caches, so pushing each frame is free.
  const w = playerLoadout.owned[playerLoadout.current];
  hud.setAmmo(w.mag, w.reserve);
  hud.setHealth(player.health);
  hud.setArmor(player.armor);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.state.timeLeft, rounds.state.phase);
  hud.setScore(rounds.state.score.atk, rounds.state.score.def);
  hud.setAlive(rounds.living('atk'), rounds.living('def'));
  hud.setWeapon(playerLoadout.def().name);
  hud.setCrosshair(6 + playerLoadout.spread(playerMover.groundSpeed()) * 900);
  hud.setFlash(player.flashTime > 0 ? Math.min(1, player.flashTime) : 0);
  if (rounds.state.spike.planted) hud.setSpike('planted', rounds.state.spike.fuseLeft);
  else if (rounds.state.phase === 'live') hud.setSpike('carry');
  else hud.setSpike('none');
  hud.drawMinimap(actors, rounds.state.spike, MAP.sites);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  rounds.startRound();
  // One step first: bot meshes are built lazily on the first step, and the
  // shot setups below move bot groups around.
  settle(1);
  if (name === 'start') {
    // Buy phase at the attacker spawn, buy menu open, looking up Mid.
    playerMover.teleport(MAP.attackerSpawn.x, MAP.attackerSpawn.z, 0);
    settle(10);
    refreshBuy();
    buyOpen = true;
    hud.setMoney(rounds.state.money);
  } else if (name === 'play') {
    // Mid-round firefight: player in Mid's east gap, one Vulture in the sights
    // through the blockhouse door.
    rounds.state.phase = 'live';
    rounds.state.timeLeft = 47;
    rounds.state.score.atk = 1;
    rounds.state.money = 3200;
    player.health = 78;
    playerMover.teleport(3.4, 8, 0);
    const foe = bots.bots.find((b) => b.team === 'def');
    foe.mover.teleport(0, -8, Math.PI);
    foe.group.position.copy(foe.mover.state.position);
    foe.group.rotation.y = Math.PI;
    settle(15);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    playerShoot();
    settle(6);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.setAmmo(playerLoadout.owned.rifle.mag, playerLoadout.owned.rifle.reserve);
  } else if (name === 'site') {
    // Spike planted at A: the player and a teammate hold the site.
    rounds.state.phase = 'live';
    rounds.state.timeLeft = 32;
    rounds.state.score.atk = 2;
    rounds.state.score.def = 1;
    rounds.plantSpike(bots.bots.find((b) => b.team === 'atk'), 'A');
    rounds.state.spike.fuseLeft = 24;
    playerMover.teleport(-13, -5, 0.7);
    const mate = bots.bots.find((b) => b.team === 'atk');
    mate.mover.teleport(-17, -9, 0.4);
    mate.group.position.copy(mate.mover.state.position);
    const foe = bots.bots.find((b) => b.team === 'def');
    foe.mover.teleport(-10, -11, -2.2);
    foe.group.position.copy(foe.mover.state.position);
    settle(20);
    aimAt(new THREE.Vector3(-20, 1.2, -13));
    hud.setSpike('planted', 24);
  } else {
    // Round won: the end overlay over the yard.
    rounds.state.phase = 'live';
    rounds.state.score.atk = 3;
    rounds.state.score.def = 2;
    playerMover.teleport(0, 10, 0);
    settle(10);
    rounds.endRound('atk', 'Spike detonated');
    hud.showOverlay('roundEnd', { win: true, reason: 'Spike detonated', score: { atk: 3, def: 2 } });
  }
  syncCamera();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Test handle: state for assertions, and direct look/fire for a headless
// smoke test that cannot take pointer lock.
window.__game = {
  state: rounds.state,
  player,
  bots: bots.bots,
  combat,
  rounds,
  camera,
  viewModel,
  debugLook(dx, dy) {
    playerMover.look(dx, dy);
    syncCamera();
  },
  debugFire() {
    if (playerLoadout.ready()) playerShoot();
  },
  debugKeys(codes, down) {
    for (const code of codes) {
      if (down) input.state.keys.add(code);
      else input.state.keys.delete(code);
    }
  },
  // Advance the fixed-step simulation synchronously, without waiting for
  // the render loop: headless SwiftShader renders ~0.5 fps on this VM, so
  // a real-time test would take minutes to play one second of game.
  debugStep(count = 1) {
    for (let i = 0; i < count; i += 1) step(FIXED_STEP);
    syncCamera();
  },
};

syncCamera();
rounds.startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
