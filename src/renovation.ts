/**
 * Modèle de rénovation par mesures, calé sur docs/renovation/ (parametres_renovation.md/.csv).
 * Les références entre crochets renvoient aux `source_id` de docs/renovation/sources.csv.
 * Tout ce qui n'est pas sourcé est marqué « hypothèse modèle ».
 */
import type { Building } from './model';

/** Coût social du carbone, demandé par le projet (CHF par tonne de CO₂e). */
export const SOCIAL_CARBON_COST = 200;
/** Taux d'actualisation réel [LICS2022 ; HFM2015] pour annualiser les investissements. */
export const DISCOUNT_RATE = 0.03;
/** Degrés-jours genevois normalisés (base 18/12) : Cght = 2659 × 24 / 1000 [KHOURY2016]. */
const CGHT = 2659 * 24 / 1000;
/** Part d'ECS (kWh utile/m² SRE·an), mesures 12-15 et SIA 380/1 EFH 14 [LICS2022 §5.5]. */
const HOT_WATER_KWH_M2 = 14;
/** Part des économies théoriques réellement réalisée : ~50 % pour 350 MJ/m²·a visés [KHOURY2016 ; COZZA2020]. */
export const REALIZED_SHARE = 0.5;
/** Plafond de réduction du besoin de chauffage par l'enveloppe (hypothèse modèle). */
const MAX_ENVELOPE_SHARE = 0.7;
/** COP annuel PAC air/eau à 55 °C [LICS2022 Tab. 7]. */
export const HEAT_PUMP_COP = 2.8;

/** Surface d'élément par m² de SRE (hypothèse modèle : aucune surface d'élément dans les données). */
export const ELEMENT_RATIO = { facade: 0.8, toit: 0.33, cave: 0.33, fenetres: 0.2 } as const;

/** Rendement du système existant [HFM2015 Tab. 11 ; LICS2022 Tab. 7-8]. */
const EFFICIENCY: Record<string, number> = {
  'Gaz': 0.85, 'Mazout': 0.80, 'Gaz + mazout': 0.83, 'CAD': 0.95, 'Pompe à chaleur': HEAT_PUMP_COP,
  'Électrique': 1, 'Bois / biogaz': 0.80, 'Inconnu': 0.85,
};
/** Prix de l'énergie finale en CHF/kWh [LICS2022 Tab. 11, prix 2020, taxe CO₂ de 96 CHF/t incluse]. */
const PRICE: Record<string, number> = {
  'Gaz': 0.09, 'Mazout': 0.12, 'Gaz + mazout': 0.105, 'CAD': 0.088, 'Pompe à chaleur': 0.237,
  'Électrique': 0.237, 'Bois / biogaz': 0.09, 'Inconnu': 0.09,
};
/** Facteur d'émission direct de l'électricité du réseau [HFM2015 Tab. 6]. */
export const ELECTRICITY_EMISSION = 0.024;
/** Photovoltaïque en toiture [SWISSOLAR2024] : 2 400 CHF/kWc (10-30 kWc, prix 2023), productible 1 050 kWh/kWc·an, 25 ans, entretien ~3 ct/kWh. */
export const PV = {
  costPerKwc: 2400, yield: 1050, lifetime: 25, maintenance: 0.03,
  /** Densité d'installation, ~5 m² par kWc (hypothèse modèle). */
  kwcPerM2: 0.2,
  /** Part de toiture utilisable si l'OCEN ne la fournit pas (médiane du parc, hypothèse modèle). */
  defaultRoofShare: 0.48,
  minKwc: 0.5,
};
/** Loyers : 1 année de loyers perdue pendant les travaux, répartie sur 30 ans ; hausse de loyer pour le confort (hypothèse modèle). */
export const RENT = { lossYears: 1, spreadYears: 30, comfortUplift: 0.10 };
const ELECTRIC_HEATING = new Set(['Pompe à chaleur', 'Électrique']);
const FOSSIL_OR_UNKNOWN = new Set(['Gaz', 'Mazout', 'Gaz + mazout', 'Inconnu']);

interface EnvelopeSpec {
  id: 'facade' | 'toit' | 'cave' | 'fenetres';
  label: string;
  u0: number; u1: number;
  /** Facteurs de réduction contre terre avant/après [HFM2015 Tab. 5]. */
  f0: number; f1: number;
  unitCost: number;
  lifetime: number;
  source: string;
}
const ENVELOPE: EnvelopeSpec[] = [
  { id: 'facade', label: 'Isolation de la façade (ITE crépie)', u0: 1.0, u1: 0.20, f0: 1, f1: 1, unitCost: 200, lifetime: 50,
    source: 'LICS2022 Tab. 18 (200 CHF/m², 2020) ; U : HFM2015 Tab. 5 ; durée : STREICHER2020' },
  { id: 'toit', label: 'Isolation de la toiture', u0: 0.6, u1: 0.20, f0: 1, f1: 1, unitCost: 250, lifetime: 40,
    source: 'LICS2022 Tab. 18 (toit plat 250 CHF/m²) ; U : HFM2015 Tab. 5 ; durée : STREICHER2020' },
  { id: 'cave', label: 'Isolation plafond de cave / sol', u0: 1.0, u1: 0.25, f0: 0.42, f1: 0.69, unitCost: 120, lifetime: 50,
    source: 'LICS2022 Tab. 18 (100-140 CHF/m², milieu) ; U et f : HFM2015 Tab. 5 ; durée : STREICHER2020' },
  { id: 'fenetres', label: 'Remplacement des fenêtres', u0: 2.2, u1: 1.0, f0: 1, f1: 1, unitCost: 1000, lifetime: 30,
    source: 'LICS2022 Tab. 18 et 28 (830-1200 CHF/m², milieu ; U 2.20 → 1.0) ; NAEGELI2020 ; durée : STREICHER2020' },
];
/** Isolation intérieure des bâtiments protégés (proxy) : 91.1 + 2.60 CHF/m² par cm, 12 cm [STREICHER2020 Tab. 3, `proxy`]. */
const INTERIOR_INSULATION_COST = 91.1 + 2.6 * 12;

/** Production de chaleur PAC air/eau, changement de système, kCHF par puissance [LICS2022 Annexe 11.1, Fig. 47, lecture graphique]. */
const HEAT_PUMP_COST: [number, number][] = [[5, 47.9], [10, 52.7], [20, 72.8], [70, 185.6], [100, 284.5], [200, 641.1]];
const HEAT_PUMP_LIFETIME = 15; // [HFM2015 Tab. 10]

export function heatPumpCost(kw: number) {
  const points = HEAT_PUMP_COST;
  if (kw <= points[0]![0]) return points[0]![1] * 1000;
  const last = points[points.length - 1]!;
  if (kw >= last[0]) return last[1] * 1000 * kw / last[0];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (kw <= x1) return (y0 + (y1 - y0) * (kw - x0) / (x1 - x0)) * 1000;
  }
  return last[1] * 1000;
}
/** Puissance spécifique (W/m² SRE) selon la consommation finale, courbe médiane [LICS2022 Tab. 9 ; proxy hors résidentiel]. */
export const specificPower = (kwhPerM2: number) => 13 + 0.2267 * kwhPerM2;
export const annuity = (years: number, rate = DISCOUNT_RATE) => rate / (1 - (1 + rate) ** -years);

export type MeasureCategory = 'enveloppe' | 'equipement';

export interface Measure {
  id: string;
  category: MeasureCategory;
  label: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
  lifetime: number;
  annualCost: number;
  /** Économie théorique de chaleur utile, avant effet de réalisation et plafonnement (kWh/an). */
  usefulSaving: number;
  source: string;
  proxy?: boolean;
}

export interface Side {
  /** IDC en MJ/m²/an. */
  idc: number;
  /** kgCO₂e/m²/an. */
  carbon: number;
  /** Énergie finale (kWh/an). */
  finalKwh: number;
  energyCost: number;
  carbonCost: number;
  /** Investissements annualisés : enveloppe thermique, équipements techniques, et somme des deux. */
  envelopeCost: number;
  equipmentCost: number;
  renovationCost: number;
  /** Énergie + rénovation + carbone (hors loyers). */
  total: number;
  /** Loyers : manque à gagner annualisé (≥ 0) et hausse de loyer annuelle (≥ 0). */
  rentLoss: number;
  rentGain: number;
}

export interface RenovationPlan {
  measures: Measure[];
  capex: number;
  before: Side;
  after: Side;
  heatPump: boolean;
  powerKw: number;
  pv: { kwc: number; production: number; blocked: boolean; reason: string | null };
  rent: { base: number; loss: number; gain: number; net: number };
}

interface SideInput {
  finalKwhPerM2: number; carbon: number; heating: string;
  envelopeCost?: number; equipmentCost?: number; pvKwh?: number; rentLoss?: number; rentGain?: number;
}
function sideCosts(building: Building, input: SideInput): Side {
  const { finalKwhPerM2, carbon, heating, envelopeCost = 0, equipmentCost = 0, pvKwh = 0, rentLoss = 0, rentGain = 0 } = input;
  const finalKwh = finalKwhPerM2 * building.area;
  const price = PRICE[heating] ?? 0.09;
  // L'électricité photovoltaïque autoconsommée remplace des imports (prix du réseau) moyennant l'entretien.
  const energyCost = (finalKwh - pvKwh) * price + pvKwh * PV.maintenance;
  const carbonCost = carbon * building.area / 1000 * SOCIAL_CARBON_COST;
  const renovationCost = envelopeCost + equipmentCost;
  return {
    idc: finalKwhPerM2 * 3.6, carbon, finalKwh, energyCost, carbonCost, envelopeCost, equipmentCost, renovationCost,
    total: energyCost + carbonCost + renovationCost, rentLoss, rentGain,
  };
}

export function planRenovation(building: Building): RenovationPlan {
  const area = building.area;
  const finalBefore = building.idc / 3.6;
  const efficiency = EFFICIENCY[building.heating] ?? 0.85;
  const usefulBefore = finalBefore * efficiency;
  const protectedBuilding = !!building.protection && building.protection !== 'none';

  const measures: Measure[] = [];
  let theoreticalSaving = 0; // kWh utile / m² SRE
  for (const spec of ENVELOPE) {
    const interior = spec.id === 'facade' && protectedBuilding;
    const quantity = ELEMENT_RATIO[spec.id] * area;
    const unitCost = interior ? INTERIOR_INSULATION_COST : spec.unitCost;
    const saving = (spec.f0 * spec.u0 - spec.f1 * spec.u1) * CGHT * ELEMENT_RATIO[spec.id];
    theoreticalSaving += saving;
    const cost = quantity * unitCost;
    measures.push({
      id: spec.id, category: 'enveloppe',
      label: interior ? 'Isolation intérieure de la façade (bâtiment protégé)' : spec.label,
      quantity, unit: 'm²', unitCost, cost, lifetime: spec.lifetime, annualCost: cost * annuity(spec.lifetime),
      usefulSaving: saving * area,
      source: interior ? 'STREICHER2020 Tab. 3 (isolation intérieure du sol, 12 cm) — proxy' : spec.source,
      proxy: interior,
    });
  }
  const spaceHeating = Math.max(0, usefulBefore - HOT_WATER_KWH_M2);
  const envelopeSaving = Math.min(MAX_ENVELOPE_SHARE * spaceHeating, REALIZED_SHARE * theoreticalSaving);
  const usefulAfter = usefulBefore - envelopeSaving;

  const heatPump = FOSSIL_OR_UNKNOWN.has(building.heating);
  const powerKw = specificPower(finalBefore) * area / 1000;
  if (heatPump) {
    const cost = heatPumpCost(powerKw);
    measures.push({
      id: 'pac', category: 'equipement', label: 'Pompe à chaleur air/eau (remplacement de la chaudière)', quantity: powerKw, unit: 'kW',
      unitCost: cost / powerKw, cost, lifetime: HEAT_PUMP_LIFETIME, annualCost: cost * annuity(HEAT_PUMP_LIFETIME),
      usefulSaving: 0,
      source: 'LICS2022 Annexe 11.1 Fig. 47 (changement de système, interpolation) ; puissance : LICS2022 Tab. 9 ; durée : HFM2015 Tab. 10',
    });
  }

  const finalAfter = heatPump ? usefulAfter / HEAT_PUMP_COP : usefulAfter / efficiency;
  const heatingAfter = heatPump ? 'Pompe à chaleur' : building.heating;
  const electrified = heatPump || ELECTRIC_HEATING.has(building.heating);

  // Photovoltaïque : dimensionné pour couvrir au plus l'électricité de chauffage ; impossible sur un bâtiment protégé.
  const electricAfter = electrified ? finalAfter * area : 0;
  const roofShare = building.solarShare ?? PV.defaultRoofShare;
  const capacityKwc = ELEMENT_RATIO.toit * area * roofShare * PV.kwcPerM2;
  let kwc = Math.min(capacityKwc, electricAfter / PV.yield);
  let reason: string | null = null;
  if (protectedBuilding) { kwc = 0; reason = 'Bâtiment protégé (patrimoine) : panneaux photovoltaïques non installables.'; }
  else if (!electrified) reason = 'Pas d’électrification du chauffage : pas de photovoltaïque simulé.';
  else if (kwc < PV.minKwc) { kwc = 0; reason = 'Toiture trop petite pour une installation photovoltaïque.'; }
  const pvKwh = kwc * PV.yield;
  if (kwc > 0) {
    const cost = kwc * PV.costPerKwc;
    measures.push({
      id: 'pv', category: 'equipement', label: 'Panneaux photovoltaïques en toiture', quantity: kwc, unit: 'kWc',
      unitCost: PV.costPerKwc, cost, lifetime: PV.lifetime, annualCost: cost * annuity(PV.lifetime), usefulSaving: 0,
      source: 'SWISSOLAR2024 diapo 8 (2 400 CHF/kWc, prix 2023, hors rétribution) ; productible 1 050 kWh/kWc ; durée 25 ans',
    });
  }

  const carbonAfter = electrified
    ? Math.max(0, finalAfter - pvKwh / area) * ELECTRICITY_EMISSION
    : (finalBefore > 0 ? building.carbonIntensity * finalAfter / finalBefore : 0);

  const capex = measures.reduce((sum, m) => sum + m.cost, 0);
  const annual = (category: MeasureCategory) => measures.filter((m) => m.category === category).reduce((sum, m) => sum + m.annualCost, 0);

  const base = building.rentResidential ?? 0;
  const loss = base * RENT.lossYears / RENT.spreadYears;
  const gain = base * RENT.comfortUplift;
  return {
    measures, capex, heatPump, powerKw,
    pv: { kwc, production: pvKwh, blocked: protectedBuilding, reason },
    rent: { base, loss, gain, net: gain - loss },
    before: sideCosts(building, { finalKwhPerM2: finalBefore, carbon: building.carbonIntensity, heating: building.heating }),
    after: sideCosts(building, {
      finalKwhPerM2: finalAfter, carbon: Math.min(carbonAfter, building.carbonIntensity), heating: heatingAfter,
      envelopeCost: annual('enveloppe'), equipmentCost: annual('equipement'), pvKwh, rentLoss: loss, rentGain: gain,
    }),
  };
}
