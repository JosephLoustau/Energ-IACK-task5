import { describe, expect, it } from 'vitest';
import { createDemoBuildings } from './data';
import {
  BASE_YEAR, DEGRADATION, PRESETS, RENOVATION, assessBuilding, assessPortfolio, conditionAt, conditionAtAge,
  effectiveAge, withConditionModel,
  programMetrics, renovationFor, selectProgram, thresholdsAt, triggeredCriteria, validateStrategy,
} from './model';
import type { Building, Strategy } from './model';

const building: Building = {
  id: 'TEST-1',
  name: 'Bâtiment de test',
  district: 'Démo',
  use: 'École',
  coordinates: [46.2, 6.14],
  area: 1000,
  constructionYear: 1980,
  condition: 0.9,
  annualDecay: 0.01,
  idc: 400,
  carbonIntensity: 5,
  heating: 'Gaz',
};

describe('Déclenchement et calendrier', () => {
  it('utilise les seuils validés par le cahier des charges', () => {
    expect(PRESETS.conservative.thresholds).toEqual({ condition: 0.5, idc: 600, carbon: 20 });
    expect(PRESETS.ambitious.thresholds).toEqual({ condition: 0.7, idc: 450, carbon: 6 });
  });

  it('ne déclenche pas à égalité exacte des trois seuils', () => {
    const equal = { ...building, idc: 600, condition: 0.5, carbonIntensity: 20, annualDecay: 0 };
    expect(triggeredCriteria(equal, PRESETS.conservative.thresholds, BASE_YEAR)).toEqual([]);
    expect(assessBuilding(equal, PRESETS.conservative).cohort).toBe('safe');
  });

  it.each([
    [{ idc: 601 }, 'idc'],
    [{ condition: 0.49 }, 'condition'],
    [{ carbonIntensity: 20.1 }, 'carbon'],
  ] as const)('chaque critère peut déclencher seul : %o', (overrides, criterion) => {
    const assessment = assessBuilding({ ...building, ...overrides }, PRESETS.conservative);
    expect(assessment.cohort).toBe('now');
    expect(assessment.dueYear).toBe(BASE_YEAR);
    expect(assessment.triggers).toEqual([criterion]);
  });

  it('maintient IDC et CO₂ sans travaux, mais dégrade l’état', () => {
    const sample = { ...building, condition: 0.6, annualDecay: 0.025 };
    const result = assessBuilding(sample, PRESETS.conservative);
    expect(result.cohort).toBe('five');
    expect(result.dueYear).toBe(BASE_YEAR + 5);
    expect(result.triggers).toEqual(['condition']);
    expect(result.building.idc).toBe(400);
    expect(result.building.carbonIntensity).toBe(5);
  });

  it('classe un premier besoin à six ans dans la catégorie dix ans', () => {
    const result = assessBuilding({ ...building, condition: 0.61, annualDecay: 0.02 }, PRESETS.conservative);
    expect(result.cohort).toBe('ten');
    expect(result.dueYear).toBe(BASE_YEAR + 6);
  });

  it('borne l’état à zéro', () => {
    expect(conditionAt({ ...building, condition: 0.1, annualDecay: 0.1 }, BASE_YEAR + 10)).toBe(0);
  });

  it('applique des seuils futurs à leur année, sans modifier les données', () => {
    const strategy: Strategy = {
      ...PRESETS.conservative,
      changes: [{ year: BASE_YEAR + 4, thresholds: { idc: 450, condition: 0.5, carbon: 20 } }],
    };
    const sample = { ...building, idc: 500 };
    expect(assessBuilding(sample, PRESETS.conservative).cohort).toBe('safe');
    const result = assessBuilding(sample, strategy);
    expect(result.cohort).toBe('five');
    expect(result.dueYear).toBe(BASE_YEAR + 4);
    expect(result.triggers).toEqual(['idc']);
    expect(result.building.idc).toBe(500);
  });

  it('utilise le calendrier complet et le dernier changement applicable, indépendamment de l’ordre', () => {
    const strategy: Strategy = {
      ...PRESETS.conservative,
      changes: [
        { year: BASE_YEAR + 8, thresholds: { idc: 350, condition: 0.7, carbon: 6 } },
        { year: BASE_YEAR + 4, thresholds: { idc: 450, condition: 0.6, carbon: 15 } },
      ],
    };
    expect(thresholdsAt(strategy, BASE_YEAR + 3)).toEqual(PRESETS.conservative.thresholds);
    expect(thresholdsAt(strategy, BASE_YEAR + 4).idc).toBe(450);
    expect(thresholdsAt(strategy, BASE_YEAR + 7).carbon).toBe(15);
    expect(thresholdsAt(strategy, BASE_YEAR + 8).idc).toBe(350);
    expect(strategy.changes[0]?.year).toBe(BASE_YEAR + 8);
  });

  it('peut déclencher à dix ans exactement et ignore un besoin plus tardif', () => {
    const strategy: Strategy = {
      ...PRESETS.conservative,
      changes: [{ year: BASE_YEAR + 10, thresholds: { idc: 300, condition: 0.5, carbon: 20 } }],
    };
    expect(assessBuilding(building, strategy).dueYear).toBe(BASE_YEAR + 10);
    expect(assessBuilding({ ...building, condition: 0.7, annualDecay: 0.01 }, PRESETS.conservative).dueYear).toBeNull();
  });

  it('ne conserve pas artificiellement le besoin futur si le seuil est assoupli avant son franchissement', () => {
    const strategy: Strategy = {
      ...PRESETS.conservative,
      changes: [{ year: BASE_YEAR + 3, thresholds: { idc: 600, condition: 0.3, carbon: 20 } }],
    };
    expect(assessBuilding({ ...building, condition: 0.6, annualDecay: 0.025 }, strategy).cohort).toBe('safe');
  });
});

describe('Priorités et sélections', () => {
  it('trie les urgences par IDC, puis état, puis CO₂, et place la surveillance en dernier', () => {
    const samples = [
      { ...building, id: 'carbon', carbonIntensity: 30 },
      { ...building, id: 'state', condition: 0.4 },
      { ...building, id: 'idc', idc: 700 },
      { ...building, id: 'safe' },
    ];
    expect(assessPortfolio(samples, PRESETS.conservative).map((item) => item.building.id))
      .toEqual(['idc', 'state', 'carbon', 'safe']);
  });

  it('départage des critères identiques par gain carbone absolu', () => {
    const samples = [
      { ...building, id: 'small', idc: 700, area: 500, carbonIntensity: 40 },
      { ...building, id: 'large', idc: 700, area: 5000, carbonIntensity: 40 },
    ];
    expect(assessPortfolio(samples, PRESETS.conservative)[0]?.building.id).toBe('large');
  });

  it('les cumuls incluent chaque bâtiment une fois et excluent la surveillance', () => {
    const portfolio = assessPortfolio(createDemoBuildings(), PRESETS.conservative);
    const now = selectProgram(portfolio, 0, null);
    const five = selectProgram(portfolio, 5, null);
    const ten = selectProgram(portfolio, 10, null);
    expect(five.length).toBeGreaterThanOrEqual(now.length);
    expect(ten.length).toBeGreaterThanOrEqual(five.length);
    expect(new Set(ten.map((item) => item.building.id)).size).toBe(ten.length);
    expect(ten.every((item) => item.cohort !== 'safe')).toBe(true);
    expect(programMetrics(ten).cost).toBeGreaterThanOrEqual(programMetrics(five).cost);
  });

  it('une catégorie remplace le cumul, quel que soit l’horizon actif', () => {
    const portfolio = assessPortfolio(createDemoBuildings(), PRESETS.conservative);
    const selected = selectProgram(portfolio, 0, 'ten');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => item.cohort === 'ten')).toBe(true);
    expect(selectProgram(portfolio, 10, 'ten')).toEqual(selected);
  });
});

describe('Rénovation et indicateurs', () => {
  it('calcule un coût à l’échéance, une baisse de chaleur et un carbone cohérent', () => {
    const result = renovationFor(building, BASE_YEAR + 5);
    expect(result.conditionBefore).toBeCloseTo(0.85);
    expect(result.cost).toBeCloseTo(1000 * (550 + 900 * 0.15));
    expect(result.idcAfter).toBeCloseTo(220);
    expect(result.carbonAfter).toBeCloseTo(220 / 3.6 * 0.035);
    expect(result.carbonSaved).toBeCloseTo((5 - result.carbonAfter) * 1000 / 1000);
    expect(result.conditionAfter).toBe(0.92);
  });

  it('ne détériore pas un bâtiment déjà en excellent état ou très décarboné', () => {
    const sample = { ...building, condition: 0.98, carbonIntensity: 0.1 };
    const result = renovationFor(sample, BASE_YEAR);
    expect(result.conditionAfter).toBe(0.98);
    expect(result.carbonAfter).toBe(0.1);
    expect(result.carbonSaved).toBe(0);
  });

  it('pondère les moyennes par surface sur le même périmètre avant/après', () => {
    const samples = [
      { ...building, id: 'one', area: 100, idc: 700, condition: 0.4, carbonIntensity: 50 },
      { ...building, id: 'two', area: 900, idc: 400, condition: 0.3, carbonIntensity: 20 },
    ];
    const assessments = assessPortfolio(samples, PRESETS.conservative);
    const metrics = programMetrics(assessments);
    expect(metrics.count).toBe(2);
    expect(metrics.area).toBe(1000);
    expect(metrics.idcBefore).toBeCloseTo(430);
    expect(metrics.idcAfter).toBeCloseTo(430 * (1 - RENOVATION.heatReduction));
    expect(metrics.conditionBefore).toBeCloseTo(0.31);
    expect(metrics.conditionAfter).toBeCloseTo(0.92);
    expect(metrics.carbonBefore).toBeCloseTo(23);
    expect(metrics.carbonSaved).toBeCloseTo(assessments.reduce((sum, item) => sum + renovationFor(item.building, BASE_YEAR).carbonSaved, 0));
  });

  it('renvoie un programme vide sans NaN et sans travaux pour les bâtiments verts', () => {
    const safe = assessBuilding(building, PRESETS.conservative);
    const empty = programMetrics([]);
    expect(Object.values(empty).every(Number.isFinite)).toBe(true);
    expect(programMetrics([safe])).toEqual(empty);
  });

  it('un programme ambitieux peut conserver un dépassement : pas de conformité inventée', () => {
    const result = renovationFor({ ...building, idc: 1000 }, BASE_YEAR);
    expect(result.idcAfter).toBeGreaterThan(PRESETS.ambitious.thresholds.idc);
  });
});

describe('Données de démonstration et validation', () => {
  it('génère 96 bâtiments identifiables, reproductibles et valides', () => {
    const data = createDemoBuildings();
    expect(data).toEqual(createDemoBuildings());
    expect(data.length).toBe(96);
    expect(new Set(data.map((item) => item.id)).size).toBe(96);
    expect(data.every((item) => item.name.includes('démo') && item.id.startsWith('DEMO-')
      && item.area > 0 && item.condition >= 0 && item.condition <= 1
      && item.coordinates[0] > 46.17 && item.coordinates[0] < 46.24
      && item.coordinates[1] > 6.10 && item.coordinates[1] < 6.19)).toBe(true);
  });

  it('représente les quatre couleurs dans le scénario conservatoire', () => {
    const portfolio = assessPortfolio(createDemoBuildings(), PRESETS.conservative);
    expect(new Set(portfolio.map((item) => item.cohort))).toEqual(new Set(['now', 'five', 'ten', 'safe']));
  });

  it('ne modifie ni les bâtiments ni les stratégies lors des calculs', () => {
    const data = createDemoBuildings();
    const before = JSON.stringify({ data, preset: PRESETS.conservative });
    programMetrics(assessPortfolio(data, PRESETS.conservative));
    expect(JSON.stringify({ data, preset: PRESETS.conservative })).toBe(before);
  });

  it.each([
    { idc: 0, condition: 0.5, carbon: 20 },
    { idc: 600, condition: -0.1, carbon: 20 },
    { idc: 600, condition: 1.1, carbon: 20 },
    { idc: 600, condition: 0.5, carbon: NaN },
  ])('refuse les seuils invalides %o avec une erreur explicite', (thresholds) => {
    expect(() => validateStrategy({ ...PRESETS.conservative, thresholds })).toThrow('Seuils invalides');
  });

  it.each([BASE_YEAR, BASE_YEAR + 11, BASE_YEAR + 1.5])('refuse un changement à une année invalide %s', (year) => {
    expect(() => validateStrategy({
      ...PRESETS.conservative, changes: [{ year, thresholds: PRESETS.ambitious.thresholds }],
    })).toThrow('année distincte');
  });

  it('refuse deux changements pour la même année', () => {
    const change = { year: BASE_YEAR + 4, thresholds: PRESETS.ambitious.thresholds };
    expect(() => validateStrategy({ ...PRESETS.conservative, changes: [change, change] })).toThrow('année distincte');
  });
});

describe('modèle d’état en S', () => {
  it('vaut 1 à l’âge 0, décroît et reste au-dessus du plancher', () => {
    expect(conditionAtAge(0)).toBeCloseTo(1, 10);
    const values = Array.from({ length: 121 }, (_, age) => conditionAtAge(age));
    values.slice(1).forEach((v, i) => expect(v).toBeLessThan(values[i]!));
    expect(values.at(-1)!).toBeGreaterThan(DEGRADATION.floor);
  });

  it('chute le plus vite autour de l’âge médian (forme en S)', () => {
    const drop = (age: number) => conditionAtAge(age) - conditionAtAge(age + 1);
    expect(drop(DEGRADATION.midAge)).toBeGreaterThan(drop(5));
    expect(drop(DEGRADATION.midAge)).toBeGreaterThan(drop(110));
  });

  it('plafonne l’âge effectif et retire du vieillissement après travaux', () => {
    expect(effectiveAge(1850, null)).toBe(DEGRADATION.maxEffectiveAge);
    expect(effectiveAge(BASE_YEAR - 30, null)).toBe(30);
    expect(effectiveAge(BASE_YEAR - 30, 2020)).toBe(30 - DEGRADATION.workRecovery);
    expect(effectiveAge(BASE_YEAR - 5, 2024)).toBe(0);
  });

  it('projette l’état sur la courbe depuis l’âge effectif', () => {
    const modelled = withConditionModel({ ...building, constructionYear: BASE_YEAR - 40, lastWorkYear: null });
    expect(modelled.condition).toBeCloseTo(conditionAtAge(40), 10);
    expect(conditionAt(modelled, BASE_YEAR + 10)).toBeCloseTo(conditionAtAge(50), 10);
    expect(modelled.annualDecay).toBeCloseTo(conditionAtAge(40) - conditionAtAge(41), 10);
  });
});
