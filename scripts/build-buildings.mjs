// Convertit public/data/ville_geneve_core.geojson (produit par stock.py, SITG + QuantHome) en un JSON
// compact consommé par l'application : src/buildings.generated.json (non versionné).
// Usage : npm run data   ou   node scripts/build-buildings.mjs [chemin/vers/fichier.geojson]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] ?? fileURLToPath(new URL('../public/data/ville_geneve_core.geojson', import.meta.url));
const output = fileURLToPath(new URL('../src/buildings.generated.json', import.meta.url));
const geo = JSON.parse(readFileSync(input, 'utf8'));

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
const EMISSION = { 'Gaz': 0.198, 'Mazout': 0.265, 'Gaz + mazout': 0.23, 'CAD': 0.07, 'Pompe à chaleur': 0.025, 'Bois / biogaz': 0.03, 'Électrique': 0.025 };

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
const idcByUse = {}, co2ByUse = {};
for (const use of new Set(rows.map((r) => r.use))) {
  const group = rows.filter((r) => r.use === use);
  idcByUse[use] = median(group.map((r) => r.p.idc));
  co2ByUse[use] = median(group.map((r) => r.p.co2_scope1));
}
const idcGlobal = median(rows.map((r) => r.p.idc));
const co2Global = median(rows.map((r) => r.p.co2_scope1));

const NOW = 2026;
const buildings = rows.map(({ f, p, district, street, use, heating, year, yearEstimated }) => {
  const imputed = [];
  let idc = p.idc;
  if (!Number.isFinite(idc)) { idc = idcByUse[use] || idcGlobal; imputed.push('idc'); }
  let carbon = p.co2_scope1;
  if (!Number.isFinite(carbon)) {
    carbon = EMISSION[heating] !== undefined ? idc / 3.6 * EMISSION[heating] : (co2ByUse[use] || co2Global);
    imputed.push('carbon');
  }
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
console.log(`imputés — IDC: ${count('idc')}, CO₂: ${count('carbon')}, année: ${count('year')}`);
