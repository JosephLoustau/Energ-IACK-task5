// Builds public/data/ from the Python pipeline (stock.py) before the app starts.
// Uses the project's .venv Python when present (macOS/Linux or Windows layout).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const candidates = [
  '.venv/bin/python',
  '.venv/Scripts/python.exe',
  process.platform === 'win32' ? 'python' : 'python3',
];
const python = candidates.find((p) => !p.includes('/') || existsSync(p));
const run = spawnSync(python, ['stock.py', '--out', 'public/data', '--quiet'], { stdio: 'inherit' });

if (run.status !== 0) {
  const hasData = existsSync('public/data/ville_geneve_core.geojson');
  console.warn(`[data] build failed (${python}).` + (hasData ? ' Using existing public/data/.' : ' No data files available.'));
  if (!hasData) process.exit(1);
}
