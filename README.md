# makefun-threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/fauzandaulay89-cloud/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/fauzandaulay89-cloud/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

EMBERLINE is a round-based tactical FPS in the Counter-Strike style, built on three.js: five Sentinels attack Dusk Yard against five Vultures. Plant the spike at Site A or Site B — or eliminate the other team — earn money each round, and spend it in the buy menu on rifles, an SMG, a marksman rifle, armour and flashbangs. Bots walk waypoint routes through three lanes, hold sites, react to what they see and hear, and rotate to a planted spike. Gunplay is hitscan with headshot multipliers, recoil and spread that punish firing on the move, acceleration-based movement with crouching and jumping, and collision with the map. First to 5 rounds takes the yard.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step and no network: the game is static files under `game/` with three.js 0.187.0 vendored, and it plays single-player against bots in desktop Chrome.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fxram5cz&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
