// input.js — Keyboard, mouse and pointer lock for the browser.
// Produces the same input snapshot player.js consumes. Edge-triggered
// actions (jump, reload, flash, weapon switch) are queued as flags and
// consumed by the simulation step.

import { freshInput } from './player.js';

const WEAPON_KEYS = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'marksman' };

/**
 * Attach input handling to a canvas.
 * opts: { onLockChange(locked), onBuyToggle(), onCycleWeapon(dir),
 *         onAnyGesture() } — callbacks the game wires up.
 * Returns { input, locked(), lock(), unlock() }.
 */
export function createInput(canvas, opts = {}) {
  const input = freshInput();
  let locked = false;

  function onKeyDown(e) {
    if (e.code === 'Space') {
      input.jumpQueued = true;
      e.preventDefault();
    }
    if (e.code === 'KeyR') input.reloadQueued = true;
    if (e.code === 'KeyF') input.flashQueued = true;
    if (WEAPON_KEYS[e.code]) input.switchTo = WEAPON_KEYS[e.code];
    if (e.code === 'KeyB' && opts.onBuyToggle) opts.onBuyToggle();
    if (e.code === 'Tab') e.preventDefault();
    input.keys.add(e.code);
  }

  function onKeyUp(e) {
    input.keys.delete(e.code);
  }

  function onMouseDown(e) {
    if (e.button === 0) input.mouseDown = true;
  }

  function onMouseUp(e) {
    if (e.button === 0) input.mouseDown = false;
  }

  function onMouseMove(e) {
    if (!locked) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  }

  function onWheel(e) {
    if (opts.onCycleWeapon) opts.onCycleWeapon(e.deltaY > 0 ? 1 : -1);
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) input.mouseDown = false;
    if (opts.onLockChange) opts.onLockChange(locked);
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    input,
    locked: () => locked,
    lock() {
      if (opts.onAnyGesture) opts.onAnyGesture();
      canvas.requestPointerLock();
    },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
