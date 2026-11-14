// Builds the app data from the Python pipeline (pipeline/stock.py, cached API responses in data/cache/) before the app starts:
// public/data/ville_geneve_3d.geojson and public/data/buildings.generated.json.
// Uses the project's .venv Python when present (macOS/Linux or Windows layout).
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBuildings } from './build-buildings.mjs';
import { checkData } from './check-data.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--refresh')) throw new Error('Usage : npm run data -- [--refresh]');
const candidates = [
  join(root, '.venv', 'Scripts', 'python.exe'),
  join(root, '.venv', 'bin', 'python'),
  process.platform === 'win32' ? 'python' : 'python3',
];
const python = candidates.slice(0, -1).find((p) => existsSync(p)) ?? candidates.at(-1);
const run = spawnSync(python, ['pipeline/stock.py', '--out', join('public', 'data'), '--quiet', '--core-stdout', ...args], {
  cwd: root,
  env: { ...process.env, PYTHONUTF8: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

if (run.error || run.status !== 0) {
  const reason = run.error?.message ?? (run.signal ? `signal ${run.signal}` : `exit ${run.status}`);
  throw new Error(`[data] Échec du pipeline Python (${python} : ${reason}). Vérifiez les identifiants et les dépendances ; aucune donnée de secours n'est utilisée.`);
}
writeBuildings(JSON.parse(run.stdout));
checkData();
rmSync(join(root, 'src', 'buildings.generated.json'), { force: true });
