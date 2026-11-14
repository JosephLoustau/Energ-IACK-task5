import { withConditionModel } from './model';
import type { Building, BuildingUse, Heating } from './model';

type BuildingData = Omit<Building, 'condition' | 'annualDecay'>;
const buildingUses: BuildingUse[] = [
  'École', 'Musée', 'Administration', 'Sport', 'Logement', 'Éducation',
  'Logement mixte', 'Commerce & ateliers', 'Culture & loisirs', 'Santé & social',
];
const heatingTypes: Heating[] = ['Gaz', 'Mazout', 'CAD', 'Pompe à chaleur', 'Gaz + mazout', 'Bois / biogaz', 'Électrique', 'Inconnu'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isBuildingData(value: unknown): value is BuildingData {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && typeof value.district === 'string'
    && buildingUses.some((use) => use === value.use) && heatingTypes.some((heating) => heating === value.heating)
    && Array.isArray(value.coordinates) && value.coordinates.length === 2
    && isFiniteNumber(value.coordinates[0]) && isFiniteNumber(value.coordinates[1])
    && Math.abs(value.coordinates[0]) <= 90 && Math.abs(value.coordinates[1]) <= 180
    && isFiniteNumber(value.area) && value.area > 0
    && isFiniteNumber(value.constructionYear) && value.constructionYear > 0
    && isFiniteNumber(value.idc) && value.idc >= 0
    && isFiniteNumber(value.carbonIntensity) && value.carbonIntensity >= 0
    && ['lastWorkYear', 'height', 'rentResidential', 'solarShare'].every((key) =>
      value[key] === undefined || value[key] === null || isFiniteNumber(value[key]))
    && ['destination', 'protection', 'idcStatus', 'idcSource'].every((key) =>
      value[key] === undefined || typeof value[key] === 'string')
    && ['fossil', 'cadAvailable'].every((key) => value[key] === undefined || typeof value[key] === 'boolean')
    && (value.imputed === undefined || (Array.isArray(value.imputed) && value.imputed.every((key) => typeof key === 'string')));
}

export function parseBuildings(data: unknown): Building[] {
  if (!Array.isArray(data) || data.length === 0) throw new Error('Le jeu de données bâtiments doit être une liste non vide.');
  const ids = new Set<string>();
  return data.map((value: unknown, index: number) => {
    if (!isBuildingData(value)) throw new Error(`Données du bâtiment ${index + 1} invalides. Relancez npm run data.`);
    if (ids.has(value.id)) throw new Error(`Identifiant bâtiment en double : ${value.id}. Relancez npm run data.`);
    ids.add(value.id);
    return withConditionModel(value);
  });
}

/** Données préparées localement, servies comme fichier statique sans être intégrées au bundle JavaScript. */
export async function loadBuildings(signal?: AbortSignal): Promise<Building[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/buildings.generated.json`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Données bâtiments indisponibles (HTTP ${response.status}). Relancez npm run data.`);
  return parseBuildings(await response.json());
}
