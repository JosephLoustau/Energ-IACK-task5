import { ChevronDown, TriangleAlert } from 'lucide-react';
import type { Building } from './model';
import { DISCOUNT_RATE, ELECTRICITY_EMISSION, HEAT_PUMP_COP, PV, REALIZED_SHARE, RENT, SOCIAL_CARBON_COST, planRenovation } from './renovation';

const fmt = (value: number, digits = 0) => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const kchf = (value: number) => value >= 1_000_000 ? `${fmt(value / 1_000_000, 2)} M` : value >= 10_000 ? `${fmt(value / 1000)} k` : fmt(value);

const W = 300, H = 230, M = { top: 26, bottom: 44, left: 12, right: 12 };
const COLUMN = 82;

interface Segment { value: number; className: string; label: string }
interface Column { label: string; segments: Segment[]; total: string }

function BarChart({ title, unit, columns, ariaLabel }: { title: string; unit: string; columns: [Column, Column]; ariaLabel: string }) {
  const max = Math.max(...columns.map((c) => c.segments.reduce((s, x) => s + x.value, 0)), 1e-9);
  const plotH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (W - M.left - M.right) * (0.25 + 0.5 * i) - COLUMN / 2;
  return <figure className="bar-chart">
    <figcaption><strong>{title}</strong><span>{unit}</span></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <defs><pattern id="grey-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#bdbab0" /><line x1="0" y1="0" x2="0" y2="6" stroke="#8d8a80" strokeWidth="2" /></pattern></defs>
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} className="axis" />
      {columns.map((column, i) => {
        let y = H - M.bottom;
        const total = column.segments.reduce((s, x2) => s + x2.value, 0);
        return <g key={column.label}>
          {column.segments.map((segment) => {
            const h = segment.value / max * plotH;
            y -= h;
            return h > 0 ? <rect key={segment.label} x={x(i)} y={y} width={COLUMN} height={h} className={segment.className}><title>{`${segment.label} : ${fmt(segment.value, segment.value < 10 ? 1 : 0)} ${unit}`}</title></rect> : null;
          })}
          <text x={x(i) + COLUMN / 2} y={H - M.bottom - total / max * plotH - 7} textAnchor="middle" className="bar-value">{column.total}</text>
          <text x={x(i) + COLUMN / 2} y={H - M.bottom + 17} textAnchor="middle" className="bar-label">{column.label}</text>
        </g>;
      })}
    </svg>
  </figure>;
}

function RentChart({ loss, gain, base }: { loss: number; gain: number; base: number }) {
  const max = Math.max(loss, gain, 1e-9);
  const mid = M.top + (H - M.top - M.bottom) / 2;
  const half = (H - M.top - M.bottom) / 2 - 8;
  const x = (i: number) => M.left + (W - M.left - M.right) * (0.25 + 0.5 * i) - COLUMN / 2;
  const net = gain - loss;
  return <figure className="bar-chart">
    <figcaption><strong>Loyers</strong><span>CHF/an · écart vs actuel</span></figcaption>
    {base > 0 ? <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Variation annuelle des loyers : manque à gagner et hausse de loyer">
      <line x1={M.left} x2={W - M.right} y1={mid} y2={mid} className="axis" />
      <text x={x(0) + COLUMN / 2} y={mid - 7} textAnchor="middle" className="bar-value">0</text>
      <rect x={x(1)} y={mid - gain / max * half} width={COLUMN} height={gain / max * half} className="seg-rent-gain"><title>{`Hausse de loyer (confort) : ${fmt(gain)} CHF/an`}</title></rect>
      <rect x={x(1)} y={mid} width={COLUMN} height={loss / max * half} className="seg-rent-loss"><title>{`Manque à gagner (annualisé) : ${fmt(loss)} CHF/an`}</title></rect>
      <text x={x(1) + COLUMN / 2} y={mid - gain / max * half - 7} textAnchor="middle" className="bar-value">+{kchf(gain)}</text>
      <text x={x(1) + COLUMN / 2} y={mid + loss / max * half + 15} textAnchor="middle" className="bar-value">−{kchf(loss)}</text>
      <text x={x(0) + COLUMN / 2} y={H - M.bottom + 17} textAnchor="middle" className="bar-label">Actuel</text>
      <text x={x(1) + COLUMN / 2} y={H - M.bottom + 17} textAnchor="middle" className="bar-label">Rénové · net {net >= 0 ? '+' : '−'}{kchf(Math.abs(net))}</text>
    </svg> : <p className="chart-empty">Aucun loyer résidentiel renseigné pour ce bâtiment.</p>}
  </figure>;
}

export default function BuildingCharts({ building }: { building: Building }) {
  const plan = planRenovation(building);
  const { before, after } = plan;
  const costSegments = (side: typeof before): Segment[] => [
    { value: side.energyCost, className: 'seg-energy', label: 'Énergie' },
    { value: side.envelopeCost, className: 'seg-envelope', label: 'Enveloppe thermique (annualisée)' },
    { value: side.equipmentCost, className: 'seg-equipment', label: 'Équipements techniques (annualisés)' },
    { value: side.carbonCost, className: 'seg-carbon', label: 'Émissions carbone' },
  ];
  const decimals = (v: number) => (v < 10 ? 1 : 0);
  return <section className="building-charts" aria-label={`Avant / après rénovation : ${building.name}`}>
    <div className="charts-heading">
      <div><div className="section-label">AVANT / APRÈS RÉNOVATION</div><h2>{building.name}</h2>
        <p>{fmt(building.area)} m² SRE · {building.heating} · paquet complet : {plan.measures.map((m) => m.id === 'pac' ? 'PAC' : m.id).join(', ')}</p></div>
      <div className="charts-legend" aria-hidden="true"><span><i className="seg-energy" />Énergie</span><span><i className="seg-envelope" />Enveloppe thermique</span><span><i className="seg-equipment" />Équipements techniques</span><span><i className="seg-carbon" />Carbone (200 CHF/tCO₂)</span></div>
    </div>
    <div className="charts-grid">
      <BarChart title="IDC" unit="MJ/m²/an" ariaLabel="IDC actuel et rénové" columns={[
        { label: 'Actuel', total: fmt(before.idc), segments: [{ value: before.idc, className: 'seg-energy', label: 'IDC' }] },
        { label: 'Rénové', total: fmt(after.idc), segments: [{ value: after.idc, className: 'seg-energy', label: 'IDC' }] },
      ]} />
      <BarChart title="Intensité carbone" unit="kgCO₂e/m²/an" ariaLabel="Intensité carbone actuelle et rénovée" columns={[
        { label: 'Actuel', total: fmt(before.carbon, decimals(before.carbon)), segments: [{ value: before.carbon, className: 'seg-renovation', label: 'CO₂' }] },
        { label: 'Rénové', total: fmt(after.carbon, decimals(after.carbon)), segments: [{ value: after.carbon, className: 'seg-renovation', label: 'CO₂' }] },
      ]} />
      <BarChart title="Coût annuel" unit="CHF/an" ariaLabel="Coût annuel actuel et rénové, énergie, rénovation et carbone" columns={[
        { label: 'Actuel', total: `${kchf(before.total)} CHF`, segments: costSegments(before) },
        { label: 'Rénové', total: `${kchf(after.total)} CHF`, segments: costSegments(after) },
      ]} />
      <RentChart loss={plan.rent.loss} gain={plan.rent.gain} base={plan.rent.base} />
    </div>
    <p className="subsidy-note">Subventions non appliquées : cette feuille de route est établie pour la Ville de Genève elle-même, maître d’ouvrage et propriétaire des bâtiments.</p>
    {plan.pv.reason && <p className={`pv-note ${plan.pv.blocked ? 'blocked' : ''}`}><TriangleAlert size={14} /> {plan.pv.reason}</p>}
    <details className="measures">
      <summary><span>Coût estimé des mesures de rénovation</span><strong>{kchf(plan.capex)} CHF</strong><ChevronDown size={16} /></summary>
      <div className="table-scroll"><table>
        <thead><tr><th>Mesure</th><th>Quantité</th><th>Coût unitaire</th><th>Coût</th><th>Durée de vie</th><th>Annualisé</th></tr></thead>
        <tbody>
          {plan.measures.map((m) => <tr key={m.id}>
            <td title={m.source}>{m.label}{m.proxy && <em className="proxy-tag">proxy</em>}<small>{m.source}</small></td>
            <td>{fmt(m.quantity, m.unit === 'kW' ? 1 : 0)} {m.unit}</td>
            <td>{fmt(m.unitCost)} CHF/{m.unit}</td><td><strong>{fmt(m.cost)} CHF</strong></td><td>{m.lifetime} ans</td><td>{fmt(m.annualCost)} CHF/an</td>
          </tr>)}
          <tr className="total-row"><td>Total</td><td /><td /><td><strong>{fmt(plan.capex)} CHF</strong></td><td /><td>{fmt(after.renovationCost)} CHF/an</td></tr>
        </tbody>
      </table></div>
      <p className="measures-note">Hypothèses : prix 2020 hors subventions (non appliquées : feuille de route de la Ville elle-même) ; annuité à {fmt(DISCOUNT_RATE * 100, 0)} % ; économies d’enveloppe théoriques réalisées à {fmt(REALIZED_SHARE * 100, 0)} % ; PAC air/eau COP {HEAT_PUMP_COP} ; surfaces d’éléments déduites de la SRE (hypothèse modèle) ; coût social du carbone {SOCIAL_CARBON_COST} CHF/tCO₂ ; électricité {ELECTRICITY_EMISSION} kgCO₂/kWh ; PV {fmt(PV.costPerKwc)} CHF/kWc, {fmt(PV.yield)} kWh/kWc ; loyers : {RENT.lossYears} an de loyers perdu réparti sur {RENT.spreadYears} ans, hausse de confort +{fmt(RENT.comfortUplift * 100)} %. Détail : docs/renovation/.</p>
    </details>
  </section>;
}
