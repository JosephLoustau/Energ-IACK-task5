import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight, Building2, CalendarDays, Check, ChevronRight,
<<<<<<< HEAD
  CircleHelp, FileText, Flame, Leaf, MapPin, Plus, RotateCcw, Search,
  ChartScatter, Map as MapIcon, PlayCircle, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react';
import Blason from './Blason';
import BuildingCharts from './BuildingCharts';
=======
  CircleHelp, Download, FileText, Flame, Leaf, MapPin, Plus, RotateCcw, Search,
  ChartScatter, Map as MapIcon, Wrench, PlayCircle, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react';
import Blason from './Blason';
import RenovationTab from './RenovationTab';
>>>>>>> origin/3d-view
import { DISCOUNT_RATE, ELECTRICITY_EMISSION, HEAT_PUMP_COP, PV, REALIZED_SHARE, RENT, SOCIAL_CARBON_COST } from './renovation';
import BuildingMap from './BuildingMap';
import ScatterPlot from './ScatterPlot';
import Tour from './Tour';
import { HtmlReport } from './report/HtmlReport';
import { SHADES, SHAPES, shapeFor, symbolScale } from './symbols';
import { BUILDINGS, BUILDING_USES } from './data';
import {
  BASE_YEAR, COHORTS, CRITERIA, PRESETS, assessPortfolio,
  programMetrics, renovationFor, selectProgram,
} from './model';
import type { Assessment, Cohort, Strategy, StrategyId, Thresholds } from './model';

const number = (value: number, digits = 0) => new Intl.NumberFormat('fr-CH', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value);
const percent = (value: number) => `${number(value * 100, 0)} %`;
const money = (value: number) => value >= 1_000_000
  ? `${number(value / 1_000_000, 1)} M`
  : number(value);
const cohortOrder: Cohort[] = ['now', 'five', 'ten', 'safe'];

<<<<<<< HEAD
function ThresholdControls({ value, editable, onChange }: {
=======
export function ThresholdControls({ value, editable, onChange }: {
>>>>>>> origin/3d-view
  value: Thresholds; editable: boolean; onChange: (value: Thresholds) => void;
}) {
  const fields = [
    { key: 'idc', title: 'Dépense de chaleur', unit: 'MJ/m²/an', min: 200, max: 1000, step: 10, sign: '>', description: 'IDC · priorité 1', icon: Flame },
    { key: 'condition', title: 'État du bâtiment', unit: '/ 1', min: 0, max: 1, step: 0.05, sign: '<', description: 'Vétusté (âge depuis travaux) · priorité 2', icon: Building2 },
    { key: 'carbon', title: 'Intensité carbone', unit: 'kgCO₂e/m²/an', min: 1, max: 80, step: 1, sign: '>', description: 'Émissions d’exploitation · priorité 3', icon: Leaf },
  ] as const;
  return <div className="threshold-controls">
    {fields.map(({ key, title, unit, min, max, step, sign, description, icon: Icon }) => <div className="threshold" key={key}>
      <div className="threshold-title"><Icon size={17} /><label htmlFor={`threshold-${key}`}>{title}</label></div>
      <div className="threshold-value"><strong>{sign} {number(value[key], key === 'condition' ? 2 : 0)}</strong><span>{unit}</span></div>
<<<<<<< HEAD
      <input id={`threshold-${key}`} type="range" min={min} max={max} step={step} disabled={!editable}
        value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
=======
      <div className={`range-control ${editable ? 'with-references' : ''}`}>
        <input id={`threshold-${key}`} type="range" min={min} max={max} step={step} disabled={!editable}
          aria-valuetext={`${number(value[key], key === 'condition' ? 2 : 0)} ${unit}`}
          value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
        {editable && <div className="range-references">
          {(['conservative', 'ambitious'] as const).map((id, index) => <span key={id}
            className={`range-reference ${id}`} role="img"
            aria-label={`Scénario ${index + 1}, ${PRESETS[id].name} : ${number(PRESETS[id].thresholds[key], key === 'condition' ? 2 : 0)} ${unit}`}
            data-testid={`reference-${key}-${id}`}
            style={{ left: `${(PRESETS[id].thresholds[key] - min) / (max - min) * 100}%` }}
          ><span>{index + 1}</span></span>)}
        </div>}
      </div>
      {editable && <div className="reference-values">
        {(['conservative', 'ambitious'] as const).map((id, index) => <span key={id} title={PRESETS[id].name}>
          <b className={`reference-key ${id}`}>S{index + 1}</b>
          <span>{number(PRESETS[id].thresholds[key], key === 'condition' ? 2 : 0)} <small>{unit}</small></span>
        </span>)}
      </div>}
>>>>>>> origin/3d-view
      <small>{description}</small>
    </div>)}
  </div>;
}

function FutureThresholds({ strategy, onChange }: { strategy: Strategy; onChange: (strategy: Strategy) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [year, setYear] = useState(String(BASE_YEAR + 4));
  const [idc, setIdc] = useState('450');
  const [condition, setCondition] = useState(String(strategy.thresholds.condition));
  const [carbon, setCarbon] = useState(String(strategy.thresholds.carbon));
  const [error, setError] = useState('');
  function addChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedYear = Number(year);
    const thresholds = { idc: Number(idc), condition: Number(condition), carbon: Number(carbon) };
    if (!year || !idc || !condition || !carbon || !Number.isInteger(parsedYear)
      || parsedYear <= BASE_YEAR || parsedYear > BASE_YEAR + 10
      || !Number.isFinite(thresholds.idc) || thresholds.idc <= 0
      || !Number.isFinite(thresholds.carbon) || thresholds.carbon <= 0
      || !Number.isFinite(thresholds.condition) || thresholds.condition < 0 || thresholds.condition > 1) {
      setError('Indiquez une année de 2027 à 2036, un IDC et un CO₂ positifs, et un état entre 0 et 1.');
      return;
    }
    if (strategy.changes.some((change) => change.year === parsedYear)) {
      setError('Un changement existe déjà pour cette année. Supprimez-le avant de le remplacer.');
      return;
    }
    onChange({ ...strategy, changes: [...strategy.changes, { year: parsedYear, thresholds }].sort((a, b) => a.year - b.year) });
    setError('');
    setExpanded(false);
  }
  return <div className="future-thresholds">
    <div className="section-label"><CalendarDays size={15} /> Évolution des seuils</div>
    <p>Sans calendrier chargé, les seuils restent constants. Les changements ajoutés ici sont des simulations, pas des obligations légales.</p>
    {strategy.changes.map((change) => <div className="future-row" key={change.year}>
      <div><strong>Dès {change.year}</strong><span>IDC &gt; {change.thresholds.idc} · état &lt; {number(change.thresholds.condition, 2)} · CO₂ &gt; {change.thresholds.carbon}</span></div>
      <button className="icon-button" aria-label={`Supprimer les seuils de ${change.year}`} onClick={() => onChange({ ...strategy, changes: strategy.changes.filter((item) => item.year !== change.year) })}><Trash2 size={15} /></button>
    </div>)}
    <button className="text-button" onClick={() => { setExpanded(!expanded); setError(''); }}><Plus size={15} /> Ajouter un changement futur</button>
    {expanded && <form onSubmit={addChange} className="future-form">
      <label>Année<input type="number" min={BASE_YEAR + 1} max={BASE_YEAR + 10} required value={year} onChange={(event) => setYear(event.target.value)} /></label>
      <label>IDC (MJ/m²/an)<input type="number" min="1" required value={idc} onChange={(event) => setIdc(event.target.value)} /></label>
      <label>État (0–1)<input type="number" min="0" max="1" step="0.01" required value={condition} onChange={(event) => setCondition(event.target.value)} /></label>
      <label>CO₂ (kg/m²/an)<input type="number" min="0.1" step="0.1" required value={carbon} onChange={(event) => setCarbon(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit"><Check size={15} /> Appliquer à cette année</button>
    </form>}
  </div>;
}

<<<<<<< HEAD
=======
/** Barre horizontale actuel / rénové avec repère du seuil ; les valeurs sont dans l'infobulle et le texte alternatif. */
function HorizontalBar({ label, unit, before, after, limit, color }: {
  label: string; unit: string; before: number; after: number | undefined; limit: number; color: string;
}) {
  const max = Math.max(before, after ?? 0, limit) * 1.1 || 1;
  const pct = (value: number) => `${Math.min(100, value / max * 100)}%`;
  const text = `${label} : ${number(before, before < 10 ? 1 : 0)} ${unit}${after !== undefined ? `, après rénovation ${number(after, after < 10 ? 1 : 0)}` : ''} ; seuil ${number(limit, limit < 10 ? 1 : 0)}`;
  return <div className="hbar" role="img" aria-label={text} title={text}>
    <span className="hbar-label">{label} <small>{unit}</small></span>
    <div className="hbar-track">
      <div className="hbar-fill" style={{ width: pct(before), background: color }} />
      {after !== undefined && <div className="hbar-fill after" style={{ width: pct(after) }} />}
      <div className="hbar-limit" style={{ left: pct(limit) }} />
    </div>
  </div>;
}

>>>>>>> origin/3d-view
function BuildingDetail({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  const { building, dueYear, dueThresholds, dueCondition } = assessment;
  const renovation = dueYear === null ? null : renovationFor(building, dueYear);
  const state = COHORTS[assessment.cohort];
  return <section className="detail-card" aria-label={`Fiche de ${building.name}`}>
    <div className="detail-heading"><div className="detail-icon"><Building2 size={23} /></div><div><small>{building.id} · {building.use}</small><h3>{building.name}</h3><p><MapPin size={13} /> {building.district}{building.destination ? ` · ${building.destination}` : ''}</p></div><button className="icon-button close-detail" aria-label="Fermer la fiche bâtiment" onClick={onClose}><X size={18} /></button></div>
    <span className={`status-badge ${assessment.cohort}`}>{state.label}{dueYear !== null && ` · ${dueYear}`}</span>
    <div className="detail-properties"><span>Surface énergétique<strong>{number(building.area)} m²</strong></span><span>Construction{building.imputed?.includes('year') ? ' (estimée)' : ''}<strong>{building.constructionYear}</strong></span><span>Chauffage actuel<strong>{building.heating}{building.fossil ? ' · fossile' : ''}</strong></span><span>État modélisé {BASE_YEAR}<strong>{number(building.condition, 2)}{building.effectiveAge !== undefined ? ` · âge effectif ${building.effectiveAge} ans` : ''}</strong></span><span>Dégradation simulée<strong>−{number(building.annualDecay, 3)} / an</strong></span>{building.protection && building.protection !== 'none' && <span>Protection patrimoniale<strong>{building.protection}</strong></span>}{building.idcStatus && <span>Statut IDC (OCEN)<strong>{building.idcStatus}</strong></span>}</div>
    <h4>Pourquoi cette priorité ?</h4>
    {assessment.triggers.length > 0 ? <ul className="reason-list">
      {assessment.triggers.includes('idc') && <li><Flame size={15} /><span>IDC : <strong>{building.idc} &gt; {dueThresholds.idc}</strong> MJ/m²/an</span></li>}
      {assessment.triggers.includes('condition') && <li><Building2 size={15} /><span>État en {dueYear} : <strong>{number(dueCondition, 3)} &lt; {number(dueThresholds.condition, 2)}</strong></span></li>}
      {assessment.triggers.includes('carbon') && <li><Leaf size={15} /><span>CO₂ : <strong>{number(building.carbonIntensity, 1)} &gt; {dueThresholds.carbon}</strong> kg/m²/an</span></li>}
    </ul> : <p className="muted-text">Aucun seuil franchi jusqu’en {BASE_YEAR + 10}. Surveillance recommandée, sans travaux simulés.</p>}
    <h4>{renovation ? 'Rénovation simulée à l’échéance' : 'État actuel'}</h4>
    <div className="before-after">
<<<<<<< HEAD
      <div><span>IDC <small>MJ/m²/an</small></span><strong>{building.idc}{renovation && <><ArrowRight size={13} />{number(renovation.idcAfter)}</>}</strong></div>
      <div><span>CO₂ <small>kg/m²/an</small></span><strong>{number(building.carbonIntensity, 1)}{renovation && <><ArrowRight size={13} />{number(renovation.carbonAfter, 1)}</>}</strong></div>
      <div><span>Indice d’état</span><strong>{number(renovation?.conditionBefore ?? building.condition, 2)}{renovation && <><ArrowRight size={13} />{number(renovation.conditionAfter, 2)}</>}</strong></div>
    </div>
    {renovation && <><div className="detail-investment"><span>Investissement estimé<strong>{money(renovation.cost)} CHF</strong></span><span>CO₂ évitable chaque année<strong>{number(renovation.carbonSaved, 1)} tCO₂e</strong></span></div>
      <p className="detail-note">Paquet de mesures : isolation (façade, toit, cave), fenêtres et PAC air/eau si chauffage fossile — détail des coûts sous le graphique. Faisabilité non étudiée ; hors subventions.</p>
=======
      <HorizontalBar label="IDC" unit="MJ/m²/an" before={building.idc} after={renovation?.idcAfter} limit={dueThresholds.idc} color={state.color} />
      <HorizontalBar label="CO₂" unit="kg/m²/an" before={building.carbonIntensity} after={renovation?.carbonAfter} limit={dueThresholds.carbon} color={state.color} />
      <div><span>Indice d’état</span><strong>{number(renovation?.conditionBefore ?? building.condition, 2)}{renovation && <><ArrowRight size={13} />{number(renovation.conditionAfter, 2)}</>}</strong></div>
    </div>
    {renovation && <><div className="detail-investment"><span>Investissement estimé<strong>{money(renovation.cost)} CHF</strong></span><span>CO₂ évité chaque année<strong>{number(renovation.carbonSaved, 1)} tCO₂e</strong></span></div>
      <p className="detail-note">Paquet de mesures : isolation (façade, toit, cave), fenêtres et PAC air/eau si chauffage fossile — détail dans l’onglet « Mesures de rénovation ». Faisabilité non étudiée ; hors subventions.</p>
>>>>>>> origin/3d-view
      {(renovation.idcAfter > dueThresholds.idc || renovation.carbonAfter > dueThresholds.carbon || renovation.conditionAfter < dueThresholds.condition)
        && <p className="residual-warning">L’intervention générique ne satisfait pas tous les seuils de cette stratégie. Une étude complémentaire est nécessaire.</p>}
    </>}
    <small className="fiction-note">Sources : SITG, QuantHome. Indice d’état modélisé (âge depuis construction ou derniers travaux), pas un diagnostic Stratus.{building.imputed && building.imputed.length > 0 && ` Valeurs estimées par défaut faute de donnée : ${building.imputed.map((key) => ({ idc: 'IDC', carbon: 'CO₂', year: 'année de construction' } as Record<string, string>)[key] ?? key).join(', ')}.`}{building.protection && building.protection !== 'none' && ' Bâtiment protégé : contraintes de rénovation de l’enveloppe probables.'}</small>
  </section>;
}

<<<<<<< HEAD
=======
function exportProgram(program: Assessment[], strategy: Strategy) {
  const rows = [
    ['Données SITG / QuantHome (indice d’état = proxy)', `Stratégie : ${strategy.name}`, `Année de référence : ${BASE_YEAR}`],
    ['ID', 'Adresse', 'Quartier', 'Usage', 'Échéance', 'Motifs', 'Surface m²', 'IDC MJ/m²/an', 'CO2 kg/m²/an', 'État actuel', 'État à échéance', 'Enveloppe CHF', 'Gain tCO2e/an'],
    ...program.map((item) => {
      const renovation = item.dueYear === null ? null : renovationFor(item.building, item.dueYear);
      return [
        item.building.id, item.building.name, item.building.district, item.building.use,
        item.dueYear ?? 'Surveillance', item.triggers.map((criterion) => CRITERIA[criterion]).join(', '),
        item.building.area, item.building.idc, item.building.carbonIntensity, item.building.condition,
        item.dueCondition.toFixed(3), renovation?.cost.toFixed(0) ?? '', renovation?.carbonSaved.toFixed(1) ?? '',
      ];
    }),
  ];
  const content = '\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `stratoreno-${strategy.id}-donnees-fictives.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

>>>>>>> origin/3d-view
function ShapeIcon({ use, color = '#fff', size = 16 }: { use: string; color?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true"><path d={SHAPES[shapeFor(use)]} fill={color} stroke="#111" strokeWidth="0.16" strokeLinejoin="round" /></svg>;
}

<<<<<<< HEAD
function Legend({ counts, cohort, onCohort, useCounts, uses, onToggleUse, onClearUses }: {
  counts: Record<string, number>; cohort: Cohort | null; onCohort: (value: Cohort | null) => void;
  useCounts: Record<string, number>; uses: Set<string>; onToggleUse: (use: string) => void; onClearUses: () => void;
=======
function Legend({ counts, cohort, onCohort, useCounts, uses, onToggleUse, onClearUses, onResetFilters }: {
  counts: Record<string, number>; cohort: Cohort | null; onCohort: (value: Cohort | null) => void;
  useCounts: Record<string, number>; uses: Set<string>; onToggleUse: (use: string) => void; onClearUses: () => void;
  onResetFilters: () => void;
>>>>>>> origin/3d-view
}) {
  const [open, setOpen] = useState(true);
  return <aside className={`legend-panel ${open ? '' : 'collapsed'}`} data-tour="legend" aria-label="Légende et filtres">
    <button className="legend-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>Légende & filtres <ChevronRight size={14} /></button>
<<<<<<< HEAD
    {open && <>
      <h4>Échéance <small>cliquer pour isoler</small></h4>
      <div className="legend-list">
        {cohortOrder.map((key) => <button key={key} aria-pressed={cohort === key} className={cohort === key ? 'active' : ''} onClick={() => onCohort(cohort === key ? null : key)}>
          <span className="swatches">{key === 'safe' ? <i style={{ background: '#fff' }} /> : SHADES[key].map((color) => <i key={color} style={{ background: color }} />)}</span>
=======
    <button className="legend-reset" onClick={onResetFilters} title="Effacer l’échéance, les affectations et la recherche"><RotateCcw size={13} /> Réinitialiser les filtres</button>
    {open && <>
      <h4>Échéance <small>cliquer pour isoler</small></h4>
      <div className="legend-list">
        {cohortOrder.map((key) => <button key={key} data-cohort={key} aria-pressed={cohort === key} className={cohort === key ? 'active' : ''} onClick={() => onCohort(cohort === key ? null : key)}>
          <span className="swatches">{[...new Set(SHADES[key])].map((color) => <i key={color} style={{ background: color, opacity: COHORTS[key].opacity }} />)}</span>
>>>>>>> origin/3d-view
          <span>{COHORTS[key].short}</span><strong>{counts[key]}</strong>
        </button>)}
      </div>
      <p className="legend-hint">Les trois teintes = 1, 2 ou 3 critères dépassés (IDC, CO₂, vétusté).</p>
<<<<<<< HEAD
      <h4>Affectation <small>{uses.size ? `${uses.size} sélectionnée(s)` : 'toutes'}</small>{uses.size > 0 && <button className="text-button" onClick={onClearUses}>Tout afficher</button>}</h4>
      <div className="legend-list">
        {BUILDING_USES.map((use) => <button key={use} aria-pressed={uses.has(use)} className={uses.has(use) ? 'active' : ''} onClick={() => onToggleUse(use)}>
          <ShapeIcon use={use} color="#f6c51c" /><span>{use}</span><strong>{useCounts[use] ?? 0}</strong>
        </button>)}
      </div>
      <h4>Taille <small>surface de référence énergétique</small></h4>
      <div className="size-legend">{[200, 2000, 10000, 25000].map((sre) => <span key={sre}><svg width="40" height="40" viewBox="-20 -20 40 40" aria-hidden="true"><circle r={11 * symbolScale(sre)} fill="#f6c51c" stroke="#111" strokeWidth="1.3" /></svg>{number(sre)} m²</span>)}</div>
=======
      <p className="legend-hint">Rouge, jaune et vert : pleine opacité. Au-delà de 10 ans : gris à 30 %. L’horizon des KPI ne masque aucun point. « Sous 10 ans » couvre les besoins entre 5 et 10 ans.</p>
      <h4>Affectation <small>{uses.size ? `${uses.size} sélectionnée(s)` : 'toutes'}</small>{uses.size > 0 && <button className="text-button" onClick={onClearUses}>Tout afficher</button>}</h4>
      <div className="legend-list">
        {BUILDING_USES.map((use) => <button key={use} aria-pressed={uses.has(use)} className={`use-filter ${uses.has(use) ? 'active' : ''}`} onClick={() => onToggleUse(use)}>
          <ShapeIcon use={use} color="#347bc1" /><span>{use}</span><strong>{useCounts[use] ?? 0}</strong>
        </button>)}
      </div>
      <h4>Taille <small>surface de référence énergétique</small></h4>
      <div className="size-legend">{[200, 2000, 10000, 25000].map((sre) => <span key={sre}><svg width="40" height="40" viewBox="-20 -20 40 40" aria-hidden="true"><circle r={11 * symbolScale(sre)} fill="#347bc1" stroke="#111" strokeWidth="1.3" /></svg>{number(sre)} m²</span>)}</div>
>>>>>>> origin/3d-view
    </>}
  </aside>;
}

export default function App() {
  const [strategyId, setStrategyId] = useState<StrategyId>('conservative');
  const [customBase, setCustomBase] = useState<'conservative' | 'ambitious'>('conservative');
<<<<<<< HEAD
  const [custom, setCustom] = useState<Strategy>({ ...PRESETS.conservative, id: 'custom', name: 'Personnalisée', thresholds: { ...PRESETS.conservative.thresholds }, changes: [] });
=======
  const [custom, setCustom] = useState<Strategy>({ ...PRESETS.conservative, id: 'custom', name: 'Modulable', thresholds: { ...PRESETS.conservative.thresholds }, changes: [] });
>>>>>>> origin/3d-view
  const [horizon, setHorizon] = useState(0);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [uses, setUses] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
<<<<<<< HEAD
  const [tab, setTab] = useState<'map' | 'chart'>('map');
=======
  const [tab, setTab] = useState<'map' | 'chart' | 'measures'>('map');
>>>>>>> origin/3d-view
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const strategy = strategyId === 'custom' ? custom : PRESETS[strategyId];
  const portfolio = useMemo(() => assessPortfolio(BUILDINGS, strategy), [strategy]);
  const filtered = useMemo(() => portfolio.filter((item) =>
    (uses.size === 0 || uses.has(item.building.use))
    && `${item.building.name} ${item.building.district} ${item.building.id}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')),
  ), [portfolio, uses, query]);
  const program = selectProgram(filtered, horizon, cohort);
  const metrics = programMetrics(program);
<<<<<<< HEAD
  const programIds = useMemo(() => new Set(program.map((item) => item.building.id)), [program]);
  // Une catégorie choisie n'affiche que ses points ; sinon les points hors horizon sont atténués.
  const visible = useMemo(() => cohort ? filtered.filter((item) => item.cohort === cohort) : filtered, [filtered, cohort]);
  const mutedIds = useMemo(() => cohort ? new Set<string>() : new Set(filtered.filter((item) => !programIds.has(item.building.id)).map((item) => item.building.id)), [filtered, cohort, programIds]);
=======
  const programArea = program.reduce((sum, item) => sum + item.building.area, 0);
  const visible = useMemo(() => cohort ? filtered.filter((item) => item.cohort === cohort) : filtered, [filtered, cohort]);
>>>>>>> origin/3d-view
  const selectedAssessment = visible.find((item) => item.building.id === selected);
  const selectionLabel = cohort ? COHORTS[cohort].label
    : horizon === 0 ? 'Programme immédiat' : `Programme cumulé d’ici ${BASE_YEAR + horizon}`;
  const counts = Object.fromEntries(cohortOrder.map((key) => [key, filtered.filter((item) => item.cohort === key).length]));
  const useCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of portfolio) result[item.building.use] = (result[item.building.use] ?? 0) + 1;
    return result;
  }, [portfolio]);

  function resetCustom(base = customBase) {
    setCustomBase(base);
<<<<<<< HEAD
    setCustom({ ...PRESETS[base], id: 'custom', name: 'Personnalisée', thresholds: { ...PRESETS[base].thresholds }, changes: [] });
=======
    setCustom({ ...PRESETS[base], id: 'custom', name: 'Modulable', thresholds: { ...PRESETS[base].thresholds }, changes: [] });
>>>>>>> origin/3d-view
  }
  function toggleUse(use: string) {
    setUses((current) => { const next = new Set(current); if (!next.delete(use)) next.add(use); return next; });
    setSelected(null);
  }
<<<<<<< HEAD
  function exportReport() {
    const strategies = strategyId === 'custom' ? [PRESETS.conservative, PRESETS.ambitious, custom] : [PRESETS.conservative, PRESETS.ambitious];
    const scope = [uses.size ? [...uses].join(', ') : 'tout le parc', query.trim() && `recherche « ${query.trim()} »`].filter(Boolean).join(' · ');
    new HtmlReport({ buildings: filtered.map((item) => item.building), strategies, selectedStrategy: strategy.id, scopeLabel: scope }).open();
  }
  const onTourEnter = useCallback((action: 'tab-map' | 'tab-chart') => setTab(action === 'tab-map' ? 'map' : 'chart'), []);

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#main"><Blason size={34} /><span>énergi<span className="brand-emphasis">ACK</span><small>VILLE DE GENÈVE · SORTIE DES ÉNERGIES FOSSILES</small></span></a>
      <div className="topbar-right">
        <span className="topbar-count"><strong>{BUILDINGS.length}</strong> bâtiments de la Ville</span>
        <button className="help-button" onClick={() => setTourOpen(true)}><PlayCircle size={16} /> Visite guidée</button>
        <button className="help-button" disabled={filtered.length === 0} onClick={exportReport}><FileText size={16} /> Rapport HTML</button>
=======
  function resetFilters() {
    setCohort(null);
    setUses(new Set());
    setQuery('');
    setSelected(null);
  }
  function exportReport() {
    const strategies = strategyId === 'custom' ? [PRESETS.conservative, PRESETS.ambitious, custom] : [PRESETS.conservative, PRESETS.ambitious];
    const scope = [uses.size ? [...uses].join(', ') : 'tout le parc', query.trim() && `recherche « ${query.trim()} »`].filter(Boolean).join(' · ');
    new HtmlReport({ buildings: filtered.map((item) => item.building), strategies, selectedStrategy: strategy.id, scopeLabel: scope }).download();
  }
  const onTourEnter = useCallback((action: 'tab-map' | 'tab-chart') => setTab(action === 'tab-map' ? 'map' : 'chart'), []);

  return <div className="app-shell" data-strategy={strategyId}>
    <header className="topbar">
      <a className="brand" href="#main" aria-label="StratoRéno — tableau de bord"><Blason /><span>Strato<span className="brand-emphasis">Réno</span><small>STRATÉGIE DE RÉNOVATION</small></span></a>
      <div className="topbar-right">
        <span className="topbar-count"><strong>{BUILDINGS.length}</strong> bâtiments de la Ville</span>
        <button className="help-button" onClick={() => setTourOpen(true)}><PlayCircle size={16} /> Visite guidée</button>
>>>>>>> origin/3d-view
        <button className="help-button" onClick={() => setShowAssumptions(true)} aria-expanded={showAssumptions}><CircleHelp size={16} /> Méthode & hypothèses</button>
      </div>
    </header>

    {showAssumptions && <div className="drawer-backdrop" onClick={() => setShowAssumptions(false)}>
      <section className="assumptions-panel" role="dialog" aria-label="Méthode et hypothèses" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading"><h2>Méthode & hypothèses</h2><button className="icon-button" autoFocus aria-label="Fermer les hypothèses" onClick={() => setShowAssumptions(false)}><X size={18} /></button></div>
        <p className="data-note"><ShieldCheck size={15} /> <span><strong>Données réelles, projections simulées.</strong> Parc SITG / QuantHome ; IDC et CO₂ parfois estimés, indice d’état modélisé. Coûts et seuils non validés réglementairement. Année de référence {BASE_YEAR}.</span></p>
        <div className="assumptions-grid">
          <div><h3>Déclenchement et priorité</h3><p>Un seul critère hors seuil suffit. Premier franchissement calculé chaque année de {BASE_YEAR} à {BASE_YEAR + 10}. Tri par année, puis critères déclenchés : IDC → état → CO₂, puis gain carbone annuel décroissant.</p></div>
          <div><h3>Projection sans travaux</h3><p>État = 1 si construction ou derniers travaux ont moins de 10 ans, puis −0,01 par an (0,40 à 70 ans), puis −0,005 par an. IDC et CO₂ constants. Un changement de seuil s’applique dès son année et reste actif jusqu’au suivant. Aucun calendrier légal chargé.</p></div>
          <div><h3>Paquet de rénovation</h3><p>Enveloppe thermique : isolation façade, toiture et cave, fenêtres. Équipements techniques : PAC air/eau (COP {number(HEAT_PUMP_COP, 1)}) si le chauffage est fossile, et photovoltaïque en toiture pour réduire les imports d’électricité (impossible sur un bâtiment protégé). Économies d’enveloppe par ΔU × degrés-jours genevois, réalisées à {percent(REALIZED_SHARE)} et plafonnées à 70 % du chauffage. État remis à 1. Sources : docs/renovation/.</p></div>
          <div><h3>Coûts</h3><p>Investissement = quantité × coût unitaire par mesure (prix 2020), annualisé à {percent(DISCOUNT_RATE)} sur la durée de vie ; barres : enveloppe thermique en vert foncé, équipements en vert clair. Énergie : prix LICS 2020. <strong>Subventions non appliquées</strong> : la feuille de route est établie pour la Ville de Genève elle-même. Moyennes pondérées par la surface.</p></div>
          <div><h3>Carbone et électricité</h3><p>Coût social du carbone : <strong>{SOCIAL_CARBON_COST} CHF/tCO₂e</strong>, appliqué aux émissions annuelles. Facteur d’émission de l’électricité du réseau : <strong>{number(ELECTRICITY_EMISSION, 3)} kgCO₂e/kWh</strong> (convention directe, HFM2015 Tab. 6) ; les émissions du gaz et du mazout viennent des données SITG/QuantHome (scope 1).</p></div>
          <div><h3>Photovoltaïque</h3><p>{number(PV.costPerKwc)} CHF/kWc, productible {number(PV.yield)} kWh/kWc·an, {PV.lifetime} ans, entretien {number(PV.maintenance * 100)} ct/kWh (SWISSOLAR2024). Puissance limitée par la toiture ({number(PV.kwcPerM2, 1)} kWc/m² × part de toiture ensoleillée OCEN) et par la consommation électrique de chauffage. Non installable sur les bâtiments protégés (classés ou à l’inventaire).</p></div>
          <div><h3>Loyers</h3><p>Manque à gagner : {RENT.lossYears} an de loyers résidentiels non perçus pendant les travaux, réparti sur {RENT.spreadYears} ans. Hausse de loyer liée au confort : +{percent(RENT.comfortUplift)} des loyers (hypothèse modèle, non sourcée). Composantes du graphique des coûts annuels : le manque à gagner est tracé sous l’axe, la hausse de loyer au-dessus.</p></div>
<<<<<<< HEAD
          <div><h3>Lecture de la carte</h3><p>Taille du symbole ∝ √SRE, forme = affectation, couleur = échéance (rouge : immédiat, jaune : sous 5 ans, gris : sous 10 ans, blanc : surveillance), teinte plus foncée = plus de critères dépassés.</p></div>
=======
          <div><h3>Lecture de la carte</h3><p>Taille du symbole ∝ √SRE, forme = affectation, couleur = échéance (rouge : immédiat, jaune : sous 5 ans, vert : sous 10 ans, gris à 30 % : surveillance au-delà de 10 ans), teinte plus foncée = plus de critères dépassés. Le gris ne prédit pas une date de rénovation après 2036.</p></div>
>>>>>>> origin/3d-view
        </div>
        <p className="assumption-footer">Les KPI sont le potentiel annuel des travaux achevés, pas un cumul des émissions évitées. La faisabilité technique, le patrimoine protégé et les contraintes de réseau ne sont pas modélisés. La maquette ne démontre pas la sortie complète des fossiles.</p>
      </section>
    </div>}

    <main id="main">
      <div className="workspace">
        <aside className="strategy-panel">
          <div data-tour="strategies">
            <div className="section-label"><SlidersHorizontal size={16} /> SCÉNARIO</div>
            <div className="strategy-options">
              {([
<<<<<<< HEAD
                { id: 'conservative', title: 'Conservatoire', subtitle: 'Cadre législatif à valider', icon: ShieldCheck, index: '01' },
                { id: 'ambitious', title: 'Accélération carbone', subtitle: 'Une ambition visionnaire', icon: Sparkles, index: '02' },
                { id: 'custom', title: 'À votre mesure', subtitle: 'Seuils et trajectoire libres', icon: SlidersHorizontal, index: '03' },
              ] as const).map(({ id, title, subtitle, icon: Icon, index }) => <button key={id} className={`strategy-option ${strategyId === id ? 'active' : ''}`} aria-pressed={strategyId === id} onClick={() => setStrategyId(id)}>
=======
                { id: 'conservative', title: PRESETS.conservative.name, subtitle: 'Cadre législatif à valider', icon: ShieldCheck, index: '01' },
                { id: 'ambitious', title: PRESETS.ambitious.name, subtitle: 'Une ambition visionnaire', icon: Sparkles, index: '02' },
                { id: 'custom', title: 'Modulable', subtitle: 'Seuils et trajectoire libres', icon: SlidersHorizontal, index: '03' },
              ] as const).map(({ id, title, subtitle, icon: Icon, index }) => <button key={id} data-strategy={id} className={`strategy-option ${strategyId === id ? 'active' : ''}`} aria-pressed={strategyId === id} onClick={() => setStrategyId(id)}>
>>>>>>> origin/3d-view
                <span className="strategy-option-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><span className="strategy-option-number">{strategyId === id ? <Check size={17} /> : index}</span>
              </button>)}
            </div>
          </div>
<<<<<<< HEAD
          {strategyId === 'custom' && <div className="custom-base"><label htmlFor="custom-base">Partir de la stratégie</label><select id="custom-base" value={customBase} onChange={(event) => resetCustom(event.target.value === 'ambitious' ? 'ambitious' : 'conservative')}><option value="conservative">Conservatoire</option><option value="ambitious">Accélération carbone</option></select><small>Changer la base réinitialise les curseurs et les seuils futurs.</small></div>}
=======
          {strategyId === 'custom' && <div className="custom-base"><label htmlFor="custom-base">Partir du scénario</label><select id="custom-base" value={customBase} onChange={(event) => resetCustom(event.target.value === 'ambitious' ? 'ambitious' : 'conservative')}><option value="conservative">{PRESETS.conservative.name}</option><option value="ambitious">{PRESETS.ambitious.name}</option></select><small>Changer la base réinitialise les curseurs et les seuils futurs.</small></div>}
>>>>>>> origin/3d-view
          <div data-tour="thresholds">
            <div className="threshold-heading"><h3>Seuils en {BASE_YEAR}</h3>{strategyId === 'custom' ? <button className="icon-button" aria-label="Réinitialiser la stratégie personnalisée" onClick={() => resetCustom()}><RotateCcw size={14} /></button> : <span className="fixed-tag">PRÉDÉFINIS</span>}</div>
            <ThresholdControls value={strategy.thresholds} editable={strategyId === 'custom'} onChange={(thresholds) => setCustom({ ...custom, thresholds })} />
            {strategyId !== 'custom' && <button className="text-button customize-link" onClick={() => { resetCustom(strategyId); setStrategyId('custom'); }}>Personnaliser cette stratégie <ArrowRight size={14} /></button>}
          </div>
<<<<<<< HEAD
          {strategyId === 'custom' ? <FutureThresholds key={customBase} strategy={custom} onChange={setCustom} /> : <div className="calendar-note"><CalendarDays size={17} /><p><strong>Seuils constants par défaut</strong>Aucun calendrier réglementaire chargé. Simulez une évolution dans « À votre mesure ».</p></div>}
=======
          {strategyId === 'custom' ? <FutureThresholds key={customBase} strategy={custom} onChange={setCustom} /> : <div className="calendar-note"><CalendarDays size={17} /><p><strong>Seuils constants par défaut</strong>Aucun calendrier réglementaire chargé. Simulez une évolution dans « Modulable ».</p></div>}
>>>>>>> origin/3d-view
          <div className="priority-note"><span className="live-dot" /><p>Un critère suffit à déclencher. <strong>Priorité IDC → état → CO₂</strong></p></div>
        </aside>

        <div className="stage">
          <section className="kpi-strip" data-tour="kpis" aria-live="polite" aria-atomic="true" data-testid="kpis">
<<<<<<< HEAD
            <div className="kpi-title"><div className="section-label">{selectionLabel.toUpperCase()}</div><p>{metrics.count} bât. à rénover · {number(metrics.area)} m²{cohort === 'safe' && ` · ${program.length} en surveillance`}</p></div>
=======
            <div className="program-summary">
              <div className="kpi-title">
                <div className="section-label">IMPACT DU PROGRAMME DE RÉNOVATION</div>
                <h2>{selectionLabel}</h2>
                <div className="program-totals">
                  <div className="program-total"><Building2 size={21} /><strong data-testid="program-count">{number(program.length)}</strong><span>{cohort === 'safe' ? 'bâtiments à surveiller' : 'bâtiments à rénover'}</span></div>
                  <div className="program-total"><strong data-testid="program-area">{number(programArea)}</strong><span><b>m²</b> {cohort === 'safe' ? 'sous surveillance' : 'concernés'}</span></div>
                </div>
              </div>
              <div className="horizon-control" aria-label="Horizon du programme cumulé">{[0, 5, 10].map((value) => <button key={value} className={cohort === null && horizon === value ? 'active' : ''} aria-pressed={cohort === null && horizon === value} onClick={() => { setHorizon(value); setCohort(null); }}>{value === 0 ? 'Aujourd’hui' : `D’ici ${BASE_YEAR + value}`}</button>)}</div>
            </div>
>>>>>>> origin/3d-view
            <article className="kpi-card"><div className="kpi-label"><span>Enveloppe</span><Wallet size={14} /></div><div className="kpi-value">{money(metrics.cost)}<small>CHF</small></div></article>
            <article className="kpi-card"><div className="kpi-label"><span>CO₂ évitable / an</span><Leaf size={14} /></div><div className="kpi-value">{number(metrics.carbonSaved)}<small>tCO₂e · {percent(metrics.carbonReduction)}</small></div></article>
            <article className="kpi-card"><div className="kpi-label"><span>IDC moyen</span><Flame size={14} /></div><div className="kpi-value transition-value">{metrics.count ? number(metrics.idcBefore) : '—'}<ArrowRight size={15} /><span>{metrics.count ? number(metrics.idcAfter) : '—'}</span></div></article>
            <article className="kpi-card"><div className="kpi-label"><span>État moyen</span><TrendingUp size={14} /></div><div className="kpi-value transition-value">{metrics.count ? number(metrics.conditionBefore, 2) : '—'}<ArrowRight size={15} /><span>{metrics.count ? number(metrics.conditionAfter, 2) : '—'}</span></div></article>
<<<<<<< HEAD
            <div className="horizon-control" aria-label="Horizon du programme cumulé">{[0, 5, 10].map((value) => <button key={value} className={cohort === null && horizon === value ? 'active' : ''} aria-pressed={cohort === null && horizon === value} onClick={() => { setHorizon(value); setCohort(null); }}>{value === 0 ? 'Aujourd’hui' : `D’ici ${BASE_YEAR + value}`}</button>)}</div>
=======
>>>>>>> origin/3d-view
          </section>

          <section className="view-panel" data-tour="map">
            <div className="view-header">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'map'} className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><MapIcon size={15} /> Carte</button>
                <button role="tab" aria-selected={tab === 'chart'} className={tab === 'chart' ? 'active' : ''} data-tour="chart-tab" onClick={() => setTab('chart')}><ChartScatter size={15} /> Diagramme IDC × CO₂</button>
<<<<<<< HEAD
=======
                <button role="tab" aria-selected={tab === 'measures'} className={tab === 'measures' ? 'active' : ''} data-tour="measures-tab" onClick={() => setTab('measures')}><Wrench size={15} /> Mesures de rénovation</button>
>>>>>>> origin/3d-view
              </div>
              <label className="search-box"><Search size={15} /><input type="search" aria-label="Rechercher un bâtiment ou quartier" placeholder="Adresse, quartier, EGID…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} /></label>
              <span className="map-count"><MapPin size={13} /> {visible.length} / {BUILDINGS.length}</span>
            </div>
            <div className="view-body">
<<<<<<< HEAD
              <div className={`view-pane ${tab === 'map' ? '' : 'hidden'}`}><BuildingMap assessments={visible} mutedIds={mutedIds} selected={selectedAssessment?.building.id ?? null} active={tab === 'map'} onSelect={setSelected} /></div>
              {tab === 'chart' && <div className="view-pane"><ScatterPlot assessments={visible} mutedIds={mutedIds} selected={selectedAssessment?.building.id ?? null} strategy={strategy} year={BASE_YEAR + horizon} onSelect={setSelected} /></div>}
              <Legend counts={counts} cohort={cohort} onCohort={(value) => { setCohort(value); setSelected(null); }} useCounts={useCounts} uses={uses} onToggleUse={toggleUse} onClearUses={() => setUses(new Set())} />
              {selectedAssessment && <div className="detail-float"><BuildingDetail assessment={selectedAssessment} onClose={() => setSelected(null)} /></div>}
            </div>
          </section>

          {selectedAssessment && <BuildingCharts building={selectedAssessment.building} />}

          <section className="building-list" data-tour="roadmap">
            <div className="list-heading"><div><h2>{cohort === 'safe' ? 'Bâtiments à surveiller' : 'Votre feuille de route'}</h2><p>{program.length} bâtiments · {cohort === 'safe' ? 'pas de rénovation simulée' : 'échéance, critères puis impact carbone'}</p></div></div>
            <div className="table-scroll"><table><thead><tr><th>Bâtiment / quartier</th><th>Échéance</th><th>IDC<small>MJ/m²/an</small></th><th>État</th><th>CO₂<small>kg/m²/an</small></th><th>Motif principal</th><th aria-label="Ouvrir la fiche" /></tr></thead><tbody>
=======
              <div className={`view-pane ${tab === 'map' ? '' : 'hidden'}`}><BuildingMap assessments={visible} selected={selectedAssessment?.building.id ?? null} active={tab === 'map'} onSelect={setSelected} /></div>
              {tab === 'chart' && <div className="view-pane"><ScatterPlot assessments={visible} selected={selectedAssessment?.building.id ?? null} strategy={strategy} year={BASE_YEAR + horizon} onSelect={setSelected} /></div>}
              {tab === 'measures' && <div className="view-pane measures-pane">{selectedAssessment
                ? <RenovationTab key={selectedAssessment.building.id} building={selectedAssessment.building} onShowOnMap={() => setTab('map')} />
                : <div className="empty-state"><Wrench size={27} /><h3>Aucun bâtiment sélectionné</h3><p>Choisissez un bâtiment sur la carte, dans le diagramme ou dans la feuille de route (pictogramme <Wrench size={12} />) pour étudier ses mesures de rénovation.</p></div>}</div>}
              {tab !== 'measures' && <Legend counts={counts} cohort={cohort} onCohort={(value) => { setCohort(value); setSelected(null); }} useCounts={useCounts} uses={uses} onToggleUse={toggleUse} onClearUses={() => setUses(new Set())} onResetFilters={resetFilters} />}
              {tab !== 'measures' && selectedAssessment && <div className="detail-float"><BuildingDetail assessment={selectedAssessment} onClose={() => setSelected(null)} /></div>}
            </div>
          </section>

          <section className="building-list" data-tour="roadmap">
            <div className="list-heading"><div><h2>{cohort === 'safe' ? 'Bâtiments à surveiller' : 'Votre feuille de route'}</h2><p>{program.length} bâtiments · {cohort === 'safe' ? 'pas de rénovation simulée' : 'échéance, critères puis impact carbone'}</p></div><div className="export-actions"><button className="export-button" disabled={program.length === 0} onClick={() => exportProgram(program, strategy)}><Download size={15} /> Export CSV</button><button className="export-button" disabled={filtered.length === 0} onClick={exportReport}><FileText size={15} /> Rapport HTML</button></div></div>
            <div className="table-scroll"><table><thead><tr><th>Bâtiment / quartier</th><th>Échéance</th><th>IDC<small>MJ/m²/an</small></th><th>État</th><th>CO₂<small>kg/m²/an</small></th><th>Motif principal</th><th aria-label="Actions" /></tr></thead><tbody>
>>>>>>> origin/3d-view
              {program.map((item) => <tr key={item.building.id} className={selected === item.building.id ? 'selected-row' : ''}>
                <td><button className="building-name" onClick={() => { setSelected(item.building.id); if (tab === 'map') window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{item.building.name}<small>{item.building.district} · {item.building.use}</small></button></td>
                <td><span className={`table-status ${item.cohort}`}><span />{item.dueYear ?? 'Suivi'}</span></td>
                <td>{item.building.idc}</td><td>{number(item.building.condition, 2)}</td><td>{number(item.building.carbonIntensity, 1)}</td>
                <td><span className="reason-tag">{item.triggers[0] ? CRITERIA[item.triggers[0]] : 'Aucun seuil franchi'}</span></td>
<<<<<<< HEAD
                <td><button className="icon-button" aria-label={`Ouvrir ${item.building.name}`} onClick={() => setSelected(item.building.id)}><ChevronRight size={16} /></button></td>
=======
                <td className="row-actions">
                  <button className="icon-button" aria-label={`Voir ${item.building.name} sur la carte`} title="Voir sur la carte" onClick={() => { setSelected(item.building.id); setTab('map'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><MapPin size={16} /></button>
                  <button className="icon-button" aria-label={`Mesures de rénovation de ${item.building.name}`} title="Mesures de rénovation" onClick={() => { setSelected(item.building.id); setTab('measures'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Wrench size={16} /></button>
                </td>
>>>>>>> origin/3d-view
              </tr>)}
            </tbody></table></div>
            {program.length === 0 && <div className="empty-state"><Building2 size={27} /><h3>Aucun bâtiment dans cette sélection</h3><p>Changez d’horizon, de catégorie ou de filtre pour explorer le parc.</p></div>}
          </section>
        </div>
      </div>
    </main>
<<<<<<< HEAD
    <footer className="site-footer"><span>énergiACK <span>·</span> Défi 5 — Sortir des énergies fossiles</span><span>Données SITG / QuantHome · fond de carte swisstopo</span></footer>
=======
    <footer className="site-footer"><span>StratoRéno <span>·</span> Défi 5 — Sortir des énergies fossiles</span><span>Données SITG / QuantHome · fond de carte swisstopo</span></footer>
>>>>>>> origin/3d-view
    <Tour open={tourOpen} onClose={() => setTourOpen(false)} onEnter={onTourEnter} />
  </div>;
}
