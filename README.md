# DUSK YARD — Tactical FPS

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![make.fun · rank](https://make.fun/badge/fauzandaulay89-cloud/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![make.fun · reward](https://make.fun/badge/fauzandaulay89-cloud/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A round-based tactical FPS in the Counter-Strike style, built on three.js —
an original map, original teams, original everything. Five attackers
(**Ember**) against five defenders (**Vigil**) on **Dusk Yard**, a 52×40 m
yard with three lanes and two bomb sites. First team to 5 rounds takes the
match.

- **Rounds & economy:** 12 s buy phase, 100 s rounds, kill rewards, round
  win/loss bonuses, and a buy menu (SMG, rifle, marksman rifle, kevlar,
  flashbang).
- **The spike:** attackers carry it, plant it at A or B (3.5 s channel),
  defenders defuse (5 s) or run the clock out. Rounds also end on
  elimination or detonation after a 45 s fuse.
- **Bots:** waypoint routes down the lanes, site holds, line-of-sight
  reactions, hearing (gunfire draws them in), and rotates to a planted
  spike — on both teams.
- **Gunplay:** hitscan with headshots, recoil bloom and spread that punish
  firing on the move, acceleration-based movement, crouch and jump, and
  wall/cover collision.
- **Look & sound:** dusk palette, procedural asphalt and site paint, a
  low sun with shadows, and fully procedural WebAudio (no audio assets).

## Play it

```sh
node serve.ts
# open http://localhost:8080/ — click PLAY, then click the game to lock the mouse
```

Controls: **WASD** move · **mouse** aim · **click** fire · **R** reload ·
**Shift** walk · **Ctrl/C** crouch · **Space** jump · **1–4** weapons ·
**F** flashbang · **B** buy menu · **E** plant / defuse.

## Build the dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/dossier.json (and copies game/ + screenshots/ into out/)
```

`main.ts` also runs a full deterministic headless match (seeded RNG) and
prints its summary hash — two runs must print the same hash.

## Layout

- `game/index.html` — the page, import map, HUD
- `game/src/sim.js` — deterministic fixed-step match simulation (no DOM)
- `game/src/bots.js` — bot AI: routes, holds, reactions, hearing, rotates
- `game/src/combat.js` — hitscan, spread/recoil, damage, headshots, armour
- `game/src/map.js` — Dusk Yard: solids, sites, spawns, waypoint graph
- `game/src/rounds.js` — round flow and economy
- `game/src/render.js` — three.js scene and per-frame sync
- `game/src/hud.js`, `input.js`, `audio.js`, `effects.js`, `player.js`
- `game/src/weapons.js`, `rng.js`, `palette.js`

Built for [make.fun](https://make.fun/?ref=fxram5cz) — referral code `fxram5cz`.
