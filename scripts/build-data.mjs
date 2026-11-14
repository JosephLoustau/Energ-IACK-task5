// Builds the app data from the Python pipeline (pipeline/stock.py, cached API responses in data/cache/) before the app starts:
// public/data/ville_geneve_3d.geojson (map volumes) and src/buildings.generated.json (buildings, via build-buildings.mjs).
// Uses the project's .venv Python when present (macOS/Linux or Windows layout).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { OUTPUT, writeBuildings } from './build-buildings.mjs';

const candidates = [
  '.venv/bin/python',
  '.venv/Scripts/python.exe',
  process.platform === 'win32' ? 'python' : 'python3',
];
const python = candidates.find((p) => !p.includes('/') || existsSync(p));
const run = spawnSync(python, ['pipeline/stock.py', '--out', 'public/data', '--quiet', '--core-stdout'],
  { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

if (run.status === 0) {
  writeBuildings(JSON.parse(run.stdout));
} else {
  console.warn(`[data] build failed (${python}).` + (existsSync(OUTPUT) ? ' Using existing data files.' : ' No data files available.'));
  if (!existsSync(OUTPUT)) await import('./check-data.mjs');
}
