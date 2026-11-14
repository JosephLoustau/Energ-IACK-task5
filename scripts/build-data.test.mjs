import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT, writeBuildings } from './build-buildings.mjs';
import { checkData } from './check-data.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const geometry = { type: 'Polygon', coordinates: [[[6.1, 46.2], [6.2, 46.2], [6.2, 46.3], [6.1, 46.2]]] };
const core = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry, properties: {
    egid: 1, address: 'Genève, École test', usage: 'Education', heating: 'Chaudière (gaz)',
    construction_year: 2000, idc: 450, sre: 1000, height: 12.3,
  } }],
};
const volumes = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry, properties: { egid: 1, height: 12.3 } }],
};
let temp;

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'decathlon-data-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(temp, { recursive: true, force: true });
});

function exportData() {
  const directory = join(temp, 'public', 'data');
  writeBuildings(core, join(directory, 'buildings.generated.json'));
  writeFileSync(join(directory, 'ville_geneve_3d.geojson'), JSON.stringify(volumes));
  return directory;
}

function preparePipeline(source) {
  for (const name of ['build-data.mjs', 'build-buildings.mjs', 'check-data.mjs']) {
    mkdirSync(join(temp, 'scripts'), { recursive: true });
    copyFileSync(join(root, 'scripts', name), join(temp, 'scripts', name));
  }
  mkdirSync(join(temp, 'src'));
  copyFileSync(join(root, 'src', 'carriers.json'), join(temp, 'src', 'carriers.json'));
  mkdirSync(join(temp, 'pipeline'));
  writeFileSync(join(temp, 'pipeline', 'stock.py'), source, 'utf8');
}

describe('local API data preparation', () => {
  it('writes only to the public data folder, creating directories when needed', () => {
    expect(OUTPUT).toBe(join(root, 'public', 'data', 'buildings.generated.json'));
    const directory = exportData();
    const data = JSON.parse(readFileSync(join(directory, 'buildings.generated.json'), 'utf8'));
    expect(data).toMatchObject([{ id: '1', name: 'École test', idc: 450, area: 1000, height: 12.3 }]);
    expect(existsSync(join(temp, 'src', 'buildings.generated.json'))).toBe(false);
    expect(() => checkData(directory)).not.toThrow();
  });

  it.each([null, {}, { type: 'FeatureCollection', features: [] }])('refuses missing/empty API collections %j', (data) => {
    const output = join(temp, 'public', 'data', 'buildings.generated.json');
    expect(() => writeBuildings(data, output)).toThrow('FeatureCollection non vide');
    expect(existsSync(output)).toBe(false);
  });

  it('blocks a fresh checkout until data preparation has succeeded', () => {
    const directory = join(temp, 'public', 'data');
    expect(() => checkData(directory)).toThrow('npm run data');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'buildings.generated.json'), JSON.stringify([{ id: '1' }]));
    expect(() => checkData(directory)).toThrow('Données invalides');
    writeBuildings(core, join(directory, 'buildings.generated.json'));
    expect(() => checkData(directory)).toThrow('ville_geneve_3d.geojson');
    writeFileSync(join(directory, 'ville_geneve_3d.geojson'), '{');
    expect(() => checkData(directory)).toThrow('illisibles');
  });

  it('does not accept an empty or malformed 3D collection', () => {
    const directory = exportData();
    writeFileSync(join(directory, 'ville_geneve_3d.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [] }));
    expect(() => checkData(directory)).toThrow('Données invalides');
  });

  it('forwards --refresh and builds from successful Python output in UTF-8', () => {
    preparePipeline(`import json, pathlib, sys
assert '--refresh' in sys.argv
out = pathlib.Path('public/data')
out.mkdir(parents=True, exist_ok=True)
(out / 'ville_geneve_3d.geojson').write_text(${JSON.stringify(JSON.stringify(volumes))}, encoding='utf-8')
print(${JSON.stringify(JSON.stringify(core))})
`);
    writeFileSync(join(temp, 'src', 'buildings.generated.json'), '[]');
    const run = spawnSync(process.execPath, [join(temp, 'scripts', 'build-data.mjs'), '--refresh'], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(() => checkData(join(temp, 'public', 'data'))).not.toThrow();
    expect(existsSync(join(temp, 'src', 'buildings.generated.json'))).toBe(false);
  });

  it('fails on Python errors instead of claiming success with existing files', () => {
    preparePipeline('import sys\nsys.exit(2)\n');
    exportData();
    const run = spawnSync(process.execPath, [join(temp, 'scripts', 'build-data.mjs')], { encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Échec du pipeline Python');
    expect(run.stderr).not.toContain('Using existing');
  });

  it('has no API datasets tracked by Git', () => {
    const tracked = execFileSync('git', ['ls-files', '--', '*.geojson', '*buildings.generated.json', 'data', 'public\\data'], {
      cwd: root, encoding: 'utf8',
    });
    expect(tracked.trim()).toBe('');
    expect(dirname(OUTPUT)).toBe(join(root, 'public', 'data'));
  });
});
