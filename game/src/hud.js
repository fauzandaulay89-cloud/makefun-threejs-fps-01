// The DOM HUD: crosshair, hit marker, health, armour, ammo, money, timer,
// round score, alive counts, kill feed, spike status, a top-down minimap and
// the buy menu and overlay panels. It never touches the simulation; main.js
// pushes numbers in and reads the buy clicks out. The minimap is one 2D
// canvas redrawn each frame from the actors the caller hands it.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A tactical round shooter in Dusk Yard. Plant the spike at A or B, or eliminate the Vultures. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  roundEnd: { title: '', copy: '', action: '' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyPanel = $('buy');
  const buyList = $('buy-list');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const scoreAtk = scoreValue.querySelector('.atk');
  const scoreDef = scoreValue.querySelector('.def');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const spikeBox = $('spike');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const flashEl = $('flash');
  const damageEl = $('damage');
  const toastEl = $('toast');
  const mapCanvas = $('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const weaponName = $('weapon-name');
  const actionBar = $('action-bar');
  const actionLabel = $('action-label');
  const actionFill = $('action-fill');

  let hitTimer = 0;
  let toastTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastHealth) return;
      lastHealth = v;
      healthValue.textContent = String(v);
      healthBar.style.width = `${v}%`;
      healthBar.classList.toggle('low', v <= 30);
    },
    setArmor(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastArmor) return;
      lastArmor = v;
      armorValue.textContent = String(v);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('buy', phase === 'buy');
    },
    setScore(atk, def) {
      const text = `${atk} — ${def}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreAtk.textContent = String(atk);
      scoreDef.textContent = String(def);
    },
    setAlive(atk, def) {
      const text = `${atk} v ${def}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveValue.textContent = text;
    },
    setWeapon(name) {
      weaponName.textContent = name;
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageEl.classList.remove('show');
      void damageEl.offsetWidth;
      damageEl.classList.add('show');
    },
    setFlash(opacity) {
      flashEl.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    },
    // Plant / defuse progress bar; label null hides it.
    setAction(label, progress) {
      if (!label) {
        actionBar.hidden = true;
        return;
      }
      actionBar.hidden = false;
      actionLabel.textContent = label;
      actionFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `${killer} ${headshot ? '⌖' : '✕'} ${victim}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    setSpike(mode, fuseLeft) {
      if (mode === 'planted') {
        spikeBox.hidden = false;
        spikeBox.textContent = `SPIKE PLANTED — ${formatTime(fuseLeft)}`;
        spikeBox.classList.add('planted');
      } else if (mode === 'carry') {
        spikeBox.hidden = false;
        spikeBox.textContent = 'SPIKE: your team carries it — plant at A or B (hold E)';
        spikeBox.classList.remove('planted');
      } else {
        spikeBox.hidden = true;
      }
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'roundEnd') {
        title.textContent = data.win ? 'Round won' : 'Round lost';
        copy.textContent = `${data.reason}. Score ${data.score.atk} — ${data.score.def}.`;
        play.textContent = 'Next round…';
        play.disabled = true;
      } else if (mode === 'matchEnd') {
        title.textContent = data.win ? 'Yard taken' : 'Yard lost';
        copy.textContent = `Final score ${data.score.atk} — ${data.score.def}. ${data.win ? 'The Sentinels own Dusk Yard.' : 'The Vultures hold Dusk Yard.'}`;
        play.textContent = 'Play again';
        play.disabled = false;
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
        play.disabled = false;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(items, money, owned) {
      buyPanel.hidden = false;
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.dataset.item = item.id;
        const afford = money >= item.price;
        const have = item.kind === 'weapon' ? owned.includes(item.id) : false;
        row.disabled = !afford || have;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">${have ? 'OWNED' : '$' + item.price.toLocaleString('en-US')}</span>`;
        buyList.appendChild(row);
      }
      const moneyEl = $('buy-money');
      if (moneyEl) moneyEl.textContent = `$${money.toLocaleString('en-US')}`;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) handler(row.dataset.item);
      });
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    drawMinimap(actors, spike, sites) {
      const W = mapCanvas.width;
      const H = mapCanvas.height;
      const toX = (x) => ((x + 26) / 52) * W;
      const toY = (z) => ((z + 20) / 40) * H;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(20, 22, 26, 0.82)';
      mapCtx.fillRect(0, 0, W, H);
      // Site zones.
      for (const key of Object.keys(sites)) {
        const s = sites[key];
        mapCtx.fillStyle = 'rgba(53, 196, 168, 0.25)';
        mapCtx.fillRect(toX(s.x - s.half), toY(s.z - s.half), (s.half * 2 / 52) * W, (s.half * 2 / 40) * H);
        mapCtx.fillStyle = '#35c4a8';
        mapCtx.font = 'bold 11px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(key, toX(s.x), toY(s.z) + 4);
      }
      // Spike.
      if (spike.planted) {
        mapCtx.fillStyle = '#e4572e';
        mapCtx.beginPath();
        mapCtx.arc(toX(spike.x), toY(spike.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Actors: attackers teal, defenders ember, the player white with a tick.
      for (const a of actors) {
        if (!a.alive) continue;
        const x = toX(a.mover.state.position.x);
        const y = toY(a.mover.state.position.z);
        mapCtx.fillStyle = a.isPlayer ? '#ffffff' : a.team === 'atk' ? '#35c4a8' : '#e4572e';
        mapCtx.beginPath();
        mapCtx.arc(x, y, a.isPlayer ? 4 : 3, 0, Math.PI * 2);
        mapCtx.fill();
        if (a.isPlayer) {
          const yaw = a.mover.state.yaw;
          mapCtx.strokeStyle = '#ffffff';
          mapCtx.beginPath();
          mapCtx.moveTo(x, y);
          mapCtx.lineTo(x - Math.sin(yaw) * 8, y - Math.cos(yaw) * 8);
          mapCtx.stroke();
        }
      }
    },
  };
}
