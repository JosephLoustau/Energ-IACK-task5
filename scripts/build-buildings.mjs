// Convertit la collection de bâtiments produite par stock.py (GeoJSON SITG + QuantHome) en un JSON
// compact consommé par l'application : src/buildings.generated.json (non versionné).
// Appelé par scripts/build-data.mjs (npm run data) ; ou : node scripts/build-buildings.mjs fichier.geojson
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OUTPUT = fileURLToPath(new URL('../src/buildings.generated.json', import.meta.url));

const USAGE = {
  'Education': 'Éducation', 'Residential': 'Logement', 'Mixed residential': 'Logement mixte',
  'Commercial': 'Commerce & ateliers', 'Administration & services': 'Administration',
  'Culture & leisure': 'Culture & loisirs', 'Sport': 'Sport', 'Health & social': 'Santé & social',
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const round = (value, digits = 1) => Number(value.toFixed(digits));

function heatingOf(text) {
  if (!text) return 'Inconnu';
  const t = text.toLowerCase();
  const gas = /\(gaz[;)]|\(gaz\)/.test(t) || t.includes('(gaz');
  const oil = t.includes('mazout');
  if (gas && oil) return 'Gaz + mazout';
  if (oil) return 'Mazout';
  if (gas) return 'Gaz';
  if (t.includes('cad') || t.includes('chaleur à distance')) return 'CAD';
  if (t.includes('pompe à chaleur')) return 'Pompe à chaleur';
  if (t.includes('bois') || t.includes('biogaz')) return 'Bois / biogaz';
  if (t.includes('électri')) return 'Électrique';
  return 'Inconnu';
}
const FOSSIL = new Set(['Gaz', 'Mazout', 'Gaz + mazout']);
// Agents énergétiques : MJ d'IDC par kWh d'énergie finale (OCEN) et facteur d'émission ; sources dans src/renovation.ts.
const CARRIERS = JSON.parse(readFileSync(new URL('../src/carriers.json', import.meta.url), 'utf8'));

function centroid(ring) {
  let x = 0, y = 0;
  for (const [lng, lat] of ring) { x += lng; y += lat; }
  return [y / ring.length, x / ring.length];
}
function yearOf(p) {
  if (p.construction_year) return { year: p.construction_year, estimated: false };
  const m = /(\d{4}).*?(\d{4})/.exec(p.construction_period ?? '');
  if (m) return { year: Math.round((+m[1] + +m[2]) / 2), estimated: true };
  const before = /avant (\d{4})/i.exec(p.construction_period ?? '');
  if (before) return { year: +before[1] - 20, estimated: true };
  if ((p.construction_period ?? '').includes('> 2015')) return { year: 2018, estimated: true };
  return { year: null, estimated: true };
}

export function writeBuildings(geo, output = OUTPUT) {
const rows = geo.features.map((f) => {
  const p = f.properties;
  const [district, ...street] = (p.address ?? '').split(',');
  const { year, estimated: yearEstimated } = yearOf(p);
  return {
    f, p, district: street.length ? district.trim() : 'Genève',
    street: (street.join(',') || p.address || '').trim(),
    use: USAGE[p.usage] ?? p.usage, heating: heatingOf(p.heating), year, yearEstimated,
  };
});

const medianYear = median(rows.map((r) => r.year));
const idcByUse = {};
for (const use of new Set(rows.map((r) => r.use))) {
  const group = rows.filter((r) => r.use === use);
  idcByUse[use] = median(group.map((r) => r.p.idc));
}
const idcGlobal = median(rows.map((r) => r.p.idc));

const NOW = 2026;
const buildings = rows.map(({ f, p, district, street, use, heating, year, yearEstimated }) => {
  const imputed = [];
  let idc = p.idc;
  if (!Number.isFinite(idc)) { idc = idcByUse[use] || idcGlobal; imputed.push('idc'); }
  // CO₂ scope 1 + 2, calculé pour tous les bâtiments : IDC / (MJ d'IDC par kWh) × facteur d'émission de l'agent
  // (combustion directe pour le gaz et le mazout, facteur du réseau pour l'électricité et le CAD). Le champ QuantHome
  // `co2_scope1` n'est plus utilisé : ses facteurs étaient incohérents (p. ex. 120 bâtiments au gaz avec le facteur du mazout).
  const carrier = CARRIERS[heating] ?? CARRIERS['Inconnu'];
  const carbon = idc / carrier.idcMjPerKwh * carrier.emission;
  // CO₂ estimé seulement si ses données d'entrée ne sont pas réelles : IDC imputé ou chauffage inconnu.
  if (imputed.includes('idc') || heating === 'Inconnu') imputed.push('carbon');
  const constructionYear = year ?? medianYear;
  if (year === null || yearEstimated) imputed.push('year');
  // Indice d'état : calculé dans l'application (model.ts, courbe en S de l'âge effectif).
  const lastWorkYear = p.last_energy_permit ? +p.last_energy_permit.slice(0, 4) : null;
  return {
    id: String(p.egid),
    name: street || `Bâtiment ${p.egid}`,
    district,
    use,
    destination: p.destination,
    coordinates: centroid(f.geometry.coordinates[0]).map((v) => round(v, 6)),
    area: Math.round(p.sre),
    constructionYear,
    lastWorkYear,
    rentResidential: Number.isFinite(p.rent_residential) ? Math.round(p.rent_residential) : null,
    solarShare: Number.isFinite(p.solar_share_above_1000) ? round(p.solar_share_above_1000, 3) : null,
    height: Number.isFinite(p.height) ? round(p.height, 1) : null,
    idc: Math.round(idc),
    carbonIntensity: round(carbon, 1),
    heating,
    fossil: FOSSIL.has(heating),
    protection: p.protection,
    idcStatus: p.idc_status ?? 'Inconnu',
    idcSource: p.idc_method ?? 'imputed',
    cadAvailable: p.cad_in_street === true,
    imputed,
  };
});
writeFileSync(output, JSON.stringify(buildings));
const count = (key) => buildings.filter((b) => b.imputed.includes(key)).length;
console.log(`${buildings.length} bâtiments écrits dans ${output}`);
console.log(`imputés — IDC: ${count('idc')}, CO₂ (IDC imputé ou chauffage inconnu): ${count('carbon')}, année: ${count('year')}`);
console.log(`CO₂ scope 1 + 2 calculé pour ${buildings.length} bâtiments (IDC × facteur d'émission de l'agent, src/carriers.json)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeBuildings(JSON.parse(readFileSync(process.argv[2], 'utf8')));
