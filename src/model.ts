import { MEASURE_IDS, planRenovation } from './renovation';

export const BASE_YEAR = 2027;
/** Année cible des calendriers de seuils et de la feuille de route du rapport (neutralité carbone, LCl). */
export const TARGET_YEAR = 2050;
/** Horizon du tableau de bord (catégories immédiat / 5 ans / 10 ans) ; le rapport planifie jusqu'à TARGET_YEAR. */
export const MAX_HORIZON = 10;
/** Dernière année des catégories colorées et de la fenêtre de vérification après travaux du tableau de bord. */
export const DASHBOARD_LAST_YEAR = BASE_YEAR + MAX_HORIZON;

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
  /**
   * Droit en vigueur (Data_legal/, inventaire GE-IDC-04 à 06) : travaux énergétiques ordonnés au-delà du seuil IDC de
   * dépassement significatif, art. 14 al. 2 et 9 REn — 800 MJ/m²·an jusqu'au 31.12.2026, 650 dès 2027, 550 dès 2031.
   * Aucune valeur limite légale de CO₂ d'exploitation par bâtiment : le seuil CO₂ est l'équivalent du seuil IDC au mazout
   * (73,7 g/MJ, OFEV), donc jamais plus sévère que la loi. État : critère interne constant de 0,5.
   */
  conservative: {
    id: 'conservative',
    name: 'Base légale',
    thresholds: { condition: 0.5, idc: 650, carbon: 48 },
    changes: [
      { year: 2031, thresholds: { condition: 0.5, idc: 550, carbon: 41 } },
    ],
  },
  /**
   * Objectifs jusqu'en 2050, neutralité carbone comprise (Data_legal/) :
   *  - IDC 450 : Plan directeur de l'énergie 2020-2030, fiche 2.1 (rénover tout bâtiment au-delà de 450 MJ/m²·an) ;
   *    IDC 230 en 2050 : cible après rénovation de ce même plan pour 2050.
   *  - CO₂ 25 et 13 : équivalents au gaz (55,9 g/MJ, OFEV) de 450 et 230 MJ/m²·an ; 13 dès 2030 (sortie du fossile, fiche 2.2).
   *  - 2050 : zéro net (loi fédérale sur le climat, LCl ; Stratégie climat de la Ville : 100 % renouvelable, sans compensation),
   *    exprimé par un résidu de 1 kgCO₂e/m²·an car le facteur de l'électricité du réseau n'atteint pas exactement zéro.
   *    Facteurs d'émission constants (CAD 0,131, électricité 0,097 kg/kWh) : ce seuil n'est pas atteint par un raccordement
   *    au CAD, ni en général par une PAC ; ces bâtiments restent « à étudier » dans la feuille de route.
   *  - 2040 (IDC 340, CO₂ 6) : interpolations linéaires entre 2030 et 2050, absentes des documents sources
   *    (la LCl fixe −82 % pour le secteur du bâtiment en 2040).
   * État : critère interne constant de 0,5. La Base légale reste inchangée : la loi ne programme rien après 2031.
   */
  ambitious: {
    id: 'ambitious',
    name: 'Exemplaire',
    thresholds: { condition: 0.5, idc: 450, carbon: 25 },
    changes: [
      { year: 2030, thresholds: { condition: 0.5, idc: 450, carbon: 13 } },
      { year: 2040, thresholds: { condition: 0.5, idc: 340, carbon: 6 } },
      { year: 2050, thresholds: { condition: 0.5, idc: 230, carbon: 1 } },
    ],
  },
};

export const COHORTS: Record<Cohort, { label: string; short: string; color: string; opacity: number }> = {
  now: { label: 'À traiter maintenant', short: 'Immédiat', color: '#d64a48', opacity: 1 },
  five: { label: 'À traiter d’ici 5 ans', short: 'Sous 5 ans', color: '#d4ad25', opacity: 1 },
  ten: { label: 'À traiter entre 5 et 10 ans', short: 'Sous 10 ans', color: '#329780', opacity: 1 },
  safe: { label: `Aucun seuil dépassé d’ici ${BASE_YEAR + MAX_HORIZON} · surveillance`, short: 'Au-delà de 10 ans', color: '#827f7c', opacity: 0.3 },
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
    if (!Number.isInteger(change.year) || change.year <= BASE_YEAR || change.year > TARGET_YEAR
      || years.has(change.year)) {
      throw new Error(`Chaque changement doit avoir une année distincte, entre ${BASE_YEAR + 1} et ${TARGET_YEAR}.`);
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

/**
 * Premier franchissement d'un seuil en vigueur l'année considérée, de BASE_YEAR à `lastYear` (par défaut TARGET_YEAR,
 * pour le tableau de bord comme pour le rapport). Catégorie : 'now', 'five' ou 'ten' jusqu'à BASE_YEAR + MAX_HORIZON ;
 * au-delà, 'safe' (gris) avec l'année du premier dépassement renseignée ; 'safe' et dueYear null si aucun seuil n'est
 * franchi. Un bâtiment 'safe' n'entre pas au programme du tableau de bord (voir inDashboardProgram), même avec une année.
 */
export function assessBuilding(building: Building, strategy: Strategy, lastYear = TARGET_YEAR): Assessment {
  for (let year = BASE_YEAR; year <= lastYear; year++) {
    const offset = year - BASE_YEAR;
    const thresholds = thresholdsAt(strategy, year);
    const triggers = triggeredCriteria(building, thresholds, year);
    if (triggers.length > 0) {
      return {
        building,
        cohort: offset === 0 ? 'now' : offset <= 5 ? 'five' : offset <= MAX_HORIZON ? 'ten' : 'safe',
        dueYear: year,
        triggers,
        dueCondition: conditionAt(building, year),
        dueThresholds: thresholds,
      };
    }
  }
  return {
    building, cohort: 'safe', dueYear: null, triggers: [],
    dueCondition: conditionAt(building, lastYear),
    dueThresholds: thresholdsAt(strategy, lastYear),
  };
}

/** Le bâtiment a des travaux simulés dans le tableau de bord (rouge, jaune, vert). */
export const inDashboardProgram = (item: Assessment) => item.cohort !== 'safe' && item.dueYear !== null;

/**
 * Profondeur de la rénovation, selon la raison pour laquelle on rénove :
 *  - 'complete' (rénovation complète) : toutes les mesures applicables — façade, toit, cave, fenêtres, changement de
 *    chauffage s'il est fossile ou inconnu, photovoltaïque ; l'état repart à 1 ;
 *  - 'energy' (rénovation énergétique) : changement de chauffage, photovoltaïque, isolation du toit et de la cave, sans
 *    isolation de façade ni remplacement des fenêtres (réfection d'éléments usés, justifiée par la vétusté) ; l'état
 *    est inchangé (indice de l'année des travaux, puis il continue de se dégrader).
 * Règle (interprétation de la demande, hypothèse modèle) : complète si l'indice d'état de l'année des travaux est
 * inférieur à DEEP_RENOVATION_CONDITION (reason 'condition') ; sinon énergétique, sauf si ce paquet laisse un seuil en
 * vigueur dépassé entre l'année des travaux et la fin de la fenêtre (DASHBOARD_LAST_YEAR ou TARGET_YEAR) :
 * alors complète (reason 'thresholds'). Une seule rénovation par bâtiment est modélisée.
 */
export const DEEP_RENOVATION_CONDITION = 0.7;
export type RenovationDepth = 'complete' | 'energy';
export type DepthReason = 'condition' | 'thresholds' | null;
export const DEPTHS: Record<RenovationDepth, { label: string; short: string }> = {
  complete: { label: 'Rénovation complète', short: 'complète' },
  energy: { label: 'Rénovation énergétique', short: 'énergétique' },
};
/** Mesures exclues d'une rénovation énergétique : réfection de l'enveloppe usée. */
export const WORN_ELEMENT_MEASURES = ['facade', 'fenetres'] as const;
export const packageFor = (depth: RenovationDepth): Set<string> => new Set(depth === 'complete'
  ? MEASURE_IDS : MEASURE_IDS.filter((id) => !(WORN_ELEMENT_MEASURES as readonly string[]).includes(id)));

/** Premier dépassement d'un seuil en vigueur après travaux : année, critères, seuils de cette année. */
export interface ThresholdBreach { year: number; criteria: Criterion[]; thresholds: Thresholds }

/** Indice d'état projeté l'année `year` après des travaux de profondeur `depth` réalisés en `worksYear`. */
export function conditionAfterWorks(building: Building, depth: RenovationDepth, worksYear: number, year: number) {
  return depth === 'complete' ? conditionAtAge(year - worksYear) : conditionAt(building, Math.max(year, worksYear));
}

/**
 * Règle commune à l'escalade de profondeur et au signalement « encore hors seuil après travaux » : compare l'IDC et le
 * CO₂ après travaux (constants) et l'état projeté aux seuils en vigueur chaque année de `fromYear` à `toYear`, et renvoie
 * le premier dépassement (équivalent à une comparaison avec les seuils les plus stricts de la période), ou null.
 */
export function firstBreachAfterWorks(
  building: Building, after: { idc: number; carbon: number }, depth: RenovationDepth,
  strategy: Strategy, fromYear: number, toYear: number,
): ThresholdBreach | null {
  for (let year = fromYear; year <= Math.max(fromYear, toYear); year++) {
    const thresholds = thresholdsAt(strategy, year);
    const criteria: Criterion[] = [];
    if (after.idc > thresholds.idc) criteria.push('idc');
    if (conditionAfterWorks(building, depth, fromYear, year) < thresholds.condition) criteria.push('condition');
    if (after.carbon > thresholds.carbon) criteria.push('carbon');
    if (criteria.length > 0) return { year, criteria, thresholds };
  }
  return null;
}

/**
 * Rénovation recommandée d'un bâtiment rénové en `year` (paquet selon la profondeur, voir DEEP_RENOVATION_CONDITION),
 * vérifiée contre les seuils de `strategy` jusqu'à `lastYear` (DASHBOARD_LAST_YEAR au tableau de bord, TARGET_YEAR
 * dans le rapport). `residual` = premier seuil encore dépassé après travaux, ou null.
 */
export function renovationFor(building: Building, year: number, strategy: Strategy, lastYear = DASHBOARD_LAST_YEAR) {
  const conditionBefore = conditionAt(building, year);
  const build = (depth: RenovationDepth) => {
    const selection = packageFor(depth);
    const plan = planRenovation(building, selection, conditionBefore);
    const residual = firstBreachAfterWorks(building, plan.after, depth, strategy, year, lastYear);
    return { depth, selection, plan, residual };
  };
  let chosen: ReturnType<typeof build>;
  let reason: DepthReason = null;
  /** Dépassement laissé par le paquet énergétique, qui justifie l'escalade (reason 'thresholds'). */
  let energyBreach: ThresholdBreach | null = null;
  if (conditionBefore < DEEP_RENOVATION_CONDITION) {
    chosen = build('complete');
    reason = 'condition';
  } else {
    chosen = build('energy');
    if (chosen.residual) {
      energyBreach = chosen.residual;
      chosen = build('complete');
      reason = 'thresholds';
    }
  }
  const { plan } = chosen;
  return {
    plan,
    depth: chosen.depth,
    reason,
    energyBreach,
    selection: chosen.selection,
    residual: chosen.residual,
    cost: plan.capex,
    idcAfter: plan.after.idc,
    carbonAfter: plan.after.carbon,
    conditionBefore,
    // Rénovation complète : état remis à 1 ; rénovation énergétique : état de l'année des travaux, inchangé.
    conditionAfter: chosen.depth === 'complete' ? 1 : conditionBefore,
    carbonSaved: (building.carbonIntensity - plan.after.carbon) * building.area / 1000,
    // Carbone gris des travaux (tCO₂e), hors des gains d'exploitation ci-dessus.
    embodiedCarbon: plan.embodied.total / 1000,
  };
}
export type Renovation = ReturnType<typeof renovationFor>;

const formatValue = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
/** Texte d'un dépassement, p. ex. « 2040 : IDC > 340 ». */
export function describeBreach(breach: Pick<ThresholdBreach, 'year' | 'criteria' | 'thresholds'>) {
  const parts = breach.criteria.map((criterion) => criterion === 'idc' ? `IDC > ${breach.thresholds.idc}`
    : criterion === 'carbon' ? `CO₂ > ${breach.thresholds.carbon}` : `état < ${formatValue(breach.thresholds.condition, 2)}`);
  return `${breach.year} : ${parts.join(', ')}`;
}
/** Explication de la profondeur recommandée, pour l'interface. */
export function describeDepth(renovation: Pick<Renovation, 'depth' | 'reason' | 'conditionBefore' | 'energyBreach'>, year: number) {
  const condition = `état ${formatValue(renovation.conditionBefore, 2)}`;
  const limit = formatValue(DEEP_RENOVATION_CONDITION, 2);
  if (renovation.reason === 'condition') return `${DEPTHS.complete.label} : ${condition} < ${limit} en ${year} (vétusté).`;
  if (renovation.reason === 'thresholds') return `${DEPTHS.complete.label} : ${condition} ≥ ${limit} en ${year}, mais la rénovation énergétique laisserait un seuil dépassé (${renovation.energyBreach ? describeBreach(renovation.energyBreach) : '—'}).`;
  return `${DEPTHS.energy.label} : ${condition} ≥ ${limit} en ${year} ; façade et fenêtres conservées.`;
}

/** Premier dépassement d'un bâtiment à l'échéance, p. ex. « premier dépassement en 2040 : IDC > 340 ». */
export function describeDue(item: Assessment) {
  if (item.dueYear === null) return null;
  return `premier dépassement en ${describeBreach({ year: item.dueYear, criteria: item.triggers, thresholds: item.dueThresholds })}`;
}

/** Ordre de priorité ; `carbonSaved` = gain carbone du paquet recommandé (départage), fourni par assessPortfolio. */
export function compareAssessments(a: Assessment, b: Assessment, carbonSaved: (item: Assessment) => number) {
  const yearDifference = (a.dueYear ?? Infinity) - (b.dueYear ?? Infinity);
  if (Number.isFinite(yearDifference) && yearDifference !== 0) return yearDifference;
  if (a.dueYear === null && b.dueYear !== null) return 1;
  if (b.dueYear === null && a.dueYear !== null) return -1;
  for (const criterion of ['idc', 'condition', 'carbon'] as const) {
    const difference = Number(b.triggers.includes(criterion)) - Number(a.triggers.includes(criterion));
    if (difference !== 0) return difference;
  }
  const carbonDifference = carbonSaved(b) - carbonSaved(a);
  return carbonDifference || a.building.id.localeCompare(b.building.id);
}

/**
 * Évalue et trie le parc. `lastYear` = dernière année balayée (TARGET_YEAR par défaut) ; `worksWindowEnd` = fin de la
 * fenêtre de vérification après travaux utilisée pour le paquet recommandé, donc pour le départage par gain carbone.
 */
export function assessPortfolio(buildings: Building[], strategy: Strategy, lastYear = TARGET_YEAR, worksWindowEnd = DASHBOARD_LAST_YEAR) {
  validateStrategy(strategy);
  const assessments = buildings.map((building) => assessBuilding(building, strategy, lastYear));
  const gains = new Map<Assessment, number>();
  const carbonSaved = (item: Assessment) => {
    let gain = gains.get(item);
    if (gain === undefined) {
      gain = renovationFor(item.building, item.dueYear ?? BASE_YEAR, strategy, worksWindowEnd).carbonSaved;
      gains.set(item, gain);
    }
    return gain;
  };
  return assessments.sort((a, b) => compareAssessments(a, b, carbonSaved));
}

/** Programme du tableau de bord : une catégorie, ou le cumul des échéances d'ici BASE_YEAR + horizon (jamais le gris). */
export function selectProgram(assessments: Assessment[], horizon: number, cohort: Cohort | null) {
  return assessments.filter((item) => cohort !== null
    ? item.cohort === cohort
    : inDashboardProgram(item) && item.dueYear! <= BASE_YEAR + Math.min(horizon, MAX_HORIZON));
}

/** Coûts et gains du programme ; moyennes pondérées par SRE sur le parc fourni, inchangé hors travaux sélectionnés. */
export function programMetrics(program: Assessment[], strategy: Strategy, lastYear = DASHBOARD_LAST_YEAR, buildings?: Building[]) {
  const eligible = program.filter(inDashboardProgram);
  const portfolio = buildings ?? eligible.map((item) => item.building);
  const area = eligible.reduce((sum, item) => sum + item.building.area, 0);
  const renovations = new Map(eligible.map((item) => [
    item.building.id, renovationFor(item.building, item.dueYear!, strategy, lastYear),
  ]));
  const portfolioArea = portfolio.reduce((sum, building) => sum + building.area, 0);
  const totals = portfolio.reduce((sum, building) => {
    const renovation = renovations.get(building.id);
    return {
      cost: sum.cost + (renovation?.cost ?? 0),
      carbonBefore: sum.carbonBefore + building.carbonIntensity * building.area / 1000,
      carbonSaved: sum.carbonSaved + (renovation?.carbonSaved ?? 0),
      idcBefore: sum.idcBefore + building.idc * building.area,
      idcAfter: sum.idcAfter + (renovation?.idcAfter ?? building.idc) * building.area,
      conditionBefore: sum.conditionBefore + building.condition * building.area,
      conditionAfter: sum.conditionAfter + (renovation?.conditionAfter ?? building.condition) * building.area,
    };
  }, { cost: 0, carbonBefore: 0, carbonSaved: 0, idcBefore: 0, idcAfter: 0, conditionBefore: 0, conditionAfter: 0 });
  return {
    ...totals,
    count: eligible.length,
    area,
    portfolioCount: portfolio.length,
    portfolioArea,
    idcBefore: portfolioArea ? totals.idcBefore / portfolioArea : 0,
    idcAfter: portfolioArea ? totals.idcAfter / portfolioArea : 0,
    conditionBefore: portfolioArea ? totals.conditionBefore / portfolioArea : 0,
    conditionAfter: portfolioArea ? totals.conditionAfter / portfolioArea : 0,
    carbonReduction: totals.carbonBefore ? totals.carbonSaved / totals.carbonBefore : 0,
  };
}
