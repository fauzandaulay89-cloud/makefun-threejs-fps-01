// hud.js — The DOM HUD: health, armour, ammo, money, score, timer, spike,
// crosshair, kill feed, buy menu and overlays. Reads the match state and
// writes the DOM only when a value actually changed.

import { WEAPONS, BUY_ITEMS, ARMOR, FLASHBANG } from './weapons.js';
import { BUY_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';

const TEAM_NAMES = ['EMBER', 'VIGIL'];

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(doc, callbacks = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthNum: $('health-num'),
    healthBar: $('health-bar'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    money: $('money'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    roundNum: $('round-num'),
    timer: $('timer'),
    spike: $('spike-status'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerMain: $('banner-main'),
    bannerSub: $('banner-sub'),
    buymenu: $('buymenu'),
    buyMoney: $('buy-money'),
    overlayStart: $('overlay-start'),
    overlayEnd: $('overlay-end'),
    endTitle: $('end-title'),
    endScore: $('end-score'),
    vignette: $('vignette'),
    flashOverlay: $('flash-overlay'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    defuseBar: $('defuse-bar'),
    defuseFill: $('defuse-fill'),
    defuseLabel: $('defuse-label'),
    weaponName: $('weapon-name'),
    hint: $('hint'),
  };

  const last = {};
  let lastEventIdx = 0;
  let lastHp = 100;
  let bannerTimer = null;
  let hitTimer = null;

  function setText(node, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      node.textContent = value;
    }
  }

  function buildBuyMenu() {
    const list = $('buy-list');
    if (!list) return;
    list.innerHTML = '';
    for (const item of BUY_ITEMS) {
      let data;
      if (item.kind === 'weapon') data = WEAPONS[item.id];
      else if (item.kind === 'armor') data = ARMOR;
      else data = FLASHBANG;
      const div = doc.createElement('div');
      div.className = 'buy-item';
      div.dataset.kind = item.kind;
      div.dataset.id = item.id;
      const extra = item.kind === 'weapon'
        ? `<span class="buy-stat">DMG ${data.damage} · MAG ${data.mag}</span>`
        : item.kind === 'armor'
          ? `<span class="buy-stat">+${data.armor} ARMOUR</span>`
          : `<span class="buy-stat">BLINDS ENEMIES</span>`;
      div.innerHTML = `<span class="buy-name">${data.name}</span>${extra}<span class="buy-price">$${data.price}</span>`;
      div.addEventListener('click', () => {
        if (callbacks.onBuy) callbacks.onBuy(item.kind, item.id);
      });
      list.appendChild(div);
    }
  }
  buildBuyMenu();

  const startBtn = $('start-btn');
  if (startBtn) startBtn.addEventListener('click', () => callbacks.onStart && callbacks.onStart());
  const againBtn = $('again-btn');
  if (againBtn) againBtn.addEventListener('click', () => callbacks.onRestart && callbacks.onRestart());

  function showHitmarker(headshot, kill) {
    el.hitmarker.classList.remove('show', 'kill', 'head');
    void el.hitmarker.offsetWidth; // restart the CSS animation
    el.hitmarker.classList.add('show');
    if (kill) el.hitmarker.classList.add('kill');
    else if (headshot) el.hitmarker.classList.add('head');
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('show'), 160);
  }

  function banner(main, sub = '', ms = 2600) {
    el.bannerMain.textContent = main;
    el.bannerSub.textContent = sub;
    el.banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
  }

  function pushKillFeed(events, names) {
    for (let i = lastEventIdx; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'kill') continue;
      const killer = names[ev.killerId] || `P${ev.killerId}`;
      const victim = names[ev.victimId] || `P${ev.victimId}`;
      const w = WEAPONS[ev.weapon]?.short || ev.weapon;
      const row = doc.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="feed-killer">${killer}</span> <span class="feed-weapon">[${w}${ev.headshot ? ' ☠' : ''}]</span> <span class="feed-victim">${victim}</span>`;
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    }
    lastEventIdx = events.length;
  }

  function update(state, player, spread, names) {
    if (!player) return;
    // Kill feed reads agent names from the names array (by agent id).
    pushKillFeed(state.events, names || []);

    setText(el.healthNum, 'hp', String(Math.max(0, Math.ceil(player.hp))));
    const hpPct = Math.max(0, player.hp);
    if (last.hpPct !== hpPct) {
      last.hpPct = hpPct;
      el.healthBar.style.width = `${hpPct}%`;
      el.healthBar.style.background = hpPct > 50 ? '#7ee081' : hpPct > 25 ? '#e8c15a' : '#ff6b5e';
    }
    setText(el.armorNum, 'armor', String(Math.floor(player.armor)));
    const weapon = WEAPONS[player.weapon];
    setText(el.ammoMag, 'mag', player.reloading ? '--' : String(player.ammo));
    setText(el.ammoReserve, 'res', String(player.reserve));
    setText(el.weaponName, 'wname', weapon.name.toUpperCase());
    setText(el.money, 'money', `$${player.money}`);
    setText(el.scoreAtk, 'sA', String(state.score[0]));
    setText(el.scoreDef, 'sD', String(state.score[1]));
    setText(el.roundNum, 'round', `ROUND ${state.round}`);

    // Timer and spike status.
    let timerText = '';
    let timerClass = '';
    if (state.phase === 'buy') {
      timerText = `BUY ${fmtTime(BUY_SECONDS - state.phaseT)}`;
    } else if (state.phase === 'live') {
      if (state.spike.state === 'planted') {
        timerText = `SPIKE ${fmtTime(state.spike.fuseT)}`;
        timerClass = 'danger';
      } else {
        timerText = fmtTime(state.roundTime);
      }
    } else if (state.phase === 'roundEnd') {
      timerText = state.roundWinner === 0 ? 'EMBER TAKES THE ROUND' : 'VIGIL TAKES THE ROUND';
    } else {
      timerText = 'MATCH OVER';
    }
    setText(el.timer, 'timer', timerText);
    if (last.timerClass !== timerClass) {
      last.timerClass = timerClass;
      el.timer.className = timerClass;
    }
    let spikeText = '';
    if (state.spike.state === 'carried') {
      const carrier = state.agents.find((a) => a.id === state.spike.carrierId);
      spikeText = carrier ? `SPIKE · ${carrier.name}` : 'SPIKE · —';
    } else if (state.spike.state === 'planted') {
      spikeText = `SPIKE PLANTED · SITE ${state.spike.site}`;
    } else if (state.spike.state === 'dropped') {
      spikeText = 'SPIKE DROPPED';
    } else if (state.spike.state === 'defused') {
      spikeText = 'SPIKE DEFUSED';
    }
    setText(el.spike, 'spike', spikeText);

    // Crosshair gap grows with spread; the dot stays centred.
    const gap = 4 + Math.min(26, spread * 260);
    if (last.gap !== gap) {
      last.gap = gap;
      el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    }

    // Damage vignette when health drops.
    if (player.hp < lastHp) {
      el.vignette.style.opacity = String(Math.min(0.85, 0.25 + (lastHp - player.hp) / 120));
      setTimeout(() => { el.vignette.style.opacity = '0'; }, 260);
    }
    lastHp = player.hp;

    // Flashbang white-out.
    const flashOp = Math.min(1, Math.max(0, player.flash / 2.2));
    if (last.flashOp !== flashOp) {
      last.flashOp = flashOp;
      el.flashOverlay.style.opacity = flashOp.toFixed(2);
    }

    // Plant / defuse progress.
    if (player.planting) {
      el.plantBar.style.display = 'block';
      el.plantLabel.style.display = 'block';
      el.plantFill.style.width = `${(player.plantProg / PLANT_SECONDS) * 100}%`;
    } else {
      el.plantBar.style.display = 'none';
      el.plantLabel.style.display = 'none';
    }
    if (player.defusing) {
      el.defuseBar.style.display = 'block';
      el.defuseLabel.style.display = 'block';
      el.defuseFill.style.width = `${(player.defuseProg / DEFUSE_SECONDS) * 100}%`;
    } else {
      el.defuseBar.style.display = 'none';
      el.defuseLabel.style.display = 'none';
    }

    // Buy menu: money and affordability, only during the buy phase.
    const showBuy = state.phase === 'buy' && callbacks.buyOpen;
    el.buymenu.classList.toggle('visible', !!showBuy);
    if (showBuy) {
      setText(el.buyMoney, 'bmoney', `$${player.money}`);
      const items = el.buymenu.querySelectorAll('.buy-item');
      items.forEach((item) => {
        const kind = item.dataset.kind;
        const id = item.dataset.id;
        const price = kind === 'weapon' ? WEAPONS[id].price : kind === 'armor' ? ARMOR.price : FLASHBANG.price;
        const owned = kind === 'weapon' ? player.owned[id] : false;
        const afford = player.money >= price;
        item.classList.toggle('owned', !!owned);
        item.classList.toggle('cant', !afford && !owned);
      });
    }

    // Hint line: contextual controls.
    let hint = '';
    if (state.phase === 'buy') hint = 'B — BUY MENU · CLICK A WEAPON TO BUY';
    else if (player.alive && state.spike.carrierId === player.id && player.isPlayer) {
      const site = state.spike.state === 'carried' ? 'IN A SITE, HOLD E TO PLANT' : '';
      hint = `YOU CARRY THE SPIKE · ${site}`;
    } else if (player.alive && state.spike.state === 'carried' && state.spike.carrierId !== null) {
      const carrier = state.agents.find((a) => a.id === state.spike.carrierId);
      hint = carrier ? `${carrier.name.toUpperCase()} CARRIES THE SPIKE` : '';
    } else if (state.spike.state === 'planted' && player.team === 1) {
      hint = 'SPIKE PLANTED · HOLD E AT THE SPIKE TO DEFUSE';
    } else if (!player.alive) {
      hint = 'YOU ARE DOWN · WATCHING YOUR TEAM';
    }
    setText(el.hint, 'hint', hint);
  }

  return {
    update,
    showHitmarker,
    banner,
    showStart() {
      el.overlayStart.classList.remove('hidden');
      el.overlayEnd.classList.add('hidden');
    },
    showEnd(winner, score) {
      el.overlayEnd.classList.remove('hidden');
      el.overlayStart.classList.add('hidden');
      el.endTitle.textContent = winner === 0 ? 'EMBER WINS THE MATCH' : 'VIGIL WINS THE MATCH';
      el.endScore.textContent = `${TEAM_NAMES[0]} ${score[0]} — ${score[1]} ${TEAM_NAMES[1]}`;
    },
    hideOverlays() {
      el.overlayStart.classList.add('hidden');
      el.overlayEnd.classList.add('hidden');
    },
    setBuyOpen(open) {
      callbacks.buyOpen = open;
    },
    resetFeed() {
      lastEventIdx = 0;
      el.killfeed.innerHTML = '';
    },
  };
}
