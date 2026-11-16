// Keyboard and mouse, plus the pointer lock that turns the mouse into
// look. Plain browser APIs only. The game asks the canvas for pointer lock
// and reads movementX/Y while it holds it. Buy (KeyB), grenade (KeyG),
// plant/defuse (KeyE) and zoom (right mouse) are keys like any other:
// main.js reads them from state.keys, so a headless test can drive the
// game by dispatching keyboard events and never needs a real mouse.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    locked: false,
    firing: false,
    zooming: false,
    lookX: 0,
    lookY: 0,
    // Edge-triggered presses: main.js consumes each one once per frame.
    pressed: new Set(),
  };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) state.pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.zooming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.zooming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.zooming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.zooming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Consume one edge-triggered press; true only on the frame it lands.
    consume(code) {
      if (!state.pressed.has(code)) return false;
      state.pressed.delete(code);
      return true;
    },
    clearPressed() {
      state.pressed.clear();
    },
  };
}
