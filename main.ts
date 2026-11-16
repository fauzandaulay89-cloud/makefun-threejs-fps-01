// main.ts — The entrypoint for the Dusk Yard entry (Node 22, stdlib only).
// It runs a full deterministic headless match, copies game/ and screenshots/
// into the output directory, and writes /output/dossier.json with the kit's
// buildDossier. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { buildDossier } from './vendor/makefun-threejs.ts';
import { runHeadlessMatch } from './game/src/sim.js';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// 1. Headless match: the deterministic simulation runs a whole 5v5 game
//    with bot players and prints a summary that must be identical on
//    every run of this program with the same seed.
const summary = runHeadlessMatch(20261117);
console.log(
  `headless match: seed ${summary.seed}, ${summary.rounds} rounds, ` +
    `score ${summary.score[0]}-${summary.score[1]}, winner team ${summary.winner}, ` +
    `shots ${summary.stats.shots}, hits ${summary.stats.hits}, ` +
    `plants ${summary.stats.plants}, defuses ${summary.stats.defuses}, hash ${summary.hash}`,
);

// 2. Copy the playable game and its screenshots to the output directory.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// 3. Build the dossier from the copied files and write it out.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier written: ${dossier.length} bytes`);
