import { planRenovation } from './renovation';

export const BASE_YEAR = 2026;
export const MAX_HORIZON = 10;

export type BuildingUse = 'École' | 'Musée' | 'Administration' | 'Sport' | 'Logement'
  | 'Éducation' | 'Logement mixte' | 'Commerce & ateliers' | 'Culture & loisirs' | 'Santé & social';
export type Heating = 'Gaz' | 'Mazout' | 'CAD' | 'Pompe à chaleur'
  | 'Gaz + mazout' | 'Bois / biogaz' | 'Électrique' | 'Inconnu';
export type Criterion = 'idc' | 'condition' | 'carbon';
export type Cohort = 'now' | 'five' | 'ten' | 'safe';
export type StrategyId = 'conservative' | 'ambitious' | 'custom';

export interface Building {
  id: string;
  name: string;
  district: string;
  use: BuildingUse;
  coordinates: [number, number];
  area: number;
  constructionYear: number;
  /** Indice d'état en BASE_YEAR (0 = ruine, 1 = neuf). */
  condition: number;
  /** Perte d'état sur l'année suivant BASE_YEAR (pente courante de la courbe). */
  annualDecay: number;
  /** Âge depuis construction ou derniers travaux en BASE_YEAR ; si présent, l'état suit la courbe par morceaux (sinon décroissance linéaire). */
  effectiveAge?: number;
  /** Année des derniers travaux énergétiques connus (permis SITG), ou null. */
  lastWorkYear?: number | null;
  /** Hauteur du bâtiment (m, SITG), pour la carte 3D. */
  height?: number | null;
  /** Loyers résidentiels nets annuels (CHF/an, SITG/QuantHome), ou null si non renseignés. */
  rentResidential?: number | null;
  /** Part de toiture au-dessus de 1000 kWh/m²·an (OCEN), ou null. */
  solarShare?: number | null;
  idc: number;
  carbonIntensity: number;
  heating: Heating;
  /** Champs optionnels fournis par le jeu de données réel (SITG / QuantHome). */
  destination?: string;
  fossil?: boolean;
  protection?: string;
  idcStatus?: string;
  idcSource?: string;
  cadAvailable?: boolean;
  /** Valeurs complétées faute de donnée : 'idc' | 'carbon' | 'year'. */
  imputed?: string[];
}

export interface Thresholds {
  idc: number;
  condition: number;
  carbon: number;
}

export interface ThresholdChange {
  year: number;
  thresholds: Thresholds;
}

export interface Strategy {
  id: StrategyId;
  name: string;
  thresholds: Thresholds;
  changes: ThresholdChange[];
}

export interface Assessment {
  building: Building;
  cohort: Cohort;
  dueYear: number | null;
  triggers: Criterion[];
  dueCondition: number;
  dueThresholds: Thresholds;
}

export const PRESETS: Record<'conservative' | 'ambitious', Strategy> = {
  conservative: {
    id: 'conservative',
    name: 'Base légale',
    thresholds: { condition: 0.5, idc: 600, carbon: 20 },
    changes: [],
  },
  ambitious: {
    id: 'ambitious',
    name: 'Exemplaire',
    thresholds: { condition: 0.7, idc: 450, carbon: 6 },
    changes: [],
  },
};

export const COHORTS: Record<Cohort, { label: string; short: string; color: string; opacity: number }> = {
  now: { label: 'À traiter maintenant', short: 'Immédiat', color: '#d64a48', opacity: 1 },
  five: { label: 'À traiter d’ici 5 ans', short: 'Sous 5 ans', color: '#d4ad25', opacity: 1 },
  ten: { label: 'À traiter entre 5 et 10 ans', short: 'Sous 10 ans', color: '#329780', opacity: 1 },
  safe: { label: 'Aucun besoin identifié à 10 ans · surveillance au-delà', short: 'Au-delà de 10 ans', color: '#827f7c', opacity: 0.3 },
};

export const CRITERIA: Record<Criterion, string> = {
  idc: 'IDC hors seuil',
  condition: 'État insuffisant',
  carbon: 'CO₂ hors seuil',
};

function assertThresholds(thresholds: Thresholds) {
  if (!Number.isFinite(thresholds.idc) || thresholds.idc <= 0
    || !Number.isFinite(thresholds.carbon) || thresholds.carbon <= 0
    || !Number.isFinite(thresholds.condition) || thresholds.condition < 0 || thresholds.condition > 1) {
    throw new Error('Seuils invalides : IDC et CO₂ doivent être positifs, et l’indice d’état compris entre 0 et 1.');
  }
}

export function validateStrategy(strategy: Strategy) {
  assertThresholds(strategy.thresholds);
  const years = new Set<number>();
  for (const change of strategy.changes) {
    assertThresholds(change.thresholds);
    if (!Number.isInteger(change.year) || change.year <= BASE_YEAR || change.year > BASE_YEAR + MAX_HORIZON
      || years.has(change.year)) {
      throw new Error('Chaque changement doit avoir une année distincte, entre 2027 et 2036.');
    }
    years.add(change.year);
  }
}

export function thresholdsAt(strategy: Strategy, year: number): Thresholds {
  const latest = strategy.changes
    .filter((change) => change.year <= year)
    .sort((a, b) => b.year - a.year)[0];
  return latest?.thresholds ?? strategy.thresholds;
}

/**
 * Modèle d'état (indice Stratus non disponible), linéaire par morceaux selon l'âge depuis la
 * construction ou les derniers travaux énergétiques :
 *  - 1 pendant les `graceYears` premières années ;
 *  - puis −`rate` par an, jusqu'à 0,40 à `kneeAge` ans ;
 *  - au-delà, −`slowRate` par an (plancher 0).
 */
export const DEGRADATION = {
  graceYears: 10,
  rate: 0.01,
  kneeAge: 70,
  slowRate: 0.005,
};

export function conditionAtAge(age: number, p = DEGRADATION) {
  const a = Math.max(0, age);
  if (a <= p.graceYears) return 1;
  const kneeValue = 1 - p.rate * (p.kneeAge - p.graceYears);
  if (a <= p.kneeAge) return 1 - p.rate * (a - p.graceYears);
  return Math.max(0, kneeValue - p.slowRate * (a - p.kneeAge));
}

/** Âge depuis la dernière construction ou rénovation énergétique connue. */
export function effectiveAge(constructionYear: number, lastWorkYear: number | null | undefined) {
  return Math.max(0, BASE_YEAR - Math.max(constructionYear, lastWorkYear ?? -Infinity));
}

export function conditionAt(building: Building, year: number) {
  const elapsed = Math.max(0, year - BASE_YEAR);
  if (building.effectiveAge !== undefined) return conditionAtAge(building.effectiveAge + elapsed);
  return Math.max(0, building.condition - elapsed * building.annualDecay);
}

/** Complète un bâtiment avec son état modélisé (âge effectif, état en BASE_YEAR, pente annuelle). */
export function withConditionModel<T extends Omit<Building, 'condition' | 'annualDecay' | 'effectiveAge'>>(building: T): T & Pick<Building, 'condition' | 'annualDecay' | 'effectiveAge'> {
  const age = effectiveAge(building.constructionYear, building.lastWorkYear);
  const condition = conditionAtAge(age);
  return { ...building, effectiveAge: age, condition, annualDecay: condition - conditionAtAge(age + 1) };
}

export function triggeredCriteria(building: Building, thresholds: Thresholds, year: number): Criterion[] {
  const triggers: Criterion[] = [];
  if (building.idc > thresholds.idc) triggers.push('idc');
  if (conditionAt(building, year) < thresholds.condition) triggers.push('condition');
  if (building.carbonIntensity > thresholds.carbon) triggers.push('carbon');
  return triggers;
}

export function assessBuilding(building: Building, strategy: Strategy): Assessment {
  for (let offset = 0; offset <= MAX_HORIZON; offset++) {
    const year = BASE_YEAR + offset;
    const thresholds = thresholdsAt(strategy, year);
    const triggers = triggeredCriteria(building, thresholds, year);
    if (triggers.length > 0) {
      return {
        building,
        cohort: offset === 0 ? 'now' : offset <= 5 ? 'five' : 'ten',
        dueYear: year,
        triggers,
        dueCondition: conditionAt(building, year),
        dueThresholds: thresholds,
      };
    }
  }
  return {
    building, cohort: 'safe', dueYear: null, triggers: [],
    dueCondition: conditionAt(building, BASE_YEAR + MAX_HORIZON),
    dueThresholds: thresholdsAt(strategy, BASE_YEAR + MAX_HORIZON),
  };
}

export function renovationFor(building: Building, year: number) {
  const plan = planRenovation(building);
  const conditionBefore = conditionAt(building, year);
  return {
    plan,
    cost: plan.capex,
    idcAfter: plan.after.idc,
    carbonAfter: plan.after.carbon,
    conditionBefore,
    // Un bâtiment rénové repart à 1 (travaux < 10 ans).
    conditionAfter: 1,
    carbonSaved: (building.carbonIntensity - plan.after.carbon) * building.area / 1000,
  };
}

export function compareAssessments(a: Assessment, b: Assessment) {
  const yearDifference = (a.dueYear ?? Infinity) - (b.dueYear ?? Infinity);
  if (Number.isFinite(yearDifference) && yearDifference !== 0) return yearDifference;
  if (a.dueYear === null && b.dueYear !== null) return 1;
  if (b.dueYear === null && a.dueYear !== null) return -1;
  for (const criterion of ['idc', 'condition', 'carbon'] as const) {
    const difference = Number(b.triggers.includes(criterion)) - Number(a.triggers.includes(criterion));
    if (difference !== 0) return difference;
  }
  const carbonDifference = renovationFor(b.building, b.dueYear ?? BASE_YEAR).carbonSaved
    - renovationFor(a.building, a.dueYear ?? BASE_YEAR).carbonSaved;
  return carbonDifference || a.building.id.localeCompare(b.building.id);
}

export function assessPortfolio(buildings: Building[], strategy: Strategy) {
  validateStrategy(strategy);
  return buildings.map((building) => assessBuilding(building, strategy)).sort(compareAssessments);
}

export function selectProgram(assessments: Assessment[], horizon: number, cohort: Cohort | null) {
  return assessments.filter((item) => cohort !== null
    ? item.cohort === cohort
    : item.dueYear !== null && item.dueYear <= BASE_YEAR + horizon);
}

export function programMetrics(program: Assessment[]) {
  const eligible = program.filter((item) => item.dueYear !== null);
  const area = eligible.reduce((sum, item) => sum + item.building.area, 0);
  const totals = eligible.reduce((sum, item) => {
    const renovation = renovationFor(item.building, item.dueYear ?? BASE_YEAR);
    return {
      cost: sum.cost + renovation.cost,
      carbonBefore: sum.carbonBefore + item.building.carbonIntensity * item.building.area / 1000,
      carbonSaved: sum.carbonSaved + renovation.carbonSaved,
      idcBefore: sum.idcBefore + item.building.idc * item.building.area,
      idcAfter: sum.idcAfter + renovation.idcAfter * item.building.area,
      conditionBefore: sum.conditionBefore + renovation.conditionBefore * item.building.area,
      conditionAfter: sum.conditionAfter + renovation.conditionAfter * item.building.area,
    };
  }, { cost: 0, carbonBefore: 0, carbonSaved: 0, idcBefore: 0, idcAfter: 0, conditionBefore: 0, conditionAfter: 0 });
  return {
    ...totals,
    count: eligible.length,
    area,
    idcBefore: area ? totals.idcBefore / area : 0,
    idcAfter: area ? totals.idcAfter / area : 0,
    conditionBefore: area ? totals.conditionBefore / area : 0,
    conditionAfter: area ? totals.conditionAfter / area : 0,
    carbonReduction: totals.carbonBefore ? totals.carbonSaved / totals.carbonBefore : 0,
  };
}
