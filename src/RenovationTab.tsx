import { useState } from 'react';
import { MapPin, TriangleAlert } from 'lucide-react';
import { BASE_YEAR, DASHBOARD_LAST_YEAR, DEPTHS, describeBreach, describeDepth, inDashboardProgram, renovationFor } from './model';
import type { Assessment, Strategy } from './model';
import { DISCOUNT_RATE, ELECTRICITY_EMISSION, EMBODIED, HEAT_PUMP_COP, MEASURE_IDS, PV, REALIZED_SHARE, RENT, SOCIAL_CARBON_COST, planRenovation } from './renovation';

const fmt = (value: number, digits = 0) => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const kchf = (value: number) => value >= 1_000_000 ? `${fmt(value / 1_000_000, 2)} M` : value >= 10_000 ? `${fmt(value / 1000)} k` : fmt(value);

const W = 300, H = 230, M = { top: 26, bottom: 44, left: 12, right: 12 };
const COLUMN = 82;

interface Segment { value: number; className: string; label: string }
interface Column { label: string; segments: Segment[]; total: string }

/** Barres empilées : les valeurs positives montent depuis l'axe, les négatives descendent sous l'axe. */
function BarChart({ title, unit, columns, ariaLabel, negativeLabel }: {
  title: string; unit: string; columns: [Column, Column]; ariaLabel: string; negativeLabel?: (column: Column) => string;
}) {
  const pos = (c: Column) => c.segments.filter((x) => x.value > 0).reduce((s, x) => s + x.value, 0);
  const neg = (c: Column) => -c.segments.filter((x) => x.value < 0).reduce((s, x) => s + x.value, 0);
  const maxPos = Math.max(...columns.map(pos), 1e-9);
  const maxNeg = Math.max(...columns.map(neg), 0);
  const plotTop = M.top, plotBottom = H - M.bottom;
  const unitPx = (plotBottom - plotTop) / (maxPos + maxNeg);
  const zeroY = plotTop + maxPos * unitPx;
  const x = (i: number) => M.left + (W - M.left - M.right) * (0.25 + 0.5 * i) - COLUMN / 2;
  return <figure className="bar-chart">
    <figcaption><strong>{title}</strong><span>{unit}</span></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <defs><pattern id="grey-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#bdbab0" /><line x1="0" y1="0" x2="0" y2="6" stroke="#8d8a80" strokeWidth="2" /></pattern></defs>
      <line x1={M.left} x2={W - M.right} y1={zeroY} y2={zeroY} className="axis" />
      {columns.map((column, i) => {
        let up = zeroY, down = zeroY;
        const tip = (segment: Segment) => `${segment.label} : ${segment.value < 0 ? '−' : ''}${fmt(Math.abs(segment.value), Math.abs(segment.value) < 10 ? 1 : 0)} ${unit}`;
        return <g key={column.label}>
          {column.segments.filter((x2) => x2.value > 0).map((segment) => {
            const h = segment.value * unitPx;
            up -= h;
            return <rect key={segment.label} x={x(i)} y={up} width={COLUMN} height={h} className={segment.className}><title>{tip(segment)}</title></rect>;
          })}
          {column.segments.filter((x2) => x2.value < 0).map((segment) => {
            const h = -segment.value * unitPx;
            const y = down;
            down += h;
            return <rect key={segment.label} x={x(i)} y={y} width={COLUMN} height={h} className={segment.className}><title>{tip(segment)}</title></rect>;
          })}
          <text x={x(i) + COLUMN / 2} y={up - 7} textAnchor="middle" className="bar-value">{column.total}</text>
          {down > zeroY && negativeLabel && <text x={x(i) + COLUMN / 2} y={down + 14} textAnchor="middle" className="bar-value">{negativeLabel(column)}</text>}
          <text x={x(i) + COLUMN / 2} y={plotBottom + 34} textAnchor="middle" className="bar-label">{column.label}</text>
        </g>;
      })}
    </svg>
  </figure>;
}

export default function RenovationTab({ assessment, strategy, onShowOnMap }: { assessment: Assessment; strategy: Strategy; onShowOnMap: () => void }) {
  const { building } = assessment;
  // Paquet recommandé à l'échéance (ou en BASE_YEAR pour un bâtiment gris, sans travaux simulés au tableau de bord).
  const worksYear = inDashboardProgram(assessment) ? assessment.dueYear! : BASE_YEAR;
  const recommended = renovationFor(building, worksYear, strategy, DASHBOARD_LAST_YEAR);
  const [selection, setSelection] = useState<Set<string>>(() => new Set(recommended.selection));
  const isRecommended = selection.size === recommended.selection.size && [...selection].every((id) => recommended.selection.has(id));
  const plan = planRenovation(building, selection);
  const { before, after } = plan;
  const toggle = (id: string) => setSelection((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  // Coût net : coûts + loyers non perçus − hausse de loyer (recette).
  const netCost = (side: typeof before) => side.total + side.rentLoss - side.rentGain;
  const costSegments = (side: typeof before): Segment[] => [
    { value: side.energyCost, className: 'seg-energy', label: 'Énergie' },
    { value: side.envelopeCost, className: 'seg-envelope', label: 'Enveloppe thermique (annualisée)' },
    { value: side.equipmentCost, className: 'seg-equipment', label: 'Équipements techniques (annualisés)' },
    { value: side.carbonCost, className: 'seg-carbon', label: 'Émissions carbone' },
    { value: side.rentLoss, className: 'seg-rent-loss', label: 'Manque à gagner de loyers (annualisé)' },
    { value: -side.rentGain, className: 'seg-rent-gain', label: 'Hausse de loyer (confort)' },
  ];
  const included = plan.measures.filter((m) => m.included);
  const carbonSavedPerYear = (before.carbon - after.carbon) * building.area / 1000;
  return <section className="renovation-tab" aria-label={`Mesures de rénovation : ${building.name}`}>
    <div className="charts-heading">
      <div><div className="section-label">MESURES DE RÉNOVATION</div><h2>{building.name}</h2>
        <p>{fmt(building.area)} m² SRE · chauffage : {building.heating} · cochez les mesures à inclure, les coûts annuels s’adaptent.</p>
        <p className="depth-note" data-testid="recommended-depth"><strong>Paquet recommandé{inDashboardProgram(assessment) ? ` (travaux en ${worksYear})` : ` (sans échéance d’ici ${DASHBOARD_LAST_YEAR}, calculé pour ${worksYear})`} : {DEPTHS[recommended.depth].label.toLowerCase()}</strong> — {describeDepth(recommended, worksYear)}{recommended.residual ? ` Après ces travaux, un seuil reste dépassé (${describeBreach(recommended.residual)}).` : ''}{isRecommended ? '' : ' Sélection modifiée.'}</p></div>
      <button className="export-button" onClick={onShowOnMap}><MapPin size={14} /> Voir sur la carte</button>
    </div>
    <div className="renovation-body">
      <div className="measures-panel">
        <div className="measures-head"><strong>Coût estimé des mesures</strong><span>{kchf(plan.capex)} CHF</span></div>
        <div className="measures-actions">
          <button className="text-button" onClick={() => setSelection(new Set(recommended.selection))} disabled={isRecommended}>Paquet recommandé</button>
          <button className="text-button" onClick={() => setSelection(new Set(MEASURE_IDS))}>Tout cocher</button>
          <button className="text-button" onClick={() => setSelection(new Set())}>Tout décocher</button>
        </div>
        <ul className="measure-list">
          {plan.measures.map((m) => <li key={m.id} className={m.included ? 'on' : 'off'}>
            <label>
              <input type="checkbox" checked={selection.has(m.id)} disabled={!!m.note} onChange={() => toggle(m.id)} />
              <span className={`measure-swatch ${m.category === 'enveloppe' ? 'seg-envelope' : 'seg-equipment'}`} aria-hidden="true" />
              <span className="measure-text">
                <strong>{m.label}{m.proxy && <em className="proxy-tag">proxy</em>}</strong>
                <small>{fmt(m.quantity, m.unit === 'm²' ? 0 : 1)} {m.unit} × {fmt(m.unitCost)} CHF/{m.unit} · {m.lifetime} ans · {fmt(m.annualCost)} CHF/an · carbone gris {fmt(m.embodiedCarbon / 1000, 1)} tCO₂e</small>
                {m.detail && <small className="measure-detail">{m.detail}</small>}
                {m.note && <small className="measure-note">{m.note}</small>}
                <small className="measure-source">{m.source}</small>
              </span>
              <span className="measure-cost">{fmt(m.cost)} CHF</span>
            </label>
          </li>)}
        </ul>
        <div className="measures-total"><span>{included.length} mesure{included.length > 1 ? 's' : ''} retenue{included.length > 1 ? 's' : ''}</span><strong>{fmt(plan.capex)} CHF</strong><span>{fmt(after.renovationCost)} CHF/an</span></div>
      </div>
      <div className="costs-panel">
        <div className="charts-legend" aria-hidden="true"><span><i className="seg-energy" />Énergie</span><span><i className="seg-envelope" />Enveloppe thermique</span><span><i className="seg-equipment" />Équipements techniques</span><span><i className="seg-carbon" />Carbone ({SOCIAL_CARBON_COST} CHF/tCO₂)</span><span><i className="seg-rent-loss" />Manque à gagner (+)</span><span><i className="seg-rent-gain" />Hausse de loyer (−)</span></div>
        <BarChart title="Coûts annuels" unit="CHF/an" ariaLabel="Coûts annuels actuels et rénovés : énergie, enveloppe, équipements, carbone et loyers"
          negativeLabel={(column) => column.label === 'Rénové' ? `−${kchf(after.rentGain)}` : ''} columns={[
            { label: 'Actuel', total: `${kchf(netCost(before))} CHF`, segments: costSegments(before) },
            { label: 'Rénové', total: `${kchf(netCost(after))} CHF`, segments: costSegments(after) },
          ]} />
      </div>
    </div>
    <p className="pv-note">Carbone gris des mesures retenues : {fmt(plan.embodied.total / 1000, 1)} tCO₂e, soit {fmt(plan.embodied.perM2Year, 1)} kgCO₂e/m²·an amorti sur la durée de vie des mesures (valeur limite des rénovations importantes dès 2034 : {EMBODIED.legalLimitPerM2Year} kgCO₂e/m²·an, RECMC){carbonSavedPerYear > 0 ? ` ; compensé en ${fmt(plan.embodied.total / 1000 / carbonSavedPerYear, 1)} ans par le CO₂ d’exploitation évité` : ''}.</p>
    {plan.rent.base === 0 && <p className="pv-note">Aucun loyer résidentiel renseigné pour ce bâtiment : pas de composante loyers.</p>}
    <p className="subsidy-note">Subventions non appliquées : cette feuille de route est établie pour la Ville de Genève elle-même, maître d’ouvrage et propriétaire des bâtiments.</p>
    {plan.pv.reason && <p className={`pv-note ${plan.pv.blocked ? 'blocked' : ''}`}><TriangleAlert size={14} /> {plan.pv.reason}</p>}
    <p className="measures-note">Hypothèses : prix 2020 hors subventions ; annuité à {fmt(DISCOUNT_RATE * 100, 0)} % ; économies d’enveloppe théoriques réalisées à {fmt(REALIZED_SHARE * 100, 0)} % ; PAC air/eau COP {HEAT_PUMP_COP} ; surfaces d’éléments déduites de la SRE (hypothèse modèle) : façade brute 1,0 m²/m² SRE, fenêtres = part vitrée de l’affectation × façade brute (Logement 20 %, Administration 60 %, autres affectations : hypothèses modèle) ; paquet recommandé selon la vétusté (rénovation complète si l’état est inférieur à 0,70, sinon énergétique sans façade ni fenêtres, sauf seuil encore dépassé) ; coût social du carbone {SOCIAL_CARBON_COST} CHF/tCO₂ ; électricité {ELECTRICITY_EMISSION} kgCO₂/kWh ; PV {fmt(PV.costPerKwc)} CHF/kWc, {fmt(PV.yield)} kWh/kWc ; loyers : {RENT.lossYears} an de loyers perdu réparti sur {RENT.spreadYears} ans, hausse de confort +{fmt(RENT.comfortUplift * 100)} %, appliqués dès qu’une mesure d’enveloppe est retenue. Détail : docs/renovation/.</p>
  </section>;
}
