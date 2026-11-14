import { describe, expect, it } from 'vitest';
import { BUILDINGS, createDemoBuildings } from './data';
import {
  BASE_YEAR, COHORTS, DASHBOARD_LAST_YEAR, DEEP_RENOVATION_CONDITION, PRESETS, TARGET_YEAR, assessBuilding, assessPortfolio, conditionAt, conditionAtAge,
  describeDue, effectiveAge, firstBreachAfterWorks, inDashboardProgram, packageFor, withConditionModel,
  programMetrics, renovationFor, selectProgram, thresholdsAt, triggeredCriteria, validateStrategy,
} from './model';
import type { Building, Strategy } from './model';
import { CARRIERS, ELECTRICITY_EMISSION, ELEMENT_RATIO, EMBODIED, insulationEmbodied, HEAT_PUMP_COP, MEASURE_IDS, PV, RENT, VALUE_UPLIFT, SOCIAL_CARBON_COST, WINDOW_SHARE, annuity, valueUpliftFactor, carbonFromIdc, districtHeatingCost, elementRatios, energyPrice, ELECTRICITY_PRICE_FACTOR, heatPumpCost, planRenovation, windowShareFor } from './renovation';

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

/** Seuils fixes, sans calendrier, pour tester le moteur indépendamment des scénarios. */
const FIXED: Strategy = { id: 'conservative', name: 'Seuils fixes', thresholds: { condition: 0.5, idc: 600, carbon: 20 }, changes: [] };

describe('Déclenchement et calendrier', () => {
  it('utilise les seuils validés par le cahier des charges', () => {
    expect(BASE_YEAR).toBe(2027);
    expect(DASHBOARD_LAST_YEAR).toBe(2037);
    expect(PRESETS.conservative.thresholds).toEqual({ condition: 0.5, idc: 650, carbon: 48 });
    expect(PRESETS.conservative.changes).toEqual([
      { year: 2031, thresholds: { condition: 0.5, idc: 550, carbon: 41 } },
    ]);
    expect(PRESETS.ambitious.thresholds).toEqual({ condition: 0.5, idc: 450, carbon: 25 });
    expect(PRESETS.ambitious.changes).toEqual([
      { year: 2030, thresholds: { condition: 0.5, idc: 450, carbon: 13 } },
      { year: 2040, thresholds: { condition: 0.5, idc: 340, carbon: 6 } },
      { year: 2050, thresholds: { condition: 0.5, idc: 230, carbon: 1 } },
    ]);
    for (const preset of Object.values(PRESETS)) expect(() => validateStrategy(preset)).not.toThrow();
  });

  it('balaie jusqu’en 2050 par défaut : échéance après 2036 en surveillance, null si le balayage s’arrête en 2036', () => {
    const sample = { ...building, idc: 400, carbonIntensity: 3, condition: 0.95, annualDecay: 0.01 };
    expect(assessBuilding(sample, PRESETS.ambitious, DASHBOARD_LAST_YEAR)).toMatchObject({ cohort: 'safe', dueYear: null, triggers: [] });
    expect(assessBuilding(sample, PRESETS.ambitious)).toEqual(assessBuilding(sample, PRESETS.ambitious, TARGET_YEAR));
    const extended = assessBuilding(sample, PRESETS.ambitious);
    expect(extended.dueYear).toBe(2040);
    expect(extended.cohort).toBe('safe');
    expect(extended.triggers).toEqual(['idc']);
    expect(extended.dueThresholds.idc).toBe(340);
    // Les échéances jusqu'en 2036 gardent leur catégorie avec le balayage étendu.
    const due = { ...building, idc: 700 };
    expect(assessBuilding(due, PRESETS.ambitious, TARGET_YEAR)).toEqual(assessBuilding(due, PRESETS.ambitious, DASHBOARD_LAST_YEAR));
  });

  it('ne déclenche pas à égalité exacte des trois seuils', () => {
    const equal = { ...building, idc: 600, condition: 0.5, carbonIntensity: 20, annualDecay: 0 };
    expect(triggeredCriteria(equal, FIXED.thresholds, BASE_YEAR)).toEqual([]);
    expect(assessBuilding(equal, FIXED).cohort).toBe('safe');
  });

  it.each([
    [{ idc: 601 }, 'idc'],
    [{ condition: 0.49 }, 'condition'],
    [{ carbonIntensity: 20.1 }, 'carbon'],
  ] as const)('chaque critère peut déclencher seul : %o', (overrides, criterion) => {
    const assessment = assessBuilding({ ...building, ...overrides }, FIXED);
    expect(assessment.cohort).toBe('now');
    expect(assessment.dueYear).toBe(BASE_YEAR);
    expect(assessment.triggers).toEqual([criterion]);
  });

  it('maintient IDC et CO₂ sans travaux, mais dégrade l’état', () => {
    const sample = { ...building, condition: 0.6, annualDecay: 0.025 };
    const result = assessBuilding(sample, FIXED);
    expect(result.cohort).toBe('five');
    expect(result.dueYear).toBe(BASE_YEAR + 5);
    expect(result.triggers).toEqual(['condition']);
    expect(result.building.idc).toBe(400);
    expect(result.building.carbonIntensity).toBe(5);
  });

  it('classe un premier besoin à six ans dans la catégorie dix ans', () => {
    const result = assessBuilding({ ...building, condition: 0.61, annualDecay: 0.02 }, FIXED);
    expect(result.cohort).toBe('ten');
    expect(result.dueYear).toBe(BASE_YEAR + 6);
  });

  it('borne l’état à zéro', () => {
    expect(conditionAt({ ...building, condition: 0.1, annualDecay: 0.1 }, BASE_YEAR + 10)).toBe(0);
  });

  it('applique des seuils futurs à leur année, sans modifier les données', () => {
    const strategy: Strategy = {
      ...FIXED,
      changes: [{ year: BASE_YEAR + 4, thresholds: { idc: 450, condition: 0.5, carbon: 20 } }],
    };
    const sample = { ...building, idc: 500 };
    expect(assessBuilding(sample, FIXED).cohort).toBe('safe');
    const result = assessBuilding(sample, strategy);
    expect(result.cohort).toBe('five');
    expect(result.dueYear).toBe(BASE_YEAR + 4);
    expect(result.triggers).toEqual(['idc']);
    expect(result.building.idc).toBe(500);
  });

  it('utilise le calendrier complet et le dernier changement applicable, indépendamment de l’ordre', () => {
    const strategy: Strategy = {
      ...FIXED,
      changes: [
        { year: BASE_YEAR + 8, thresholds: { idc: 350, condition: 0.7, carbon: 6 } },
        { year: BASE_YEAR + 4, thresholds: { idc: 450, condition: 0.6, carbon: 15 } },
      ],
    };
    expect(thresholdsAt(strategy, BASE_YEAR + 3)).toEqual(FIXED.thresholds);
    expect(thresholdsAt(strategy, BASE_YEAR + 4).idc).toBe(450);
    expect(thresholdsAt(strategy, BASE_YEAR + 7).carbon).toBe(15);
    expect(thresholdsAt(strategy, BASE_YEAR + 8).idc).toBe(350);
    expect(strategy.changes[0]?.year).toBe(BASE_YEAR + 8);
  });

  it('peut déclencher à dix ans exactement et ignore un besoin plus tardif', () => {
    const strategy: Strategy = {
      ...FIXED,
      changes: [{ year: BASE_YEAR + 10, thresholds: { idc: 300, condition: 0.5, carbon: 20 } }],
    };
    expect(assessBuilding(building, strategy).dueYear).toBe(BASE_YEAR + 10);
    expect(assessBuilding({ ...building, condition: 0.7, annualDecay: 0.01 }, FIXED, DASHBOARD_LAST_YEAR).dueYear).toBeNull();
    // Balayage par défaut jusqu'en 2050 : dépassement d'état vers 2046, toujours gris.
    const late = assessBuilding({ ...building, condition: 0.7, annualDecay: 0.01 }, FIXED);
    expect(late.cohort).toBe('safe');
    expect(late.dueYear).toBeGreaterThan(DASHBOARD_LAST_YEAR);
    expect(late.triggers).toEqual(['condition']);
  });

  it('ne conserve pas artificiellement le besoin futur si le seuil est assoupli avant son franchissement', () => {
    const strategy: Strategy = {
      ...FIXED,
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
    expect(assessPortfolio(samples, FIXED).map((item) => item.building.id))
      .toEqual(['idc', 'state', 'carbon', 'safe']);
  });

  it('départage des critères identiques par gain carbone absolu', () => {
    const samples = [
      { ...building, id: 'small', idc: 700, area: 500, carbonIntensity: 40 },
      { ...building, id: 'large', idc: 700, area: 5000, carbonIntensity: 40 },
    ];
    expect(assessPortfolio(samples, FIXED)[0]?.building.id).toBe('large');
  });

  it('les cumuls incluent chaque bâtiment une fois et excluent la surveillance', () => {
    const portfolio = assessPortfolio(createDemoBuildings(), FIXED);
    const now = selectProgram(portfolio, 0, null);
    const five = selectProgram(portfolio, 5, null);
    const ten = selectProgram(portfolio, 10, null);
    expect(five.length).toBeGreaterThanOrEqual(now.length);
    expect(ten.length).toBeGreaterThanOrEqual(five.length);
    expect(new Set(ten.map((item) => item.building.id)).size).toBe(ten.length);
    expect(ten.every((item) => item.cohort !== 'safe')).toBe(true);
    expect(programMetrics(ten, FIXED).cost).toBeGreaterThanOrEqual(programMetrics(five, FIXED).cost);
  });

  it('une catégorie remplace le cumul, quel que soit l’horizon actif', () => {
    const portfolio = assessPortfolio(createDemoBuildings(), FIXED);
    const selected = selectProgram(portfolio, 0, 'ten');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => item.cohort === 'ten')).toBe(true);
    expect(selectProgram(portfolio, 10, 'ten')).toEqual(selected);
  });
});

describe('Rénovation et indicateurs', () => {
  it('calcule le coût comme la somme des mesures, avec PAC pour un chauffage fossile', () => {
    const result = renovationFor({ ...building, condition: 0.6 }, BASE_YEAR + 5, FIXED);
    const plan = planRenovation(building);
    expect(plan.heatPump).toBe(true);
    expect(plan.measures.map((m) => m.id)).toEqual(['facade', 'toit', 'cave', 'fenetres', 'pac', 'pv']);
    expect(result.depth).toBe('complete');
    expect(result.cost).toBeCloseTo(plan.measures.reduce((sum, m) => sum + m.cost, 0));
    expect(result.cost).toBe(result.plan.capex);
    // École : 40 % de vitrage, façade opaque = 60 % de la façade brute (1 m²/m² SRE).
    expect(plan.measures.find((m) => m.id === 'facade')!.cost).toBeCloseTo(0.6 * 1000 * 200);
    expect(result.idcAfter).toBeLessThan(building.idc);
    expect(result.carbonAfter).toBeLessThan(building.carbonIntensity);
    expect(result.carbonSaved).toBeCloseTo((5 - result.carbonAfter) * 1000 / 1000);
    expect(result.conditionBefore).toBeCloseTo(conditionAt({ ...building, condition: 0.6 }, BASE_YEAR + 5));
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

  it('raccorde au CAD un chauffage fossile si le CAD est dans la rue, au lieu de la PAC', () => {
    const plan = planRenovation({ ...building, carbonIntensity: 22, cadAvailable: true });
    expect(plan.districtHeating).toBe(true);
    expect(plan.heatPump).toBe(false);
    expect(plan.measures.map((m) => m.id)).toEqual(['facade', 'toit', 'cave', 'fenetres', 'cad']);
    expect(plan.measures.find((m) => m.id === 'cad')!.cost).toBeCloseTo(districtHeatingCost(plan.powerKw));
    // IDC et CO₂ selon les conventions du CAD : 3.89 MJ par kWh de chaleur livrée, facteur d'émission du réseau.
    expect(plan.after.idc).toBeCloseTo(plan.after.finalKwh / building.area * 3.89);
    expect(plan.after.carbon).toBeCloseTo(plan.after.finalKwh / building.area * CARRIERS['CAD']!.emission);
    expect(plan.pv.reason).toContain('CAD');
    expect(districtHeatingCost(10)).toBeCloseTo(30_800);
  });

  it('conserve un système de chauffage non fossile, même si le CAD est dans la rue', () => {
    for (const heating of ['CAD', 'Pompe à chaleur', 'Bois / biogaz', 'Électrique'] as const) {
      const plan = planRenovation({ ...building, heating, cadAvailable: true });
      expect(plan.heatPump).toBe(false);
      expect(plan.districtHeating).toBe(false);
      expect(plan.measures.some((m) => m.id === 'pac' || m.id === 'cad')).toBe(false);
    }
  });

  it('calcule l’IDC selon l’OCEN : électricité de PAC pondérée par 3.25, énergie finale sinon', () => {
    const plan = planRenovation(building);
    expect(plan.before.idc).toBeCloseTo(building.idc);
    expect(plan.after.idc).toBeCloseTo(plan.after.finalKwh / building.area * 11.7);
    // Enveloppe seule sur un bâtiment gaz : IDC = énergie finale × 3.6.
    const envelope = planRenovation(building, new Set(['facade', 'toit', 'cave', 'fenetres']));
    expect(envelope.after.idc).toBeCloseTo(envelope.after.finalKwh / building.area * 3.6);
    // PAC existante : l'IDC déclaré vaut déjà électricité × 11.7.
    const existing = planRenovation({ ...building, heating: 'Pompe à chaleur' }, new Set());
    expect(existing.before.finalKwh).toBeCloseTo(building.idc / 11.7 * building.area);
    expect(existing.after.idc).toBeCloseTo(building.idc);
    expect(HEAT_PUMP_COP).toBeLessThan(3.25);
  });

  it('calcule le CO₂ scope 1 + 2 de chaque bâtiment réel depuis l’IDC et son agent, sans valeur officielle', () => {
    expect(BUILDINGS.length).toBeGreaterThan(0);
    for (const item of BUILDINGS) {
      expect(item.carbonIntensity).toBeCloseTo(carbonFromIdc(item.idc, item.heating), 0);
      expect(item.imputed?.includes('carbon')).toBe(item.imputed?.includes('idc') || item.heating === 'Inconnu');
    }
  });

  it('déduit l’intensité carbone du système de chauffage et du facteur d’émission de son agent', () => {
    expect(carbonFromIdc(360, 'Gaz')).toBeCloseTo(100 * 0.198);
    expect(carbonFromIdc(389, 'CAD')).toBeCloseTo(100 * CARRIERS['CAD']!.emission);
    expect(carbonFromIdc(1170, 'Pompe à chaleur')).toBeCloseTo(100 * ELECTRICITY_EMISSION);
    expect(carbonFromIdc(360, 'Inconnu')).toBeCloseTo(carbonFromIdc(360, 'Gaz'));
  });

  it('associe un carbone gris à chaque mesure et l’amortit sur sa durée de vie', () => {
    const plan = planRenovation(building);
    const of = (id: string) => plan.measures.find((m) => m.id === id)!;
    // Façade : U 1.0 → 0.20, soit 14 cm d'EPS à 20 kg/m³ et 7.6 kgCO₂e/kg sur 600 m² (École : 40 % de vitrage).
    expect(insulationEmbodied(1.0, 0.2)).toBeCloseTo(0.035 * 4 * 20 * 7.6);
    expect(of('facade').embodiedCarbon).toBeCloseTo(600 * 0.035 * 4 * 20 * 7.6);
    expect(of('fenetres').embodiedCarbon).toBeCloseTo(400 * (65.7 + 78.3 * 0.7));
    expect(of('pac').embodiedCarbon).toBeCloseTo(plan.powerKw * 4000 / 7);
    expect(of('pv').embodiedCarbon).toBeCloseTo(of('pv').quantity * EMBODIED.pvPerKwc);
    expect(plan.embodied.total).toBeCloseTo(plan.measures.reduce((sum, m) => sum + m.embodiedCarbon, 0));
    expect(plan.embodied.annual).toBeCloseTo(plan.measures.reduce((sum, m) => sum + m.embodiedCarbon / m.lifetime, 0));
    expect(plan.embodied.perM2Year).toBeCloseTo(plan.embodied.annual / building.area);
    const recommended = renovationFor(building, BASE_YEAR, FIXED);
    expect(recommended.embodiedCarbon).toBeCloseTo(recommended.plan.embodied.total / 1000);
    expect(planRenovation(building, new Set()).embodied).toEqual({ total: 0, annual: 0, perM2Year: 0 });
    expect(planRenovation(building, new Set(['pac'])).embodied.total).toBeCloseTo(of('pac').embodiedCarbon);
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

  it('calcule la plus-value : dépréciation regagnée sur la part du coût des mesures préservant la valeur', () => {
    expect(valueUpliftFactor(1)).toBe(0);
    expect(valueUpliftFactor(0.7)).toBeCloseTo(0.3);
    expect(valueUpliftFactor(0.4)).toBeCloseTo(0.6);
    expect(valueUpliftFactor(-0.1)).toBe(1);
    expect(valueUpliftFactor(1.2)).toBe(0);

    const full = planRenovation(building, undefined, 0.7);
    const share = (m: { id: string; category: 'enveloppe' | 'equipement' }) => m.id === 'pv' ? 0 : VALUE_UPLIFT.preservingShare[m.category];
    const replaced = full.measures.filter((m) => m.included).reduce((sum, m) => sum + m.cost * share(m), 0);
    expect(full.value.replaced).toBeCloseTo(replaced);
    expect(full.value.replaced).toBeLessThan(full.capex);
    expect(full.value.gain).toBeCloseTo(replaced * 0.3);
    expect(full.value.annual).toBeCloseTo(full.value.gain * annuity(VALUE_UPLIFT.years));
    expect(full.before.valueGain).toBe(0);
    expect(full.after.valueGain).toBeCloseTo(full.value.annual);
    expect(planRenovation(building, undefined, 0.3).value.gain).toBeGreaterThan(full.value.gain);
    expect(planRenovation(building, undefined, 1).value.gain).toBe(0);

    const partial = planRenovation(building, new Set(['facade', 'pac']), 0.7);
    const facade = partial.measures.find((m) => m.id === 'facade')!, pac = partial.measures.find((m) => m.id === 'pac')!;
    expect(partial.value.gain).toBeCloseTo((facade.cost * VALUE_UPLIFT.preservingShare.enveloppe + pac.cost * VALUE_UPLIFT.preservingShare.equipement) * 0.3);
    expect(planRenovation(building, new Set(), 0.7).value.gain).toBe(0);
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
    expect(before.energyCost).toBeCloseTo(400 / 3.6 * 1000 * energyPrice('Gaz'));
    expect(energyPrice('Gaz')).toBeCloseTo(0.109);
    expect(energyPrice('Mazout')).toBeCloseTo(0.112);
    expect(energyPrice('Électrique')).toBeCloseTo(0.275 * ELECTRICITY_PRICE_FACTOR);
  });

  it('pondère les moyennes par surface sur le même périmètre avant/après', () => {
    const samples = [
      { ...building, id: 'one', area: 100, idc: 700, condition: 0.4, carbonIntensity: 50 },
      { ...building, id: 'two', area: 900, idc: 400, condition: 0.3, carbonIntensity: 20 },
    ];
    const assessments = assessPortfolio(samples, FIXED);
    const metrics = programMetrics(assessments, FIXED);
    const after = samples.map((sample) => renovationFor(sample, BASE_YEAR, FIXED).idcAfter * sample.area);
    expect(metrics.count).toBe(2);
    expect(metrics.area).toBe(1000);
    expect(metrics.idcBefore).toBeCloseTo(430);
    expect(metrics.idcAfter).toBeCloseTo((after[0]! + after[1]!) / 1000);
    expect(metrics.conditionBefore).toBeCloseTo(0.31);
    expect(metrics.conditionAfter).toBeCloseTo(1);
    expect(metrics.carbonBefore).toBeCloseTo(23);
    expect(metrics.carbonSaved).toBeCloseTo(assessments.reduce((sum, item) => sum + renovationFor(item.building, BASE_YEAR, FIXED).carbonSaved, 0));
  });

  it('renvoie un programme vide sans NaN et sans travaux pour les bâtiments verts', () => {
    const safe = assessBuilding(building, FIXED);
    const empty = programMetrics([], FIXED);
    expect(Object.values(empty).every(Number.isFinite)).toBe(true);
    expect(programMetrics([safe], FIXED)).toEqual(empty);
  });

  it('calcule les moyennes sur tout le parc en conservant les bâtiments sans travaux', () => {
    const renovated = { ...building, id: 'works', area: 100, idc: 700, condition: 0.4, carbonIntensity: 50 };
    const untouched = { ...building, id: 'unchanged', area: 900, idc: 200, condition: 0.9, carbonIntensity: 5 };
    const program = [assessBuilding(renovated, FIXED)];
    const renovation = renovationFor(renovated, BASE_YEAR, FIXED);
    const metrics = programMetrics(program, FIXED, DASHBOARD_LAST_YEAR, [renovated, untouched]);
    expect(metrics).toMatchObject({ count: 1, area: 100, portfolioCount: 2, portfolioArea: 1000 });
    expect(metrics.idcBefore).toBeCloseTo(250);
    expect(metrics.idcAfter).toBeCloseTo((renovation.idcAfter * 100 + 200 * 900) / 1000);
    expect(metrics.conditionBefore).toBeCloseTo(0.85);
    expect(metrics.conditionAfter).toBeCloseTo((renovation.conditionAfter * 100 + 0.9 * 900) / 1000);
    expect(metrics.cost).toBeCloseTo(renovation.cost);
    expect(metrics.carbonSaved).toBeCloseTo(renovation.carbonSaved);
    expect(metrics.carbonReduction).toBeCloseTo(renovation.carbonSaved / 9.5);
  });

  it('affiche les moyennes du parc sans gain quand la sélection est vide ou sous surveillance', () => {
    const stock = [{ ...building, annualDecay: 0 }];
    const empty = programMetrics([], FIXED, DASHBOARD_LAST_YEAR, stock);
    expect(empty).toMatchObject({
      count: 0, cost: 0, carbonSaved: 0, carbonReduction: 0, portfolioCount: 1,
      idcBefore: 400, idcAfter: 400, conditionBefore: 0.9, conditionAfter: 0.9,
    });
    const safe = assessBuilding(stock[0]!, FIXED);
    expect(safe.cohort).toBe('safe');
    expect(programMetrics([safe], FIXED, DASHBOARD_LAST_YEAR, stock)).toEqual(empty);
    expect(Object.values(programMetrics([], FIXED, DASHBOARD_LAST_YEAR, [])).every(Number.isFinite)).toBe(true);
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
    const portfolio = assessPortfolio(createDemoBuildings(), FIXED);
    expect(new Set(portfolio.map((item) => item.cohort))).toEqual(new Set(['now', 'five', 'ten', 'safe']));
  });

  it('ne modifie ni les bâtiments ni les stratégies lors des calculs', () => {
    const data = createDemoBuildings();
    const before = JSON.stringify({ data, preset: FIXED });
    programMetrics(assessPortfolio(data, FIXED), FIXED);
    expect(JSON.stringify({ data, preset: FIXED })).toBe(before);
  });

  it.each([
    { idc: 0, condition: 0.5, carbon: 20 },
    { idc: 600, condition: -0.1, carbon: 20 },
    { idc: 600, condition: 1.1, carbon: 20 },
    { idc: 600, condition: 0.5, carbon: NaN },
  ])('refuse les seuils invalides %o avec une erreur explicite', (thresholds) => {
    expect(() => validateStrategy({ ...FIXED, thresholds })).toThrow('Seuils invalides');
  });

  it.each([BASE_YEAR, TARGET_YEAR + 1, BASE_YEAR + 1.5])('refuse un changement à une année invalide %s', (year) => {
    expect(() => validateStrategy({
      ...FIXED, changes: [{ year, thresholds: PRESETS.ambitious.thresholds }],
    })).toThrow('année distincte');
  });

  it.each([BASE_YEAR + 1, BASE_YEAR + 11, TARGET_YEAR])('accepte un changement en %s', (year) => {
    expect(() => validateStrategy({ ...FIXED, changes: [{ year, thresholds: PRESETS.ambitious.thresholds }] })).not.toThrow();
  });

  it('refuse deux changements pour la même année', () => {
    const change = { year: BASE_YEAR + 4, thresholds: PRESETS.ambitious.thresholds };
    expect(() => validateStrategy({ ...FIXED, changes: [change, change] })).toThrow('année distincte');
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
describe('Part vitrée selon l’affectation', () => {
  const housing = { ...building, use: 'Logement' as const };
  const office = { ...building, use: 'Administration' as const };
  const of = (b: Building, id: string) => planRenovation(b).measures.find((m) => m.id === id)!;

  it('garde une façade brute de 1 m²/m² SRE et répartit fenêtres et mur selon l’affectation', () => {
    expect(ELEMENT_RATIO.grossFacade).toBe(1);
    expect(WINDOW_SHARE['Logement']).toBe(0.2);
    expect(WINDOW_SHARE['Administration']).toBe(0.6);
    expect(windowShareFor('Usage inconnu')).toBe(0.3);
    expect(windowShareFor('École')).toBe(windowShareFor('Éducation'));
    for (const use of [...Object.keys(WINDOW_SHARE), 'Usage inconnu']) {
      const ratios = elementRatios(use);
      expect(ratios.facade + ratios.fenetres).toBeCloseTo(1);
      expect(ratios.toit).toBe(0.33);
      expect(ratios.cave).toBe(0.33);
    }
    for (const b of [housing, office]) expect(of(b, 'facade').quantity + of(b, 'fenetres').quantity).toBeCloseTo(1000);
  });

  it('dimensionne quantités, coûts, économies et carbone gris de la façade et des fenêtres', () => {
    expect(of(housing, 'fenetres').quantity).toBeCloseTo(200);
    expect(of(office, 'fenetres').quantity).toBeCloseTo(600);
    expect(of(housing, 'facade').quantity).toBeCloseTo(800);
    expect(of(office, 'facade').quantity).toBeCloseTo(400);
    expect(of(office, 'fenetres').cost).toBeCloseTo(600 * 1000);
    expect(of(housing, 'fenetres').cost).toBeCloseTo(200 * 1000);
    expect(of(office, 'facade').cost).toBeCloseTo(400 * 200);
    expect(of(office, 'fenetres').usefulSaving / of(housing, 'fenetres').usefulSaving).toBeCloseTo(3);
    expect(of(office, 'facade').usefulSaving / of(housing, 'facade').usefulSaving).toBeCloseTo(0.5);
    expect(of(office, 'fenetres').embodiedCarbon).toBeCloseTo(600 * EMBODIED.windowPerM2);
    expect(of(office, 'facade').embodiedCarbon / of(housing, 'facade').embodiedCarbon).toBeCloseTo(0.5);
    // Toit et cave ne dépendent pas de l'affectation.
    expect(of(office, 'toit').cost).toBeCloseTo(of(housing, 'toit').cost);
    expect(of(office, 'fenetres').detail).toContain('60 % de la façade');
    expect(of(housing, 'fenetres').detail).toContain('20 % de la façade');
    expect(of(building, 'fenetres').detail).toContain('hypothèse modèle');
  });
});

describe('Profondeur de rénovation selon la vétusté', () => {
  const stable = { ...building, annualDecay: 0 };

  it('choisit une rénovation complète sous 0,7 d’état', () => {
    expect(DEEP_RENOVATION_CONDITION).toBe(0.7);
    const result = renovationFor({ ...stable, condition: 0.69 }, BASE_YEAR, FIXED);
    expect(result).toMatchObject({ depth: 'complete', reason: 'condition', conditionAfter: 1 });
    expect([...result.selection]).toEqual([...MEASURE_IDS]);
    expect(result.plan.measures.find((m) => m.id === 'facade')!.included).toBe(true);
  });

  it('choisit une rénovation énergétique sans façade ni fenêtres si l’état est bon et que les seuils sont tenus', () => {
    const result = renovationFor({ ...stable, condition: 0.9 }, BASE_YEAR, FIXED);
    expect(result).toMatchObject({ depth: 'energy', reason: null, residual: null, energyBreach: null });
    expect(result.selection).toEqual(packageFor('energy'));
    const included = result.plan.measures.filter((m) => m.included).map((m) => m.id);
    expect(included).toEqual(['toit', 'cave', 'pac', 'pv']);
    expect(result.conditionBefore).toBeCloseTo(0.9);
    expect(result.conditionAfter).toBeCloseTo(0.9);
    expect(result.cost).toBeLessThan(planRenovation(stable).capex);
    // Le photovoltaïque garde sa taille, même sans façade ni fenêtres.
    expect(result.plan.pv.kwc).toBeCloseTo(planRenovation(stable).pv.kwc);
    expect(result.idcAfter).toBeLessThanOrEqual(FIXED.thresholds.idc);
  });

  it('escalade en rénovation complète si le paquet énergétique ne tient pas un seuil plus tardif', () => {
    const strategy: Strategy = { ...FIXED, changes: [{ year: BASE_YEAR + 5, thresholds: { idc: 400, condition: 0.5, carbon: 20 } }] };
    const district = { ...stable, condition: 0.9, heating: 'CAD' as const, idc: 500, carbonIntensity: carbonFromIdc(500, 'CAD') };
    const result = renovationFor(district, BASE_YEAR, strategy);
    expect(result).toMatchObject({ depth: 'complete', reason: 'thresholds', conditionAfter: 1 });
    expect(result.energyBreach).toMatchObject({ year: BASE_YEAR + 5, criteria: ['idc'] });
    expect(result.plan.measures.find((m) => m.id === 'fenetres')!.included).toBe(true);
    // Hors de la fenêtre de vérification, le seuil de BASE_YEAR + 5 ne compte pas : rénovation énergétique.
    expect(renovationFor(district, BASE_YEAR, strategy, BASE_YEAR + 4).depth).toBe('energy');
  });

  it('utilise le paquet recommandé dans les indicateurs du programme', () => {
    const sample = { ...stable, condition: 0.9, carbonIntensity: 30 };
    const assessment = assessBuilding(sample, FIXED);
    expect(assessment.cohort).toBe('now');
    const recommended = renovationFor(sample, BASE_YEAR, FIXED);
    expect(recommended.depth).toBe('energy');
    const metrics = programMetrics([assessment], FIXED);
    expect(metrics.cost).toBeCloseTo(recommended.cost);
    expect(metrics.cost).toBeLessThan(planRenovation(sample).capex);
    expect(metrics.carbonSaved).toBeCloseTo(recommended.carbonSaved);
    expect(metrics.conditionAfter).toBeCloseTo(0.9);
  });
});

describe('Échéances au-delà de 2036 et vérification après travaux', () => {
  const late = { ...building, idc: 400, carbonIntensity: 3, condition: 0.95, annualDecay: 0.01 };

  it('laisse en gris, sans travaux, un bâtiment qui dépasse un seuil en 2040 et indique cette année', () => {
    const assessment = assessBuilding(late, PRESETS.ambitious);
    expect(assessment).toMatchObject({ cohort: 'safe', dueYear: 2040, triggers: ['idc'] });
    expect(describeDue(assessment)).toBe('premier dépassement en 2040 : IDC > 340');
    expect(COHORTS.safe.label).toContain(String(DASHBOARD_LAST_YEAR));
    expect(inDashboardProgram(assessment)).toBe(false);
    const portfolio = assessPortfolio([late, { ...building, idc: 700 }], PRESETS.ambitious);
    expect(selectProgram(portfolio, 10, null).every(inDashboardProgram)).toBe(true);
    const safe = selectProgram(portfolio, 0, 'safe');
    expect(safe).toHaveLength(1);
    expect(programMetrics(safe, PRESETS.ambitious)).toMatchObject({ count: 0, cost: 0, area: 0, carbonSaved: 0 });
  });

  it('compare l’après-travaux aux seuils les plus stricts de la fenêtre et nomme l’année et le critère', () => {
    const strategy: Strategy = {
      ...FIXED,
      changes: [
        { year: BASE_YEAR + 3, thresholds: { idc: 450, condition: 0.5, carbon: 20 } },
        { year: BASE_YEAR + 6, thresholds: { idc: 700, condition: 0.5, carbon: 4 } },
      ],
    };
    const after = { idc: 500, carbon: 5 };
    expect(firstBreachAfterWorks(building, after, 'complete', strategy, BASE_YEAR, BASE_YEAR + 2)).toBeNull();
    expect(firstBreachAfterWorks(building, after, 'complete', strategy, BASE_YEAR, DASHBOARD_LAST_YEAR))
      .toMatchObject({ year: BASE_YEAR + 3, criteria: ['idc'] });
    // Le seuil assoupli ne masque pas le dépassement CO₂ plus tardif.
    expect(firstBreachAfterWorks(building, { idc: 400, carbon: 5 }, 'complete', strategy, BASE_YEAR, DASHBOARD_LAST_YEAR))
      .toMatchObject({ year: BASE_YEAR + 6, criteria: ['carbon'] });
    // Après une rénovation énergétique, l'état continue de se dégrader.
    expect(firstBreachAfterWorks({ ...building, condition: 0.72, annualDecay: 0.03 }, { idc: 0, carbon: 0 }, 'energy', FIXED, BASE_YEAR, DASHBOARD_LAST_YEAR))
      .toMatchObject({ criteria: ['condition'] });
    expect(firstBreachAfterWorks({ ...building, condition: 0.72, annualDecay: 0.03 }, { idc: 0, carbon: 0 }, 'complete', FIXED, BASE_YEAR, DASHBOARD_LAST_YEAR)).toBeNull();
    const heavy = { ...building, condition: 0.6, idc: 900, heating: 'CAD' as const, carbonIntensity: carbonFromIdc(900, 'CAD') };
    const result = renovationFor(heavy, BASE_YEAR, strategy);
    expect(result.residual).not.toBeNull();
    expect(result.residual).toEqual(firstBreachAfterWorks(heavy, result.plan.after, result.depth, strategy, BASE_YEAR, DASHBOARD_LAST_YEAR));
  });
});
