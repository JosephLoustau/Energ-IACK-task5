/**
 * Modèle de rénovation par mesures, calé sur docs/renovation/ (parametres_renovation.md/.csv).
 * Les références entre crochets renvoient aux `source_id` de docs/renovation/sources.csv.
 * Tout ce qui n'est pas sourcé est marqué « hypothèse modèle ».
 */
import type { Building } from './model';
import carriers from './carriers.json';

/**
 * Agents énergétiques (src/carriers.json, partagé avec scripts/build-buildings.mjs) :
 *  - `idcMjPerKwh` : MJ d'IDC par kWh d'énergie finale livrée [OCEN, annexe « Calcul de l'IDC », rév. 1.0 du 25.08.2025, Tab. 1].
 *    L'IDC est une énergie finale, sauf conventions : électricité de PAC × 11.7 MJ/kWh (= 3.6 × 3.25), chaleur CAD × 3.89 MJ/kWh.
 *  - `emission` : kgCO₂e par kWh d'énergie finale, scope 1 + 2. Gaz 0.198 et mazout 0.265 : combustion directe ;
 *    électricité du réseau 0.097 et CAD 0.131 (valeurs fixées par l'équipe projet ; 0.097 = électricité 2017 de NAEGELI2020 Tab. 3) ;
 *    bois 0.0277 [KBOB2022, pellets].
 *    Chauffage inconnu : traité comme du gaz (agent dominant du parc, hypothèse modèle).
 *    Facteurs constants dans le temps pour tous les agents (pas de trajectoire de décarbonation du CAD ni de l'électricité).
 */
export const CARRIERS: Record<string, { idcMjPerKwh: number; emission: number }> = carriers;
const carrierOf = (heating: string) => CARRIERS[heating] ?? CARRIERS['Inconnu']!;
/** Intensité carbone scope 1 + 2 (kgCO₂e/m²·an) déduite de l'IDC, du système de chauffage et du facteur d'émission de son agent. */
export const carbonFromIdc = (idc: number, heating: string) => idc / carrierOf(heating).idcMjPerKwh * carrierOf(heating).emission;

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

/**
 * Surface d'élément par m² de SRE (hypothèse modèle : aucune surface d'élément dans les données).
 * `grossFacade` = façade brute (mur opaque + fenêtres), répartie selon la part vitrée de l'affectation (WINDOW_SHARE).
 */
export const ELEMENT_RATIO = { grossFacade: 1.0, toit: 0.33, cave: 0.33 } as const;

/**
 * Part des fenêtres dans la façade brute, selon l'affectation. Logement 0,20 et Administration 0,60 : valeurs données par
 * l'utilisateur (ordres de grandeur, résidentiel ~20 %, bureaux 60 % ou plus) ; toutes les autres sont des hypothèses
 * modèle, à valider. Fenêtres = part × façade brute ; façade opaque = (1 − part) × façade brute.
 */
export const WINDOW_SHARE: Record<string, number> = {
  'Logement': 0.20,
  'Logement mixte': 0.25,       // hypothèse modèle
  'Santé & social': 0.25,       // hypothèse modèle
  'Administration': 0.60,
  'Éducation': 0.40,            // hypothèse modèle
  'École': 0.40,                // hypothèse modèle (jeu de démonstration)
  'Commerce & ateliers': 0.40,  // hypothèse modèle
  'Culture & loisirs': 0.30,    // hypothèse modèle
  'Musée': 0.30,                // hypothèse modèle (jeu de démonstration)
  'Sport': 0.30,                // hypothèse modèle
};
/** Part vitrée par défaut d'une affectation absente du tableau (hypothèse modèle). */
export const DEFAULT_WINDOW_SHARE = 0.30;
export const windowShareFor = (use: string) => WINDOW_SHARE[use] ?? DEFAULT_WINDOW_SHARE;
/** Surfaces d'éléments par m² de SRE pour une affectation : façade opaque, toit, cave, fenêtres. */
export function elementRatios(use: string): Record<EnvelopeSpec['id'], number> {
  const share = windowShareFor(use);
  return {
    facade: (1 - share) * ELEMENT_RATIO.grossFacade, toit: ELEMENT_RATIO.toit, cave: ELEMENT_RATIO.cave,
    fenetres: share * ELEMENT_RATIO.grossFacade,
  };
}

/** Rendement du système existant [HFM2015 Tab. 11 ; LICS2022 Tab. 7-8]. */
const EFFICIENCY: Record<string, number> = {
  'Gaz': 0.85, 'Mazout': 0.80, 'Gaz + mazout': 0.83, 'CAD': 0.95, 'Pompe à chaleur': HEAT_PUMP_COP,
  'Électrique': 1, 'Bois / biogaz': 0.80, 'Inconnu': 0.85,
};
/**
 * Taxe CO₂ sur les combustibles fossiles (CHF/tCO₂), moyenne 2022-2026 : 96 CHF/t en 2021, 120 CHF/t depuis 2022 [OFEV, loi sur le CO₂].
 * Elle est comprise dans le prix payé du gaz et du mazout ; le coût social du carbone s'y ajoute (grisé dans les graphiques).
 */
export const CO2_LEVY = 120;
/**
 * Prix de l'énergie finale hors taxe CO₂ (CHF/kWh), moyenne des cinq dernières années (2022-2026), pour intégrer la hausse
 * liée à la guerre en Ukraine et aux tensions au Moyen-Orient (détroit d'Ormuz). Estimations rapprochées de sources publiques
 * fragmentaires, à vérifier avant tout usage officiel :
 *  - électricité : médiane ElCom du ménage type H4, TTC : 21.5 (2022), 27.4 (2023), 32.1 (2024), 29.0 (2025), 27.7 (2026) → 27.5 ct/kWh,
 *    réduite à 75 % pour la Ville (client commercial) → 20.6 ct/kWh ;
 *  - gaz : tarif moyen SIG, taxe CO₂ comprise : ~11.0 (2022), 11.5 (2023), 11.0 (2024), 11.0 (2025), 10.0 (2026, baisse d'avril) → 10.9 ct/kWh ;
 *  - mazout : prix moyen OFS pour 3 000-6 000 l, taxe CO₂ comprise, à ~10 kWh/l : 128, 108, 102, 96, ~125 (2026, hausse de l'été) CHF/100 l → 11.2 ct/kWh ;
 *  - CAD, bois/biogaz : prix LICS2022 Tab. 11 (2020), non réévalués.
 */
/**
 * Prix de l'électricité d'un gros consommateur, en part du prix ménage H4 : la Ville achète comme client commercial (profils ElCom C2-C3,
 * ~0.7-0.8 × H4). Hypothèse modèle, la série ElCom C2-C3 n'ayant pas été retrouvée.
 */
export const ELECTRICITY_PRICE_FACTOR = 0.75;
const ELECTRICITY_PRICE = 0.275 * ELECTRICITY_PRICE_FACTOR;
const PRICE_BASE: Record<string, number> = {
  'Gaz': 0.109 - CO2_LEVY / 1000 * 0.198, 'Mazout': 0.112 - CO2_LEVY / 1000 * 0.265,
  'CAD': 0.088, 'Pompe à chaleur': ELECTRICITY_PRICE, 'Électrique': ELECTRICITY_PRICE, 'Bois / biogaz': 0.09,
};
PRICE_BASE['Gaz + mazout'] = (PRICE_BASE['Gaz']! + PRICE_BASE['Mazout']!) / 2;
PRICE_BASE['Inconnu'] = PRICE_BASE['Gaz']!;
const FOSSIL_OR_UNKNOWN = new Set(['Gaz', 'Mazout', 'Gaz + mazout', 'Inconnu']);
/** Prix de l'énergie finale payé (CHF/kWh) : prix hors taxe + taxe CO₂ × facteur d'émission du combustible fossile. */
export function energyPrice(heating: string): number {
  const fossil = FOSSIL_OR_UNKNOWN.has(heating);
  return (PRICE_BASE[heating] ?? PRICE_BASE['Inconnu']!) + (fossil ? CO2_LEVY / 1000 * carrierOf(heating).emission : 0);
}
/** Lignes du tableau des prix pour les hypothèses : [agent, prix hors taxe, taxe CO₂, prix payé] en CHF/kWh. */
export const ENERGY_PRICE_ROWS = ['Gaz', 'Mazout', 'Électrique', 'CAD', 'Bois / biogaz'].map((h) => {
  const total = energyPrice(h);
  return { heating: h, base: PRICE_BASE[h]!, levy: total - PRICE_BASE[h]!, total };
});
/** Facteur d'émission de l'électricité du réseau (kgCO₂e/kWh), voir CARRIERS. */
export const ELECTRICITY_EMISSION = CARRIERS['Pompe à chaleur']!.emission;
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
/** Raccordement au CAD, changement de système, kCHF par puissance [LICS2022 Annexe 11.1, Fig. 47, lecture graphique]. */
const DISTRICT_HEATING_COST: [number, number][] = [[5, 24.9], [10, 30.8], [20, 43.9], [70, 131.5], [100, 182.6], [200, 416.4]];
const DISTRICT_HEATING_LIFETIME = 20; // [HFM2015 Tab. 10]

export const heatPumpCost = (kw: number) => costAtPower(HEAT_PUMP_COST, kw);
export const districtHeatingCost = (kw: number) => costAtPower(DISTRICT_HEATING_COST, kw);
function costAtPower(points: [number, number][], kw: number) {
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

/**
 * Carbone gris des mesures (fabrication + élimination), en kgCO₂e [KBOB2022, voir docs/renovation/parametres_renovation.csv].
 * Les choix de matériau, de masse volumique, de part vitrée et la mise à l'échelle par kW sont des hypothèses modèle.
 */
export const EMBODIED = {
  /** Isolant EPS : 7.6 kgCO₂e/kg [KBOB 10.004] ; 20 kg/m³ (plage KBOB 15-40, hypothèse) ; λ = 0.035 W/(m·K) [STREICHER2020 Paper III SM Eq. 7]. */
  insulationPerKg: 7.6, insulationDensity: 20, lambda: 0.035,
  /** Fenêtre : cadre bois-métal 65.7 kg/m² d'ouverture [KBOB 05.031] + triple vitrage 78.3 kg/m² de verre [KBOB 05.003] × part vitrée 70 % (hypothèse). */
  windowPerM2: 65.7 + 78.3 * 0.7,
  /** PAC air/eau : 4 000 kg pour 7 kW [KBOB 31.019], mis à l'échelle linéairement (proxy). */
  heatPumpPerKw: 4000 / 7,
  /** Raccordement CAD : faute de valeur propre, générateur de chaleur 4.29 kg/m² SRE pour 50 W/m² [KBOB 31.003], soit 85.8 kg/kW (proxy). */
  districtHeatingPerKw: 4.29 / 50 * 1000,
  /** Photovoltaïque en toiture plate : 1 140 kg/kWc [KBOB 34.026]. */
  pvPerKwc: 1140,
  /** Valeur limite d'empreinte carbone d'une rénovation importante dès 2034 : 5 kgCO₂e/m²·an [RECMC, L 5 05.05, annexe]. */
  legalLimitPerM2Year: 5,
};
/** Carbone gris d'un m² d'isolation : épaisseur t = λ·(1/U1 − 1/U0), masse = t × masse volumique. */
export const insulationEmbodied = (u0: number, u1: number) =>
  EMBODIED.lambda * (1 / u1 - 1 / u0) * EMBODIED.insulationDensity * EMBODIED.insulationPerKg;

export type MeasureCategory = 'enveloppe' | 'equipement';

export interface Measure {
  id: string;
  category: MeasureCategory;
  /** Mesure retenue dans le plan (cochée). */
  included: boolean;
  label: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
  lifetime: number;
  annualCost: number;
  /** Économie théorique de chaleur utile, avant effet de réalisation et plafonnement (kWh/an). */
  usefulSaving: number;
  /** Carbone gris de la mesure (fabrication + élimination), kgCO₂e. */
  embodiedCarbon: number;
  source: string;
  proxy?: boolean;
  /** Précision affichée lorsque la mesure ne s'applique pas dans la sélection courante. */
  note?: string;
  /** Précision sur le dimensionnement (p. ex. part de la façade brute), sans effet sur la sélection. */
  detail?: string;
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
  /** Système de chauffage remplacé par une PAC air/eau (chauffage fossile, pas de CAD dans la rue). */
  heatPump: boolean;
  /** Système de chauffage remplacé par un raccordement au CAD (chauffage fossile, CAD dans la rue : raccordement obligatoire). */
  districtHeating: boolean;
  powerKw: number;
  pv: { kwc: number; production: number; blocked: boolean; reason: string | null };
  /** Carbone gris des mesures retenues : total (kgCO₂e), amorti sur la durée de vie de chaque mesure (kgCO₂e/an et kgCO₂e/m² SRE·an). */
  embodied: { total: number; annual: number; perM2Year: number };
  rent: { base: number; loss: number; gain: number; net: number };
}

interface SideInput {
  finalKwhPerM2: number; carbon: number; heating: string;
  envelopeCost?: number; equipmentCost?: number; pvKwh?: number; rentLoss?: number; rentGain?: number;
}
function sideCosts(building: Building, input: SideInput): Side {
  const { finalKwhPerM2, carbon, heating, envelopeCost = 0, equipmentCost = 0, pvKwh = 0, rentLoss = 0, rentGain = 0 } = input;
  const finalKwh = finalKwhPerM2 * building.area;
  const price = energyPrice(heating);
  // L'électricité photovoltaïque autoconsommée remplace des imports (prix du réseau) moyennant l'entretien.
  const energyCost = (finalKwh - pvKwh) * price + pvKwh * PV.maintenance;
  const carbonCost = carbon * building.area / 1000 * SOCIAL_CARBON_COST;
  const renovationCost = envelopeCost + equipmentCost;
  return {
    idc: finalKwhPerM2 * carrierOf(heating).idcMjPerKwh, carbon, finalKwh, energyCost, carbonCost, envelopeCost, equipmentCost, renovationCost,
    total: energyCost + carbonCost + renovationCost, rentLoss, rentGain,
  };
}

export const MEASURE_IDS = ['facade', 'toit', 'cave', 'fenetres', 'pac', 'cad', 'pv'] as const;

/**
 * Plan de rénovation d'un bâtiment. `selection` = ensemble des mesures retenues (toutes par défaut) :
 * `measures` liste toutes les mesures possibles avec leur drapeau `included`, et les coûts, économies,
 * émissions et loyers ne tiennent compte que des mesures incluses.
 */
export function planRenovation(building: Building, selection?: ReadonlySet<string>): RenovationPlan {
  const isOn = (id: string) => !selection || selection.has(id);
  const area = building.area;
  const finalBefore = building.idc / carrierOf(building.heating).idcMjPerKwh;
  const efficiency = EFFICIENCY[building.heating] ?? 0.85;
  const usefulBefore = finalBefore * efficiency;
  const protectedBuilding = !!building.protection && building.protection !== 'none';
  const spaceHeating = Math.max(0, usefulBefore - HOT_WATER_KWH_M2);

  const measures: Measure[] = [];
  let theoreticalSaving = 0;     // mesures incluses, kWh utile / m² SRE
  let fullTheoreticalSaving = 0; // toutes les mesures (dimensionnement du photovoltaïque)
  const ratios = elementRatios(building.use);
  const share = windowShareFor(building.use);
  const sharePct = `${Math.round(share * 100)} %`;
  const shareSource = building.use === 'Logement' || building.use === 'Administration' ? building.use : `${building.use}, hypothèse modèle`;
  const grossFacade = ELEMENT_RATIO.grossFacade.toFixed(1).replace('.', ',');
  for (const spec of ENVELOPE) {
    const interior = spec.id === 'facade' && protectedBuilding;
    const quantity = ratios[spec.id] * area;
    const unitCost = interior ? INTERIOR_INSULATION_COST : spec.unitCost;
    const saving = (spec.f0 * spec.u0 - spec.f1 * spec.u1) * CGHT * ratios[spec.id];
    fullTheoreticalSaving += saving;
    if (isOn(spec.id)) theoreticalSaving += saving;
    const cost = quantity * unitCost;
    measures.push({
      id: spec.id, category: 'enveloppe', included: isOn(spec.id),
      label: interior ? 'Isolation intérieure de la façade (bâtiment protégé)' : spec.label,
      quantity, unit: 'm²', unitCost, cost, lifetime: spec.lifetime, annualCost: cost * annuity(spec.lifetime),
      usefulSaving: saving * area,
      embodiedCarbon: quantity * (spec.id === 'fenetres' ? EMBODIED.windowPerM2 : insulationEmbodied(spec.u0, spec.u1)),
      source: interior ? 'STREICHER2020 Tab. 3 (isolation intérieure du sol, 12 cm) — proxy' : spec.source,
      proxy: interior,
      detail: spec.id === 'fenetres' ? `${sharePct} de la façade brute (${shareSource})`
        : spec.id === 'facade' ? `partie opaque : ${Math.round((1 - share) * 100)} % de la façade brute (${grossFacade} m²/m² SRE, hypothèse modèle)`
        : undefined,
    });
  }
  const envelopeSaving = Math.min(MAX_ENVELOPE_SHARE * spaceHeating, REALIZED_SHARE * theoreticalSaving);
  const usefulAfter = usefulBefore - envelopeSaving;
  const fullUsefulAfter = usefulBefore - Math.min(MAX_ENVELOPE_SHARE * spaceHeating, REALIZED_SHARE * fullTheoreticalSaving);

  // Changement de système : seuls les chauffages fossiles (ou inconnus) sont remplacés ; un système non fossile est conservé.
  // Si le CAD est disponible dans la rue, le raccordement est obligatoire ; sinon PAC air/eau.
  const replaceable = FOSSIL_OR_UNKNOWN.has(building.heating);
  const districtHeatingPossible = replaceable && building.cadAvailable === true;
  const heatPumpPossible = replaceable && !districtHeatingPossible;
  const heatPump = heatPumpPossible && isOn('pac');
  const districtHeating = districtHeatingPossible && isOn('cad');
  const powerKw = specificPower(finalBefore) * area / 1000;
  if (heatPumpPossible) {
    const cost = heatPumpCost(powerKw);
    measures.push({
      id: 'pac', category: 'equipement', included: heatPump, label: 'Pompe à chaleur air/eau (remplacement de la chaudière)',
      quantity: powerKw, unit: 'kW', unitCost: cost / powerKw, cost, lifetime: HEAT_PUMP_LIFETIME,
      annualCost: cost * annuity(HEAT_PUMP_LIFETIME), usefulSaving: 0, embodiedCarbon: powerKw * EMBODIED.heatPumpPerKw,
      source: 'LICS2022 Annexe 11.1 Fig. 47 (changement de système, interpolation) ; puissance : LICS2022 Tab. 9 ; durée : HFM2015 Tab. 10',
    });
  }
  if (districtHeatingPossible) {
    const cost = districtHeatingCost(powerKw);
    measures.push({
      id: 'cad', category: 'equipement', included: districtHeating, label: 'Raccordement au chauffage à distance (CAD dans la rue : obligatoire)',
      quantity: powerKw, unit: 'kW', unitCost: cost / powerKw, cost, lifetime: DISTRICT_HEATING_LIFETIME,
      annualCost: cost * annuity(DISTRICT_HEATING_LIFETIME), usefulSaving: 0, embodiedCarbon: powerKw * EMBODIED.districtHeatingPerKw,
      source: 'LICS2022 Annexe 11.1 Fig. 47 (raccordement CAD, changement de système, interpolation) ; puissance : LICS2022 Tab. 9 ; durée : HFM2015 Tab. 10',
    });
  }

  const heatingAfter = heatPump ? 'Pompe à chaleur' : districtHeating ? 'CAD' : building.heating;
  const finalAfter = usefulAfter / (EFFICIENCY[heatingAfter] ?? 0.85);
  const electrified = ELECTRIC_HEATING.has(heatingAfter);
  const electrifiedFull = heatPumpPossible || ELECTRIC_HEATING.has(building.heating);

  // Photovoltaïque : dimensionné sur le paquet complet (taille stable, même si la façade et les fenêtres sont exclues,
  // p. ex. rénovation énergétique), limité par la toiture ; impossible sur un bâtiment protégé.
  const electricFull = electrifiedFull ? (heatPumpPossible ? fullUsefulAfter / HEAT_PUMP_COP : fullUsefulAfter / efficiency) * area : 0;
  const roofShare = building.solarShare ?? PV.defaultRoofShare;
  const capacityKwc = ELEMENT_RATIO.toit * area * roofShare * PV.kwcPerM2;
  let kwc = Math.min(capacityKwc, electricFull / PV.yield);
  let reason: string | null = null;
  if (protectedBuilding) { kwc = 0; reason = 'Bâtiment protégé (patrimoine) : panneaux photovoltaïques non installables.'; }
  else if (!electrifiedFull) reason = districtHeatingPossible ? 'Raccordement au CAD (pas d’électrification du chauffage) : pas de photovoltaïque simulé.' : 'Pas d’électrification du chauffage : pas de photovoltaïque simulé.';
  else if (kwc < PV.minKwc) { kwc = 0; reason = 'Toiture trop petite pour une installation photovoltaïque.'; }
  const pvOn = kwc > 0 && isOn('pv') && electrified;
  if (kwc > 0) {
    const cost = kwc * PV.costPerKwc;
    measures.push({
      id: 'pv', category: 'equipement', included: pvOn, label: 'Panneaux photovoltaïques en toiture', quantity: kwc, unit: 'kWc',
      unitCost: PV.costPerKwc, cost, lifetime: PV.lifetime, annualCost: cost * annuity(PV.lifetime), usefulSaving: 0, embodiedCarbon: kwc * EMBODIED.pvPerKwc,
      source: 'SWISSOLAR2024 diapo 8 (2 400 CHF/kWc, prix 2023, hors rétribution) ; productible 1 050 kWh/kWc ; durée 25 ans',
      note: !electrified ? 'Nécessite l’électrification du chauffage (pompe à chaleur).' : undefined,
    });
  }
  const production = pvOn ? kwc * PV.yield : 0;
  const pvKwh = Math.min(production, electrified ? finalAfter * area : 0);

  // Système remplacé ou électrique : énergie finale × facteur d'émission de l'agent ; sinon proportionnel à l'énergie finale.
  const carbonAfter = electrified ? Math.max(0, finalAfter - pvKwh / area) * ELECTRICITY_EMISSION
    : districtHeating ? finalAfter * carrierOf('CAD').emission
    : (finalBefore > 0 ? building.carbonIntensity * finalAfter / finalBefore : 0);

  const included = measures.filter((m) => m.included);
  const capex = included.reduce((sum, m) => sum + m.cost, 0);
  const embodiedAnnual = included.reduce((sum, m) => sum + m.embodiedCarbon / m.lifetime, 0);
  const embodied = { total: included.reduce((sum, m) => sum + m.embodiedCarbon, 0), annual: embodiedAnnual, perM2Year: area > 0 ? embodiedAnnual / area : 0 };
  const annual = (category: MeasureCategory) => included.filter((m) => m.category === category).reduce((sum, m) => sum + m.annualCost, 0);

  // Les loyers ne sont touchés que si des travaux d'enveloppe sont réalisés dans les logements.
  const base = building.rentResidential ?? 0;
  const worksInside = included.some((m) => m.category === 'enveloppe');
  const loss = worksInside ? base * RENT.lossYears / RENT.spreadYears : 0;
  const gain = worksInside ? base * RENT.comfortUplift : 0;
  return {
    measures, capex, heatPump, districtHeating, powerKw,
    pv: { kwc: pvOn ? kwc : 0, production, blocked: protectedBuilding, reason },
    rent: { base, loss, gain, net: gain - loss }, embodied,
    before: sideCosts(building, { finalKwhPerM2: finalBefore, carbon: building.carbonIntensity, heating: building.heating }),
    after: sideCosts(building, {
      finalKwhPerM2: finalAfter, carbon: Math.min(carbonAfter, building.carbonIntensity), heating: heatingAfter,
      envelopeCost: annual('enveloppe'), equipmentCost: annual('equipement'), pvKwh, rentLoss: loss, rentGain: gain,
    }),
  };
}
