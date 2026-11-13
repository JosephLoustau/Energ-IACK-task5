import type { Building, BuildingUse, Heating } from './model';

const districts = [
  { name: 'Servette', coordinates: [46.218, 6.125] },
  { name: 'Pâquis', coordinates: [46.216, 6.147] },
  { name: 'Eaux-Vives', coordinates: [46.201, 6.171] },
  { name: 'Plainpalais', coordinates: [46.190, 6.139] },
  { name: 'Jonction', coordinates: [46.199, 6.122] },
  { name: 'Champel', coordinates: [46.188, 6.157] },
  { name: 'Saint-Jean', coordinates: [46.208, 6.116] },
  { name: 'Petit-Saconnex', coordinates: [46.230, 6.123] },
] as const;

const uses: BuildingUse[] = ['École', 'Musée', 'Administration', 'Sport', 'Logement'];
const heatingSystems: { name: Heating; factor: number }[] = [
  { name: 'Gaz', factor: 0.202 },
  { name: 'Mazout', factor: 0.267 },
  { name: 'CAD', factor: 0.07 },
  { name: 'Pompe à chaleur', factor: 0.025 },
];

function randomGenerator(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createDemoBuildings(): Building[] {
  const random = randomGenerator(2026);
  return Array.from({ length: 96 }, (_, index) => {
    const district = districts[index % districts.length]!;
    const use = uses[index % uses.length]!;
    const heating = heatingSystems[index % heatingSystems.length]!;
    const idc = Math.round(230 + random() * 650);
    return {
      id: `DEMO-${String(index + 1).padStart(3, '0')}`,
      name: `${use} démo ${String(index + 1).padStart(2, '0')}`,
      district: district.name,
      use,
      coordinates: [
        district.coordinates[0] + (random() - 0.5) * 0.009,
        district.coordinates[1] + (random() - 0.5) * 0.011,
      ],
      area: Math.round(650 + random() * 7200),
      constructionYear: Math.round(1890 + random() * 130),
      condition: Number((0.32 + random() * 0.65).toFixed(2)),
      annualDecay: Number((0.012 + random() * 0.018).toFixed(3)),
      idc,
      carbonIntensity: Number((idc / 3.6 * heating.factor).toFixed(1)),
      heating: heating.name,
    };
  });
}

export const BUILDINGS = createDemoBuildings();
export const BUILDING_USES = uses;
