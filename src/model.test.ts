import { describe, expect, it } from 'vitest';
import { createDemoBuildings } from './data';
import {
  BASE_YEAR, PRESETS, assessBuilding, assessPortfolio, conditionAt, conditionAtAge,
  effectiveAge, withConditionModel,
  programMetrics, renovationFor, selectProgram, thresholdsAt, triggeredCriteria, validateStrategy,
} from './model';
import type { Building, Strategy } from './model';
import { ELECTRICITY_EMISSION, PV, RENT, SOCIAL_CARBON_COST, annuity, heatPumpCost, planRenovation } from './renovation';

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
  it('calcule le coût comme la somme des mesures, avec PAC pour un chauffage fossile', () => {
    const result = renovationFor(building, BASE_YEAR + 5);
    const plan = planRenovation(building);
    expect(plan.heatPump).toBe(true);
    expect(plan.measures.map((m) => m.id)).toEqual(['facade', 'toit', 'cave', 'fenetres', 'pac', 'pv']);
    expect(result.cost).toBeCloseTo(plan.measures.reduce((sum, m) => sum + m.cost, 0));
    expect(result.cost).toBe(plan.capex);
    expect(plan.measures.find((m) => m.id === 'facade')!.cost).toBeCloseTo(0.8 * 1000 * 200);
    expect(result.idcAfter).toBeLessThan(building.idc);
    expect(result.carbonAfter).toBeLessThan(building.carbonIntensity);
    expect(result.carbonSaved).toBeCloseTo((5 - result.carbonAfter) * 1000 / 1000);
    expect(result.conditionBefore).toBeCloseTo(conditionAt(building, BASE_YEAR + 5));
    expect(result.conditionAfter).toBe(1);
  });

  it('n’ajoute pas de PAC si le chauffage est déjà décarboné et utilise l’isolation intérieure en cas de protection', () => {
    const plan = planRenovation({ ...building, heating: 'CAD', protection: 'classé' });
    expect(plan.heatPump).toBe(false);
    expect(plan.measures.some((m) => m.id === 'pac')).toBe(false);
    const facade = plan.measures.find((m) => m.id === 'facade')!;
    expect(facade.proxy).toBe(true);
    expect(facade.unitCost).toBeCloseTo(91.1 + 2.6 * 12);
    expect(plan.after.carbon).toBeLessThanOrEqual(building.carbonIntensity);
  });

  it('sépare enveloppe thermique et équipements techniques', () => {
    const { measures, after } = planRenovation(building);
    const sum = (category: string) => measures.filter((m) => m.category === category).reduce((s, m) => s + m.annualCost, 0);
    expect(measures.filter((m) => m.category === 'enveloppe').map((m) => m.id)).toEqual(['facade', 'toit', 'cave', 'fenetres']);
    expect(measures.filter((m) => m.category === 'equipement').map((m) => m.id)).toEqual(['pac', 'pv']);
    expect(after.envelopeCost).toBeCloseTo(sum('enveloppe'));
    expect(after.equipmentCost).toBeCloseTo(sum('equipement'));
    expect(after.renovationCost).toBeCloseTo(after.envelopeCost + after.equipmentCost);
  });

  it('dimensionne le photovoltaïque sur l’électricité de chauffage et réduit les imports', () => {
    const plan = planRenovation(building);
    const pv = plan.measures.find((m) => m.id === 'pv')!;
    expect(pv.unitCost).toBe(PV.costPerKwc);
    expect(plan.pv.production).toBeCloseTo(pv.quantity * PV.yield);
    expect(plan.pv.production).toBeLessThanOrEqual(plan.after.finalKwh + 1e-6);
    const without = planRenovation({ ...building, protection: 'classé' });
    expect(plan.after.energyCost).toBeLessThan(without.after.energyCost);
    expect(plan.after.carbon).toBeLessThan(without.after.carbon);
    expect(plan.after.carbon).toBeCloseTo(Math.max(0, plan.after.finalKwh - plan.pv.production) / 1000 * ELECTRICITY_EMISSION);
  });

  it('n’installe pas de photovoltaïque sur un bâtiment protégé et l’indique', () => {
    for (const protection of ['classé', 'inventaire']) {
      const plan = planRenovation({ ...building, protection });
      expect(plan.measures.some((m) => m.id === 'pv')).toBe(false);
      expect(plan.pv.blocked).toBe(true);
      expect(plan.pv.reason).toContain('protégé');
    }
    expect(planRenovation({ ...building, protection: 'none' }).pv.blocked).toBe(false);
  });

  it('calcule les loyers : manque à gagner réparti sur 30 ans et hausse de confort', () => {
    const none = planRenovation(building);
    expect(none.rent).toEqual({ base: 0, loss: 0, gain: 0, net: 0 });
    const plan = planRenovation({ ...building, rentResidential: 300_000 });
    expect(plan.rent.loss).toBeCloseTo(300_000 * RENT.lossYears / RENT.spreadYears);
    expect(plan.rent.gain).toBeCloseTo(300_000 * RENT.comfortUplift);
    expect(plan.rent.net).toBeCloseTo(plan.rent.gain - plan.rent.loss);
    expect(plan.before.rentLoss).toBe(0);
    expect(plan.after.rentLoss).toBeCloseTo(plan.rent.loss);
    expect(plan.after.rentGain).toBeCloseTo(plan.rent.gain);
  });

  it('adapte le plan aux mesures cochées', () => {
    const all = planRenovation(building);
    expect(all.measures.every((m) => m.included)).toBe(true);
    const some = planRenovation(building, new Set(['facade', 'pac']));
    expect(some.measures.map((m) => m.id)).toEqual(all.measures.map((m) => m.id));
    expect(some.measures.filter((m) => m.included).map((m) => m.id)).toEqual(['facade', 'pac']);
    expect(some.capex).toBeCloseTo(all.measures.filter((m) => ['facade', 'pac'].includes(m.id)).reduce((sum, m) => sum + m.cost, 0));
    expect(some.after.envelopeCost).toBeCloseTo(all.measures.find((m) => m.id === 'facade')!.annualCost);
    expect(some.after.idc).toBeGreaterThan(all.after.idc);
    expect(some.pv.kwc).toBe(0);

    const none = planRenovation(building, new Set());
    expect(none.capex).toBe(0);
    expect(none.after.renovationCost).toBe(0);
    expect(none.after.idc).toBeCloseTo(none.before.idc);
    expect(none.after.carbon).toBeCloseTo(none.before.carbon);
    expect(none.after.total).toBeCloseTo(none.before.total);
  });

  it('exige la PAC pour le photovoltaïque et limite les loyers aux travaux d’enveloppe', () => {
    const noPump = planRenovation({ ...building, rentResidential: 300_000 }, new Set(['pv', 'fenetres']));
    const pv = noPump.measures.find((m) => m.id === 'pv')!;
    expect(pv.included).toBe(false);
    expect(pv.note).toContain('pompe à chaleur');
    expect(noPump.pv.production).toBe(0);
    expect(noPump.rent.gain).toBeGreaterThan(0);
    const equipmentOnly = planRenovation({ ...building, rentResidential: 300_000 }, new Set(['pac', 'pv']));
    expect(equipmentOnly.rent).toEqual({ base: 300_000, loss: 0, gain: 0, net: 0 });
    expect(equipmentOnly.pv.kwc).toBeGreaterThan(0);
    expect(equipmentOnly.after.rentLoss).toBe(0);
  });

  it('interpole le coût de PAC sur la figure 47 de LICS2022', () => {
    expect(heatPumpCost(3)).toBeCloseTo(47_900);
    expect(heatPumpCost(5)).toBeCloseTo(47_900);
    expect(heatPumpCost(10)).toBeCloseTo(52_700);
    expect(heatPumpCost(15)).toBeCloseTo((52.7 + 72.8) / 2 * 1000);
    expect(heatPumpCost(200)).toBeCloseTo(641_100);
    expect(heatPumpCost(400)).toBeCloseTo(641_100 * 2);
    expect(annuity(20, 0.03)).toBeCloseTo(0.0672, 3);
  });

  it('décompose le coût annuel : énergie, rénovation annualisée et coût social du carbone', () => {
    const { before, after, measures } = planRenovation(building);
    expect(before.renovationCost).toBe(0);
    expect(before.carbonCost).toBeCloseTo(5 * 1000 / 1000 * SOCIAL_CARBON_COST);
    expect(before.total).toBeCloseTo(before.energyCost + before.carbonCost);
    expect(after.renovationCost).toBeCloseTo(measures.reduce((sum, m) => sum + m.annualCost, 0));
    expect(after.total).toBeCloseTo(after.energyCost + after.renovationCost + after.carbonCost);
    expect(before.energyCost).toBeCloseTo(400 / 3.6 * 1000 * 0.09);
  });

  it('pondère les moyennes par surface sur le même périmètre avant/après', () => {
    const samples = [
      { ...building, id: 'one', area: 100, idc: 700, condition: 0.4, carbonIntensity: 50 },
      { ...building, id: 'two', area: 900, idc: 400, condition: 0.3, carbonIntensity: 20 },
    ];
    const assessments = assessPortfolio(samples, PRESETS.conservative);
    const metrics = programMetrics(assessments);
    const after = samples.map((sample) => renovationFor(sample, BASE_YEAR).idcAfter * sample.area);
    expect(metrics.count).toBe(2);
    expect(metrics.area).toBe(1000);
    expect(metrics.idcBefore).toBeCloseTo(430);
    expect(metrics.idcAfter).toBeCloseTo((after[0]! + after[1]!) / 1000);
    expect(metrics.conditionBefore).toBeCloseTo(0.31);
    expect(metrics.conditionAfter).toBeCloseTo(1);
    expect(metrics.carbonBefore).toBeCloseTo(23);
    expect(metrics.carbonSaved).toBeCloseTo(assessments.reduce((sum, item) => sum + renovationFor(item.building, BASE_YEAR).carbonSaved, 0));
  });

  it('renvoie un programme vide sans NaN et sans travaux pour les bâtiments verts', () => {
    const safe = assessBuilding(building, PRESETS.conservative);
    const empty = programMetrics([]);
    expect(Object.values(empty).every(Number.isFinite)).toBe(true);
    expect(programMetrics([safe])).toEqual(empty);
  });

  it('reste fini et cohérent pour tout le parc de démonstration', () => {
    for (const sample of createDemoBuildings()) {
      const plan = planRenovation(sample);
      expect(Object.values(plan.after).every(Number.isFinite)).toBe(true);
      expect(plan.after.idc).toBeLessThanOrEqual(plan.before.idc + 1e-9);
      expect(plan.capex).toBeGreaterThan(0);
    }
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

describe('modèle d’état linéaire par morceaux', () => {
  it('vaut 1 pendant 10 ans, puis perd 0,01 par an jusqu’à 0,40 à 70 ans', () => {
    expect(conditionAtAge(0)).toBe(1);
    expect(conditionAtAge(10)).toBe(1);
    expect(conditionAtAge(11)).toBeCloseTo(0.99);
    expect(conditionAtAge(40)).toBeCloseTo(0.70);
    expect(conditionAtAge(70)).toBeCloseTo(0.40);
  });

  it('ralentit à 0,005 par an après 70 ans et ne passe pas sous 0', () => {
    expect(conditionAtAge(71)).toBeCloseTo(0.395);
    expect(conditionAtAge(100)).toBeCloseTo(0.25);
    expect(conditionAtAge(150)).toBeCloseTo(0);
    expect(conditionAtAge(300)).toBe(0);
    const values = Array.from({ length: 160 }, (_, age) => conditionAtAge(age));
    values.slice(1).forEach((v, i) => expect(v).toBeLessThanOrEqual(values[i]!));
  });

  it('part de la construction ou des derniers travaux, le plus récent des deux', () => {
    expect(effectiveAge(BASE_YEAR - 30, null)).toBe(30);
    expect(effectiveAge(BASE_YEAR - 30, 2020)).toBe(BASE_YEAR - 2020);
    expect(effectiveAge(BASE_YEAR - 5, 2000)).toBe(5);
    expect(effectiveAge(1850, null)).toBe(BASE_YEAR - 1850);
  });

  it('projette l’état depuis l’âge effectif', () => {
    const modelled = withConditionModel({ ...building, constructionYear: BASE_YEAR - 40, lastWorkYear: null });
    expect(modelled.condition).toBeCloseTo(0.70);
    expect(conditionAt(modelled, BASE_YEAR + 10)).toBeCloseTo(0.60);
    expect(modelled.annualDecay).toBeCloseTo(0.01);
    const recent = withConditionModel({ ...building, constructionYear: 1900, lastWorkYear: BASE_YEAR - 8 });
    expect(recent.condition).toBe(1);
  });
});
