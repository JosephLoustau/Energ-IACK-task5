import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight, Building2, CalendarDays, Check, ChevronRight,
  CircleHelp, Download, Flame, Leaf, MapPin, Plus, RotateCcw, Search,
  ChartScatter, Map as MapIcon, Wrench, PlayCircle, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react';
import Blason from './Blason';
import RenovationTab from './RenovationTab';
import { CARRIERS, DEFAULT_WINDOW_SHARE, DISCOUNT_RATE, ELEMENT_RATIO, EMBODIED, ELECTRICITY_EMISSION, HEAT_PUMP_COP, PV, REALIZED_SHARE, RENT, SOCIAL_CARBON_COST, WINDOW_SHARE } from './renovation';
import BuildingMap from './BuildingMap';
import ScatterPlot from './ScatterPlot';
import Tour from './Tour';
import { HtmlReport } from './report/HtmlReport';
import { SHADES, SHAPES, shapeFor, symbolScale } from './symbols';
import { BUILDINGS, BUILDING_USES } from './data';
import {
  BASE_YEAR, COHORTS, CRITERIA, DASHBOARD_LAST_YEAR, DEEP_RENOVATION_CONDITION, DEPTHS, MAX_HORIZON, PRESETS, TARGET_YEAR, assessPortfolio,
  describeBreach, describeDepth, describeDue, inDashboardProgram, programMetrics, renovationFor, selectProgram,
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

export function ThresholdControls({ value, editable, onChange }: {
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
      || parsedYear <= BASE_YEAR || parsedYear > TARGET_YEAR
      || !Number.isFinite(thresholds.idc) || thresholds.idc <= 0
      || !Number.isFinite(thresholds.carbon) || thresholds.carbon <= 0
      || !Number.isFinite(thresholds.condition) || thresholds.condition < 0 || thresholds.condition > 1) {
      setError(`Indiquez une année de ${BASE_YEAR + 1} à ${TARGET_YEAR}, un IDC et un CO₂ positifs, et un état entre 0 et 1.`);
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
    <p>Sans calendrier chargé, les seuils restent constants. Les changements ajoutés ici sont des simulations, pas des obligations légales. Années possibles : {BASE_YEAR + 1} à {TARGET_YEAR}. Les couleurs et le programme du tableau de bord couvrent {BASE_YEAR}–{DASHBOARD_LAST_YEAR} ; un changement après {DASHBOARD_LAST_YEAR} laisse le bâtiment en gris, avec son année de premier dépassement sur la fiche, et entre dans la feuille de route du rapport HTML (jusqu’en {TARGET_YEAR}).</p>
    {strategy.changes.map((change) => <div className="future-row" key={change.year}>
      <div><strong>Dès {change.year}</strong><span>IDC &gt; {change.thresholds.idc} · état &lt; {number(change.thresholds.condition, 2)} · CO₂ &gt; {change.thresholds.carbon}</span></div>
      <button className="icon-button" aria-label={`Supprimer les seuils de ${change.year}`} onClick={() => onChange({ ...strategy, changes: strategy.changes.filter((item) => item.year !== change.year) })}><Trash2 size={15} /></button>
    </div>)}
    <button className="text-button" onClick={() => { setExpanded(!expanded); setError(''); }}><Plus size={15} /> Ajouter un changement futur</button>
    {expanded && <form onSubmit={addChange} className="future-form">
      <label>Année<input type="number" min={BASE_YEAR + 1} max={TARGET_YEAR} required value={year} onChange={(event) => setYear(event.target.value)} /></label>
      <label>IDC (MJ/m²/an)<input type="number" min="1" required value={idc} onChange={(event) => setIdc(event.target.value)} /></label>
      <label>État (0–1)<input type="number" min="0" max="1" step="0.01" required value={condition} onChange={(event) => setCondition(event.target.value)} /></label>
      <label>CO₂ (kg/m²/an)<input type="number" min="0.1" step="0.1" required value={carbon} onChange={(event) => setCarbon(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit"><Check size={15} /> Appliquer à cette année</button>
    </form>}
  </div>;
}

/** Barre horizontale actuel / rénové avec repère du seuil ; les valeurs sont dans l'infobulle et le texte alternatif. */
function HorizontalBar({ label, unit, before, after, limit, limitYear, color }: {
  label: string; unit: string; before: number; after: number | undefined; limit: number; limitYear: number; color: string;
}) {
  const max = Math.max(before, after ?? 0, limit) * 1.1 || 1;
  const pct = (value: number) => `${Math.min(100, value / max * 100)}%`;
  const text = `${label} : ${number(before, before < 10 ? 1 : 0)} ${unit}${after !== undefined ? `, après rénovation ${number(after, after < 10 ? 1 : 0)}` : ''} ; seuil ${limitYear} : ${number(limit, limit < 10 ? 1 : 0)}`;
  return <div className="hbar" role="img" aria-label={text} title={text}>
    <span className="hbar-label">{label} <small>{unit} · seuil {limitYear}</small></span>
    <div className="hbar-track">
      <div className="hbar-fill" style={{ width: pct(before), background: color }} />
      {after !== undefined && <div className="hbar-fill after" style={{ width: pct(after) }} />}
      <div className="hbar-limit" style={{ left: pct(limit) }} />
    </div>
  </div>;
}

function BuildingDetail({ assessment, strategy, onClose }: { assessment: Assessment; strategy: Strategy; onClose: () => void }) {
  const { building, dueYear, dueThresholds, dueCondition } = assessment;
  // Le gris peut avoir une année de dépassement au-delà de l'horizon du tableau de bord, sans travaux simulés.
  const renovation = inDashboardProgram(assessment) ? renovationFor(building, dueYear!, strategy, DASHBOARD_LAST_YEAR) : null;
  const due = describeDue(assessment);
  const thresholdYear = dueYear ?? TARGET_YEAR;
  const state = COHORTS[assessment.cohort];
  return <section className="detail-card" aria-label={`Fiche de ${building.name}`}>
    <div className="detail-heading"><div className="detail-icon"><Building2 size={23} /></div><div><small>{building.id} · {building.use}</small><h3>{building.name}</h3><p><MapPin size={13} /> {building.district}{building.destination ? ` · ${building.destination}` : ''}</p></div><button className="icon-button close-detail" aria-label="Fermer la fiche bâtiment" onClick={onClose}><X size={18} /></button></div>
    <span className={`status-badge ${assessment.cohort}`}>{state.label}{dueYear !== null && (renovation ? ` · ${dueYear}` : ` · 1er dépassement ${dueYear}`)}</span>
    <div className="detail-properties"><span>Surface énergétique<strong>{number(building.area)} m²</strong></span><span>Construction{building.imputed?.includes('year') ? ' (estimée)' : ''}<strong>{building.constructionYear}</strong></span><span>Chauffage actuel<strong>{building.heating}{building.fossil ? ' · fossile' : ''}</strong></span><span>État modélisé {BASE_YEAR}<strong>{number(building.condition, 2)}{building.effectiveAge !== undefined ? ` · âge effectif ${building.effectiveAge} ans` : ''}</strong></span><span>Dégradation simulée<strong>−{number(building.annualDecay, 3)} / an</strong></span>{building.protection && building.protection !== 'none' && <span>Protection patrimoniale<strong>{building.protection}</strong></span>}{building.idcStatus && <span>Statut IDC (OCEN)<strong>{building.idcStatus}</strong></span>}</div>
    <h4>Pourquoi cette priorité ?</h4>
    {renovation ? <ul className="reason-list">
      {assessment.triggers.includes('idc') && <li><Flame size={15} /><span>IDC en {dueYear} : <strong>{building.idc} &gt; {dueThresholds.idc}</strong> MJ/m²/an</span></li>}
      {assessment.triggers.includes('condition') && <li><Building2 size={15} /><span>État en {dueYear} : <strong>{number(dueCondition, 3)} &lt; {number(dueThresholds.condition, 2)}</strong></span></li>}
      {assessment.triggers.includes('carbon') && <li><Leaf size={15} /><span>CO₂ en {dueYear} : <strong>{number(building.carbonIntensity, 1)} &gt; {dueThresholds.carbon}</strong> kg/m²/an</span></li>}
    </ul> : <p className="muted-text">Aucun seuil dépassé jusqu’en {DASHBOARD_LAST_YEAR}{due ? ` ; ${due} (seuils en vigueur cette année-là).` : ` ni jusqu’en ${TARGET_YEAR}.`} Surveillance recommandée, sans travaux simulés.</p>}
    <h4>{renovation ? `${DEPTHS[renovation.depth].label} simulée en ${dueYear}` : 'État actuel'}</h4>
    <div className="before-after">
      <HorizontalBar label="IDC" unit="MJ/m²/an" before={building.idc} after={renovation?.idcAfter} limit={dueThresholds.idc} limitYear={thresholdYear} color={state.color} />
      <HorizontalBar label="CO₂" unit="kg/m²/an" before={building.carbonIntensity} after={renovation?.carbonAfter} limit={dueThresholds.carbon} limitYear={thresholdYear} color={state.color} />
      <div><span>Indice d’état</span><strong>{number(renovation?.conditionBefore ?? building.condition, 2)}{renovation && <><ArrowRight size={13} />{number(renovation.conditionAfter, 2)}</>}</strong></div>
    </div>
    {renovation && <><div className="detail-investment"><span>Investissement estimé<strong>{money(renovation.cost)} CHF</strong></span><span>CO₂ évité chaque année<strong>{number(renovation.carbonSaved, 1)} tCO₂e</strong></span><span>Carbone gris des travaux<strong>{number(renovation.embodiedCarbon, 1)} tCO₂e</strong></span></div>
      <p className="detail-note" data-testid="depth-note">{describeDepth(renovation, dueYear!)} Paquet : {renovation.depth === 'complete' ? 'isolation (façade, toit, cave), fenêtres' : 'isolation du toit et de la cave'} et, si le chauffage est fossile, raccordement au CAD (obligatoire s’il est dans la rue) ou PAC air/eau, photovoltaïque si possible — détail dans l’onglet « Mesures de rénovation ». Faisabilité non étudiée ; hors subventions.</p>
      {renovation.residual && <p className="residual-warning">Après travaux, un seuil reste dépassé d’ici {DASHBOARD_LAST_YEAR} ({describeBreach(renovation.residual)}). Une étude complémentaire est nécessaire.</p>}
    </>}
    <small className="fiction-note">Sources : SITG, QuantHome. Indice d’état modélisé (âge depuis construction ou derniers travaux), pas un diagnostic Stratus.{building.imputed && building.imputed.length > 0 && ` Valeurs estimées par défaut faute de donnée : ${building.imputed.map((key) => ({ idc: 'IDC', carbon: 'CO₂', year: 'année de construction' } as Record<string, string>)[key] ?? key).join(', ')}.`}{building.protection && building.protection !== 'none' && ' Bâtiment protégé : contraintes de rénovation de l’enveloppe probables.'}</small>
  </section>;
}

function ShapeIcon({ use, color = '#fff', size = 16 }: { use: string; color?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true"><path d={SHAPES[shapeFor(use)]} fill={color} stroke="#111" strokeWidth="0.16" strokeLinejoin="round" /></svg>;
}

function Legend({ counts, cohort, onCohort, useCounts, uses, onToggleUse, onClearUses, onResetFilters }: {
  counts: Record<string, number>; cohort: Cohort | null; onCohort: (value: Cohort | null) => void;
  useCounts: Record<string, number>; uses: Set<string>; onToggleUse: (use: string) => void; onClearUses: () => void;
  onResetFilters: () => void;
}) {
  const [open, setOpen] = useState(true);
  return <aside className={`legend-panel ${open ? '' : 'collapsed'}`} data-tour="legend" aria-label="Légende et filtres">
    <button className="legend-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>Légende & filtres <ChevronRight size={14} /></button>
    <button className="legend-reset" onClick={onResetFilters} title="Effacer l’échéance, les affectations et la recherche"><RotateCcw size={13} /> Réinitialiser les filtres</button>
    {open && <>
      <h4>Échéance <small>cliquer pour isoler</small></h4>
      <div className="legend-list">
        {cohortOrder.map((key) => <button key={key} data-cohort={key} aria-pressed={cohort === key} className={cohort === key ? 'active' : ''} onClick={() => onCohort(cohort === key ? null : key)}>
          <span className="swatches">{[...new Set(SHADES[key])].map((color) => <i key={color} style={{ background: color, opacity: COHORTS[key].opacity }} />)}</span>
          <span>{COHORTS[key].short}</span><strong>{counts[key]}</strong>
        </button>)}
      </div>
      <p className="legend-hint">Couleur = année du premier seuil dépassé, avec les seuils en vigueur cette année-là. Les trois teintes = 1, 2 ou 3 critères dépassés cette année-là (IDC, CO₂, vétusté).</p>
      <p className="legend-hint">Rouge, jaune et vert : pleine opacité. Au-delà de 10 ans : gris à 30 %. Gris = aucun seuil dépassé d’ici {DASHBOARD_LAST_YEAR}, sans travaux simulés ; un dépassement plus tardif (jusqu’en {TARGET_YEAR}) est indiqué sur la fiche. L’horizon des KPI ne masque aucun point. « Sous 10 ans » couvre les besoins entre 5 et 10 ans.</p>
      <h4>Affectation <small>{uses.size ? `${uses.size} sélectionnée(s)` : 'toutes'}</small>{uses.size > 0 && <button className="text-button" onClick={onClearUses}>Tout afficher</button>}</h4>
      <div className="legend-list">
        {BUILDING_USES.map((use) => <button key={use} aria-pressed={uses.has(use)} className={`use-filter ${uses.has(use) ? 'active' : ''}`} onClick={() => onToggleUse(use)}>
          <ShapeIcon use={use} color="#347bc1" /><span>{use}</span><strong>{useCounts[use] ?? 0}</strong>
        </button>)}
      </div>
      <h4>Taille <small>surface de référence énergétique</small></h4>
      <div className="size-legend">{[200, 2000, 10000, 25000].map((sre) => <span key={sre}><svg width="40" height="40" viewBox="-20 -20 40 40" aria-hidden="true"><circle r={11 * symbolScale(sre)} fill="#347bc1" stroke="#111" strokeWidth="1.3" /></svg>{number(sre)} m²</span>)}</div>
    </>}
  </aside>;
}

export default function App() {
  const [strategyId, setStrategyId] = useState<StrategyId>('conservative');
  const [customBase, setCustomBase] = useState<'conservative' | 'ambitious'>('conservative');
  const [custom, setCustom] = useState<Strategy>({ ...PRESETS.conservative, id: 'custom', name: 'Modulable', thresholds: { ...PRESETS.conservative.thresholds }, changes: [...PRESETS.conservative.changes] });
  const [horizon, setHorizon] = useState(0);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [uses, setUses] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'map' | 'chart' | 'measures'>('map');
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const strategy = strategyId === 'custom' ? custom : PRESETS[strategyId];
  const portfolio = useMemo(() => assessPortfolio(BUILDINGS, strategy), [strategy]);
  const filtered = useMemo(() => portfolio.filter((item) =>
    (uses.size === 0 || uses.has(item.building.use))
    && `${item.building.name} ${item.building.district} ${item.building.id}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')),
  ), [portfolio, uses, query]);
  const program = useMemo(() => selectProgram(filtered, horizon, cohort), [filtered, horizon, cohort]);
  const metrics = useMemo(() => programMetrics(program, strategy, DASHBOARD_LAST_YEAR, BUILDINGS), [program, strategy]);
  const programArea = program.reduce((sum, item) => sum + item.building.area, 0);
  const visible = useMemo(() => cohort ? filtered.filter((item) => item.cohort === cohort) : filtered, [filtered, cohort]);
  const selectedAssessment = visible.find((item) => item.building.id === selected);
  // Seuils tracés sur le diagramme : ceux de la dernière année de la sélection (horizon cumulé, ou fin de la catégorie isolée).
  const chartYear = BASE_YEAR + (cohort ? { now: 0, five: 5, ten: MAX_HORIZON, safe: MAX_HORIZON }[cohort] : horizon);
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
    setCustom({ ...PRESETS[base], id: 'custom', name: 'Modulable', thresholds: { ...PRESETS[base].thresholds }, changes: [...PRESETS[base].changes] });
  }
  function toggleUse(use: string) {
    setUses((current) => { const next = new Set(current); if (!next.delete(use)) next.add(use); return next; });
    setSelected(null);
  }
  function resetFilters() {
    setCohort(null);
    setUses(new Set());
    setQuery('');
    setSelected(null);
  }
  function exportReport() {
    const strategies = strategyId === 'custom' ? [PRESETS.conservative, PRESETS.ambitious, custom] : [PRESETS.conservative, PRESETS.ambitious];
    void new HtmlReport({ buildings: BUILDINGS, strategies, selectedStrategy: strategy.id, scopeLabel: 'tout le parc' }).open();
  }
  const onTourEnter = useCallback((action: 'tab-map' | 'tab-chart') => setTab(action === 'tab-map' ? 'map' : 'chart'), []);

  return <div className="app-shell" data-strategy={strategyId}>
    <header className="topbar">
      <a className="brand" href="#main" aria-label="StratoRéno — tableau de bord"><Blason /><span>Strato<span className="brand-emphasis">Réno</span><small>STRATÉGIE DE RÉNOVATION</small></span></a>
      <div className="topbar-right">
        <span className="topbar-count"><strong>{BUILDINGS.length}</strong> bâtiments de la Ville</span>
        <button className="help-button" onClick={() => setTourOpen(true)}><PlayCircle size={16} /> Visite guidée</button>
        <button className="help-button" onClick={() => setShowAssumptions(true)} aria-expanded={showAssumptions}><CircleHelp size={16} /> Méthode & hypothèses</button>
      </div>
    </header>

    {showAssumptions && <div className="drawer-backdrop" onClick={() => setShowAssumptions(false)}>
      <section className="assumptions-panel" role="dialog" aria-label="Méthode et hypothèses" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading"><h2>Méthode & hypothèses</h2><button className="icon-button" autoFocus aria-label="Fermer les hypothèses" onClick={() => setShowAssumptions(false)}><X size={18} /></button></div>
        <p className="data-note"><ShieldCheck size={15} /> <span><strong>Données réelles, projections simulées.</strong> Parc SITG / QuantHome ; IDC parfois estimé, CO₂ (scope 1 + 2) calculé pour chaque bâtiment à partir de l’IDC et de l’agent de chauffage, indice d’état modélisé. Coûts et seuils non validés réglementairement. Année de référence {BASE_YEAR}.</span></p>
        <div className="assumptions-grid">
          <div><h3>Déclenchement et priorité</h3><p>Un seul critère hors seuil suffit. Échéance = première année, de {BASE_YEAR} à {TARGET_YEAR}, où le bâtiment dépasse un seuil en vigueur cette année-là (calendrier daté, état dégradé avec l’âge). Couleurs du tableau de bord : {BASE_YEAR} rouge, {BASE_YEAR + 1}–{BASE_YEAR + 5} jaune, {BASE_YEAR + 6}–{DASHBOARD_LAST_YEAR} vert ; gris = aucun seuil dépassé d’ici {DASHBOARD_LAST_YEAR}, sans travaux simulés dans les KPI, la liste ni l’export (un premier dépassement entre {DASHBOARD_LAST_YEAR + 1} et {TARGET_YEAR} est indiqué sur la fiche ; la feuille de route du rapport HTML le planifie). Teinte = nombre de critères dépassés l’année d’échéance. Diagramme : seuils de la dernière année de la sélection (horizon ou catégorie). Tri par année, puis critères déclenchés : IDC → état → CO₂, puis gain carbone annuel décroissant du paquet recommandé.</p></div>
          <div><h3>Projection sans travaux</h3><p>État = 1 si construction ou derniers travaux ont moins de 10 ans, puis −0,01 par an (0,40 à 70 ans), puis −0,005 par an. IDC et CO₂ constants, pour tous les agents (facteurs d’émission du CAD et de l’électricité constants, sans trajectoire de décarbonation). Un changement de seuil s’applique dès son année et reste actif jusqu’au suivant ; calendrier possible jusqu’en {TARGET_YEAR}. Base légale : seuil IDC de travaux ordonnés de l’art. 14 REn (800 MJ/m²·an, 650 dès 2027, 550 dès 2031) ; aucune limite légale de CO₂ d’exploitation par bâtiment, le seuil CO₂ est l’équivalent mazout du seuil IDC. Exemplaire, objectifs jusqu’en 2050 : Plan directeur de l’énergie 2020-2030 (rénover au-delà de 450 MJ/m²·an ; sortie du fossile dès 2030, transposée en seuil CO₂ de 25 puis 13 kg/m²·an, équivalents gaz de 450 et 230 MJ/m²·an) ; dès 2050, zéro net (loi sur le climat, Stratégie climat de la Ville) : IDC 230, cible après rénovation du plan, et CO₂ 1 kg/m²·an, résidu de l’électricité du réseau ; 2040 (IDC 340, CO₂ 6) : interpolation linéaire, absente des sources. Avec des facteurs constants (CAD {number(CARRIERS['CAD']!.emission, 3)}, électricité {number(ELECTRICITY_EMISSION, 3)} kgCO₂e/kWh), l’objectif de 1 kg/m²·an n’est pas atteint par un raccordement au CAD : ces bâtiments restent à étudier. État : 0,5 dans les deux scénarios.</p></div>
          <div><h3>Profondeur de rénovation</h3><p>Le paquet dépend de la raison de la rénovation (interprétation de la demande, hypothèse modèle). Indice d’état de l’année des travaux inférieur à {number(DEEP_RENOVATION_CONDITION, 2)} : <strong>rénovation complète</strong> (façade, toit, cave, fenêtres, changement de chauffage, photovoltaïque) ; état remis à 1. Sinon, <strong>rénovation énergétique</strong> : changement de chauffage s’il est fossile, photovoltaïque, isolation du toit et de la cave, sans façade ni fenêtres (réfection d’éléments usés, justifiée par la vétusté) ; état inchangé. Escalade en rénovation complète si le paquet énergétique laisse un seuil IDC, CO₂ ou d’état en vigueur dépassé entre l’année des travaux et {DASHBOARD_LAST_YEAR} (tableau de bord) ou {TARGET_YEAR} (rapport). La même règle signale un bâtiment « encore hors seuil après travaux », avec l’année et le critère. Une seule rénovation par bâtiment est modélisée. L’onglet « Mesures de rénovation » part du paquet recommandé ; toute mesure peut être cochée ou décochée.</p></div>
          <div><h3>Surfaces et part vitrée</h3><p>Surfaces d’éléments déduites de la SRE (hypothèses modèle) : façade brute (mur + fenêtres) {number(ELEMENT_RATIO.grossFacade, 1)} m²/m² SRE, toiture {number(ELEMENT_RATIO.toit, 2)}, cave {number(ELEMENT_RATIO.cave, 2)}. Fenêtres = part vitrée de l’affectation × façade brute ; façade opaque = le reste. Parts vitrées : {Object.entries(WINDOW_SHARE).filter(([use]) => use !== 'École' && use !== 'Musée').map(([use, share]) => `${use} ${percent(share)}`).join(', ')} ; autres {percent(DEFAULT_WINDOW_SHARE)}. Logement 20 % et Administration 60 % : ordres de grandeur donnés par l’utilisateur ; les autres valeurs sont des hypothèses modèle à valider. Quantités, coûts, économies et carbone gris de la façade et des fenêtres en découlent (fenêtres 1 000 CHF/m²).</p></div>
          <div><h3>Paquet de rénovation</h3><p>Enveloppe thermique : isolation façade, toiture et cave, fenêtres. Équipements techniques : un chauffage fossile (ou inconnu) est remplacé — raccordement obligatoire au CAD s’il est disponible dans la rue, sinon PAC air/eau (COP {number(HEAT_PUMP_COP, 1)}) ; un système non fossile (CAD, PAC, bois, électrique) est conservé. Photovoltaïque en toiture pour réduire les imports d’électricité (impossible sur un bâtiment protégé). Économies d’enveloppe par ΔU × degrés-jours genevois, réalisées à {percent(REALIZED_SHARE)} et plafonnées à 70 % du chauffage. État remis à 1 après une rénovation complète, inchangé après une rénovation énergétique. IDC selon la méthode de l’OCEN (énergie finale ; électricité de PAC × 3,25 ; chaleur CAD × 1,08). Sources : docs/renovation/.</p></div>
          <div><h3>Coûts</h3><p>Investissement = quantité × coût unitaire par mesure (prix 2020), annualisé à {percent(DISCOUNT_RATE)} sur la durée de vie ; barres : enveloppe thermique en vert foncé, équipements en vert clair. Énergie : prix LICS 2020. <strong>Subventions non appliquées</strong> : la feuille de route est établie pour la Ville de Genève elle-même. Moyennes pondérées par la surface.</p></div>
          <div><h3>Carbone et électricité</h3><p>Coût social du carbone : <strong>{SOCIAL_CARBON_COST} CHF/tCO₂e</strong>, appliqué aux émissions annuelles. Facteur d’émission de l’électricité du réseau : <strong>{number(ELECTRICITY_EMISSION, 3)} kgCO₂e/kWh</strong> ; CAD : <strong>{number(CARRIERS['CAD']!.emission, 3)} kgCO₂e/kWh</strong> (valeurs fixées par l’équipe projet). CO₂ = scope 1 + 2, calculé pour chaque bâtiment à partir de l’IDC, du système de chauffage et du facteur d’émission de son agent : combustion directe pour le gaz et le mazout, facteur du réseau pour l’électricité et le CAD (chauffage inconnu : traité comme du gaz). Le champ scope 1 de QuantHome n’est plus utilisé : ses facteurs étaient incohérents (p. ex. 120 bâtiments au gaz avec le facteur du mazout).</p></div>
          <div><h3>Carbone gris des travaux</h3><p>Fabrication et élimination des matériaux et équipements (KBOB 2022) : isolant EPS dimensionné par ΔU, fenêtres à cadre bois-métal et triple vitrage, PAC, raccordement CAD (proxy) et photovoltaïque. Amorti sur la durée de vie de chaque mesure et comparé à la valeur limite de {EMBODIED.legalLimitPerM2Year} kgCO₂e/m²·an des rénovations importantes dès 2034 (RECMC). Indiqué à part : non déduit du CO₂ évité ni du coût social du carbone.</p></div>
          <div><h3>Photovoltaïque</h3><p>{number(PV.costPerKwc)} CHF/kWc, productible {number(PV.yield)} kWh/kWc·an, {PV.lifetime} ans, entretien {number(PV.maintenance * 100)} ct/kWh (SWISSOLAR2024). Puissance limitée par la toiture ({number(PV.kwcPerM2, 1)} kWc/m² × part de toiture ensoleillée OCEN) et par la consommation électrique de chauffage. Non installable sur les bâtiments protégés (classés ou à l’inventaire).</p></div>
          <div><h3>Loyers</h3><p>Manque à gagner : {RENT.lossYears} an de loyers résidentiels non perçus pendant les travaux, réparti sur {RENT.spreadYears} ans. Hausse de loyer liée au confort : +{percent(RENT.comfortUplift)} des loyers (hypothèse modèle, non sourcée). Composantes du graphique des coûts annuels : le manque à gagner est tracé sous l’axe, la hausse de loyer au-dessus.</p></div>
          <div><h3>Lecture de la carte</h3><p>Taille du symbole ∝ √SRE, forme = affectation, couleur = échéance (rouge : immédiat, jaune : sous 5 ans, vert : sous 10 ans, gris à 30 % : surveillance au-delà de 10 ans), teinte plus foncée = plus de critères dépassés l’année d’échéance. Gris : aucun seuil dépassé d’ici {DASHBOARD_LAST_YEAR} ; l’infobulle et la fiche donnent l’année d’un éventuel premier dépassement jusqu’en {TARGET_YEAR}, sans date de rénovation au tableau de bord.</p></div>
        </div>
        <p className="assumption-footer">L’investissement et le CO₂ évitable portent sur les travaux sélectionnés ; les moyennes d’IDC et d’état sont pondérées par SRE sur tout le parc, y compris les bâtiments sans travaux. Avant : parc au 1er janvier {BASE_YEAR}. Après : mêmes bâtiments, en appliquant seulement les travaux sélectionnés. Les gains sont le potentiel annuel des travaux achevés, pas un cumul des émissions évitées. La faisabilité technique, le patrimoine protégé et les contraintes de réseau ne sont pas modélisés. La maquette ne démontre pas la sortie complète des fossiles.</p>
      </section>
    </div>}

    <main id="main">
      <div className="workspace">
        <aside className="strategy-panel">
          <div data-tour="strategies">
            <div className="section-label"><SlidersHorizontal size={16} /> SCÉNARIO</div>
            <div className="strategy-options">
              {([
                { id: 'conservative', title: PRESETS.conservative.name, subtitle: 'Droit en vigueur (REn)', icon: ShieldCheck, index: '01' },
                { id: 'ambitious', title: PRESETS.ambitious.name, subtitle: 'Plan directeur de l’énergie', icon: Sparkles, index: '02' },
                { id: 'custom', title: 'Modulable', subtitle: 'Seuils et trajectoire libres', icon: SlidersHorizontal, index: '03' },
              ] as const).map(({ id, title, subtitle, icon: Icon, index }) => <button key={id} data-strategy={id} className={`strategy-option ${strategyId === id ? 'active' : ''}`} aria-pressed={strategyId === id} onClick={() => setStrategyId(id)}>
                <span className="strategy-option-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><span className="strategy-option-number">{strategyId === id ? <Check size={17} /> : index}</span>
              </button>)}
            </div>
          </div>
          <button className="strategy-export-button" disabled={BUILDINGS.length === 0} onClick={exportReport} title="Ouvrir le rapport HTML de la stratégie pour tout le parc"><Download size={18} /> Exporter la stratégie</button>
          {strategyId === 'custom' && <div className="custom-base"><label htmlFor="custom-base">Partir du scénario</label><select id="custom-base" value={customBase} onChange={(event) => resetCustom(event.target.value === 'ambitious' ? 'ambitious' : 'conservative')}><option value="conservative">{PRESETS.conservative.name}</option><option value="ambitious">{PRESETS.ambitious.name}</option></select><small>Changer la base réinitialise les curseurs et les seuils futurs.</small></div>}
          <div data-tour="thresholds">
            <div className="threshold-heading"><h3>Seuils au 1er janvier {BASE_YEAR}</h3>{strategyId === 'custom' ? <button className="icon-button" aria-label="Réinitialiser la stratégie personnalisée" onClick={() => resetCustom()}><RotateCcw size={14} /></button> : <span className="fixed-tag">PRÉDÉFINIS</span>}</div>
            <ThresholdControls value={strategy.thresholds} editable={strategyId === 'custom'} onChange={(thresholds) => setCustom({ ...custom, thresholds })} />
            {strategyId !== 'custom' && <button className="text-button customize-link" onClick={() => { resetCustom(strategyId); setStrategyId('custom'); }}>Personnaliser cette stratégie <ArrowRight size={14} /></button>}
          </div>
          {strategyId === 'custom' ? <FutureThresholds key={customBase} strategy={custom} onChange={setCustom} /> : <div className="calendar-note"><CalendarDays size={17} /><p><strong>Calendrier des seuils</strong>{strategy.changes.length === 0 ? 'Seuils constants.' : strategy.changes.map((change) => <span key={change.year}>Dès {change.year} : IDC &gt; {change.thresholds.idc} · état &lt; {number(change.thresholds.condition, 2)} · CO₂ &gt; {change.thresholds.carbon}<br /></span>)}{strategyId === 'conservative' ? 'Art. 14 REn (travaux ordonnés), rien de programmé après 2031 ; pas de limite légale de CO₂ : équivalent mazout du seuil IDC.' : `Plan directeur de l’énergie 2020-2030, fiches 2.1 et 2.2 (CO₂ : équivalent gaz de 450 puis 230 MJ/m²·an) ; ${TARGET_YEAR} : zéro net (LCl, Stratégie climat de la Ville), IDC 230 et résidu de 1 kg CO₂, non atteint par un raccordement au CAD à facteur constant ; 2040 interpolé. Couleurs et programme du tableau de bord : ${BASE_YEAR}–${DASHBOARD_LAST_YEAR} (premier dépassement plus tardif indiqué sur la fiche des bâtiments gris) ; feuille de route du rapport jusqu’en ${TARGET_YEAR}.`}</p></div>}
          <div className="priority-note"><span className="live-dot" /><p>Un critère suffit à déclencher. <strong>Priorité IDC → état → CO₂</strong></p></div>
        </aside>

        <div className="stage">
          <section className="kpi-strip" data-tour="kpis" aria-live="polite" aria-atomic="true" data-testid="kpis">
            <div className="program-summary">
              <div className="kpi-title">
                <div className="section-label">IMPACT DU PROGRAMME DE RÉNOVATION</div>
                <h2>{selectionLabel}</h2>
                <div className="program-totals">
                  <div className="program-total"><Building2 size={21} /><strong data-testid="program-count">{number(program.length)}</strong><span>{cohort === 'safe' ? 'bâtiments à surveiller' : 'bâtiments à rénover'}</span></div>
                  <div className="program-total"><strong data-testid="program-area">{number(programArea)}</strong><span><b>m²</b> {cohort === 'safe' ? 'sous surveillance' : 'concernés'}</span></div>
                </div>
              </div>
              <div className="horizon-control" aria-label="Horizon du programme cumulé">{[0, 5, 10].map((value) => <button key={value} className={cohort === null && horizon === value ? 'active' : ''} aria-pressed={cohort === null && horizon === value} onClick={() => { setHorizon(value); setCohort(null); }}>{value === 0 ? `Dès ${BASE_YEAR}` : `D’ici ${BASE_YEAR + value}`}</button>)}</div>
            </div>
            <article className="kpi-card"><div className="kpi-label"><span>Investissement requis</span><Wallet size={14} /></div><div className="kpi-value">{money(metrics.cost)}<small>CHF</small></div></article>
            <article className="kpi-card"><div className="kpi-label"><span>CO₂ évitable / an</span><Leaf size={14} /></div><div className="kpi-value">{number(metrics.carbonSaved)}<small>tCO₂e · {percent(metrics.carbonReduction)}</small></div></article>
            <article className="kpi-card" title="Moyenne pondérée par la SRE sur tout le parc ; seuls les travaux sélectionnés modifient la valeur après."><div className="kpi-label"><span>IDC moyen · tout le parc</span><Flame size={14} /></div><div className="kpi-value transition-value" data-testid="portfolio-idc">{metrics.portfolioCount ? number(metrics.idcBefore) : '—'}<ArrowRight size={15} /><span>{metrics.portfolioCount ? number(metrics.idcAfter) : '—'}</span></div></article>
            <article className="kpi-card" title="Moyenne pondérée par la SRE sur tout le parc ; seuls les travaux sélectionnés modifient la valeur après."><div className="kpi-label"><span>État moyen · tout le parc</span><TrendingUp size={14} /></div><div className="kpi-value transition-value" data-testid="portfolio-condition">{metrics.portfolioCount ? number(metrics.conditionBefore, 2) : '—'}<ArrowRight size={15} /><span>{metrics.portfolioCount ? number(metrics.conditionAfter, 2) : '—'}</span></div></article>
          </section>

          <section className="view-panel" data-tour="map">
            <div className="view-header">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'map'} className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><MapIcon size={15} /> Carte</button>
                <button role="tab" aria-selected={tab === 'chart'} className={tab === 'chart' ? 'active' : ''} data-tour="chart-tab" onClick={() => setTab('chart')}><ChartScatter size={15} /> Diagramme IDC × CO₂</button>
                <button role="tab" aria-selected={tab === 'measures'} className={tab === 'measures' ? 'active' : ''} data-tour="measures-tab" onClick={() => setTab('measures')}><Wrench size={15} /> Mesures de rénovation</button>
              </div>
              <label className="search-box"><Search size={15} /><input type="search" aria-label="Rechercher un bâtiment ou quartier" placeholder="Adresse, quartier, EGID…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} /></label>
              <span className="map-count"><MapPin size={13} /> {visible.length} / {BUILDINGS.length}</span>
            </div>
            <div className="view-body">
              <div className={`view-pane ${tab === 'map' ? '' : 'hidden'}`}><BuildingMap assessments={visible} selected={selectedAssessment?.building.id ?? null} active={tab === 'map'} onSelect={setSelected} /></div>
              {tab === 'chart' && <div className="view-pane"><ScatterPlot assessments={visible} selected={selectedAssessment?.building.id ?? null} strategy={strategy} year={chartYear} onSelect={setSelected} /></div>}
              {tab === 'measures' && <div className="view-pane measures-pane">{selectedAssessment
                ? <RenovationTab key={`${selectedAssessment.building.id}|${strategy.id}`} assessment={selectedAssessment} strategy={strategy} onShowOnMap={() => setTab('map')} />
                : <div className="empty-state"><Wrench size={27} /><h3>Aucun bâtiment sélectionné</h3><p>Choisissez un bâtiment sur la carte, dans le diagramme ou dans la feuille de route (pictogramme <Wrench size={12} />) pour étudier ses mesures de rénovation.</p></div>}</div>}
              {tab !== 'measures' && <Legend counts={counts} cohort={cohort} onCohort={(value) => { setCohort(value); setSelected(null); }} useCounts={useCounts} uses={uses} onToggleUse={toggleUse} onClearUses={() => setUses(new Set())} onResetFilters={resetFilters} />}
              {tab !== 'measures' && selectedAssessment && <div className="detail-float"><BuildingDetail assessment={selectedAssessment} strategy={strategy} onClose={() => setSelected(null)} /></div>}
            </div>
          </section>

          <section className="building-list" data-tour="roadmap">
            <div className="list-heading"><div><h2>{cohort === 'safe' ? 'Bâtiments à surveiller' : 'Votre feuille de route'}</h2><p>{program.length} bâtiments · {cohort === 'safe' ? 'pas de rénovation simulée' : 'échéance, critères puis impact carbone'}</p></div></div>
            <div className="table-scroll"><table><thead><tr><th>Bâtiment / quartier</th><th>Échéance</th><th>IDC<small>MJ/m²/an</small></th><th>État</th><th>CO₂<small>kg/m²/an</small></th><th>Motif principal</th><th aria-label="Actions" /></tr></thead><tbody>
              {program.map((item) => <tr key={item.building.id} className={selected === item.building.id ? 'selected-row' : ''}>
                <td><button className="building-name" onClick={() => { setSelected(item.building.id); if (tab === 'map') window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{item.building.name}<small>{item.building.district} · {item.building.use}</small></button></td>
                <td><span className={`table-status ${item.cohort}`} title={describeDue(item) ?? `aucun seuil dépassé d’ici ${TARGET_YEAR}`}><span />{inDashboardProgram(item) ? item.dueYear : item.dueYear !== null ? `Suivi · ${item.dueYear}` : 'Suivi'}</span></td>
                <td>{item.building.idc}</td><td>{number(item.building.condition, 2)}</td><td>{number(item.building.carbonIntensity, 1)}</td>
                <td><span className="reason-tag">{item.triggers[0] ? `${CRITERIA[item.triggers[0]]}${inDashboardProgram(item) ? '' : ` en ${item.dueYear}`}` : 'Aucun seuil franchi'}</span></td>
                <td className="row-actions">
                  <button className="icon-button" aria-label={`Voir ${item.building.name} sur la carte`} title="Voir sur la carte" onClick={() => { setSelected(item.building.id); setTab('map'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><MapPin size={16} /></button>
                  <button className="icon-button" aria-label={`Mesures de rénovation de ${item.building.name}`} title="Mesures de rénovation" onClick={() => { setSelected(item.building.id); setTab('measures'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Wrench size={16} /></button>
                </td>
              </tr>)}
            </tbody></table></div>
            {program.length === 0 && <div className="empty-state"><Building2 size={27} /><h3>Aucun bâtiment dans cette sélection</h3><p>Changez d’horizon, de catégorie ou de filtre pour explorer le parc.</p></div>}
          </section>
        </div>
      </div>
    </main>
    <footer className="site-footer"><span>StratoRéno <span>·</span> Défi 5 — Sortir des énergies fossiles</span><span>Données SITG / QuantHome · fond de carte swisstopo</span></footer>
    <Tour open={tourOpen} onClose={() => setTourOpen(false)} onEnter={onTourEnter} />
  </div>;
}
