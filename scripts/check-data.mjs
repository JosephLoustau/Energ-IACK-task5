// Vérifie que les données générées localement existent avant dev/build.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIRECTORY = fileURLToPath(new URL('../public/data', import.meta.url));
const instructions = `
Elles ne sont pas versionnées et doivent être générées localement :
  1. cp .env.example .env   (renseigner API_KEY ; QBUILDINGS_* optionnel)
  2. python -m pip install -r pipeline/requirements.txt
  3. npm run data
Voir la section « Données » du README.`;

export function checkData(directory = DATA_DIRECTORY) {
  for (const name of ['buildings.generated.json', 'ville_geneve_3d.geojson']) {
    const file = join(directory, name);
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (cause) {
      throw new Error(`Données absentes ou illisibles : ${file}.${instructions}`, { cause });
    }
    const valid = name === 'buildings.generated.json'
      ? Array.isArray(data) && data.length > 0 && data.every((building) =>
        building && typeof building.id === 'string' && Array.isArray(building.coordinates)
        && building.coordinates.length === 2 && building.coordinates.every(Number.isFinite)
        && Number.isFinite(building.idc) && Number.isFinite(building.area))
      : data?.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length > 0
        && data.features.every((feature) => feature?.type === 'Feature' && feature.geometry
          && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type) && Number.isFinite(feature.properties?.height));
    if (!valid) throw new Error(`Données invalides : ${file}.${instructions}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkData();
