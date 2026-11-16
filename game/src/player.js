// player.js — The human player's intent: keyboard + mouse become the same
// intent object bots produce, so the simulation treats every agent alike.
// Pure logic (no DOM): the browser feeds it an input snapshot each tick.

const SENSITIVITY = 0.0022;
const MAX_PITCH = 1.5;

/**
 * Build the human intent for this tick from the input snapshot.
 * input: { keys:Set, mouseDX, mouseDY, mouseDown, jumpQueued,
 *          reloadQueued, flashQueued, switchTo }
 * Edge flags (jump/reload/flash/switchTo) are consumed here (cleared).
 * Returns { mx, mz, yaw, pitch, crouch, jump, fire, reload, plant,
 *           defuse, flash, switchTo }.
 */
export function playerIntent(input, agent, dt) {
  // Mouse look: accumulate deltas into absolute yaw/pitch.
  agent.yaw -= input.mouseDX * SENSITIVITY;
  agent.pitch -= input.mouseDY * SENSITIVITY;
  if (agent.pitch > MAX_PITCH) agent.pitch = MAX_PITCH;
  if (agent.pitch < -MAX_PITCH) agent.pitch = -MAX_PITCH;
  input.mouseDX = 0;
  input.mouseDY = 0;

  const keys = input.keys;
  let fwd = 0;
  let strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;

  // Wish direction in world space: forward is (-sin yaw, -cos yaw).
  const sin = Math.sin(agent.yaw);
  const cos = Math.cos(agent.yaw);
  const mx = -sin * fwd + cos * strafe;
  const mz = -cos * fwd - sin * strafe;

  const intent = {
    mx,
    mz,
    yaw: agent.yaw,
    pitch: agent.pitch,
    crouch: keys.has('ControlLeft') || keys.has('KeyC'),
    jump: false,
    fire: input.mouseDown,
    reload: false,
    plant: keys.has('KeyE'),
    defuse: keys.has('KeyE'),
    flash: false,
    switchTo: null,
    // Holding Shift walks slowly: steadier aim, quieter steps.
    speed: keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.55 : 1,
  };

  if (input.jumpQueued) {
    intent.jump = true;
    input.jumpQueued = false;
  }
  if (input.reloadQueued) {
    intent.reload = true;
    input.reloadQueued = false;
  }
  if (input.flashQueued) {
    intent.flash = true;
    input.flashQueued = false;
  }
  if (input.switchTo) {
    intent.switchTo = input.switchTo;
    input.switchTo = null;
  }
  return intent;
}

/** A fresh, empty input snapshot (the browser fills it from events). */
export function freshInput() {
  return {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    jumpQueued: false,
    reloadQueued: false,
    flashQueued: false,
    switchTo: null,
  };
}
