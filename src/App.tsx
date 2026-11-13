import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowDownRight, ArrowRight, Building2, CalendarDays, Check, ChevronRight,
  CircleHelp, Download, Flame, Leaf, MapPin, Plus, RotateCcw, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react';
import BuildingMap from './BuildingMap';
import { BUILDINGS, BUILDING_USES } from './data';
import {
  BASE_YEAR, COHORTS, CRITERIA, PRESETS, RENOVATION, assessPortfolio,
  programMetrics, renovationFor, selectProgram,
} from './model';
import type { Assessment, BuildingUse, Cohort, Strategy, StrategyId, Thresholds } from './model';

const number = (value: number, digits = 0) => new Intl.NumberFormat('fr-CH', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value);
const percent = (value: number) => `${number(value * 100, 0)} %`;
const money = (value: number) => value >= 1_000_000
  ? `${number(value / 1_000_000, 1)} M`
  : number(value);
const cohortOrder: Cohort[] = ['now', 'five', 'ten', 'safe'];

function ThresholdControls({ value, editable, onChange }: {
  value: Thresholds; editable: boolean; onChange: (value: Thresholds) => void;
}) {
  const fields = [
    { key: 'idc', title: 'Dépense de chaleur', unit: 'MJ/m²/an', min: 200, max: 1000, step: 10, sign: '>', description: 'IDC · priorité 1', icon: Flame },
    { key: 'condition', title: 'État du bâtiment', unit: '/ 1', min: 0, max: 1, step: 0.05, sign: '<', description: 'Indice Stratus · priorité 2', icon: Building2 },
    { key: 'carbon', title: 'Intensité carbone', unit: 'kgCO₂e/m²/an', min: 1, max: 80, step: 1, sign: '>', description: 'Émissions d’exploitation · priorité 3', icon: Leaf },
  ] as const;
  return <div className="threshold-controls">
    {fields.map(({ key, title, unit, min, max, step, sign, description, icon: Icon }) => <div className="threshold" key={key}>
      <div className="threshold-title"><Icon size={17} /><label htmlFor={`threshold-${key}`}>{title}</label></div>
      <div className="threshold-value"><strong>{sign} {number(value[key], key === 'condition' ? 2 : 0)}</strong><span>{unit}</span></div>
      <input id={`threshold-${key}`} type="range" min={min} max={max} step={step} disabled={!editable}
        value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
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

function BuildingDetail({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  const { building, dueYear, dueThresholds, dueCondition } = assessment;
  const renovation = dueYear === null ? null : renovationFor(building, dueYear);
  const state = COHORTS[assessment.cohort];
  return <section className="detail-card" aria-label={`Fiche de ${building.name}`}>
    <div className="detail-heading"><div className="detail-icon"><Building2 size={23} /></div><div><small>{building.id} · {building.use}</small><h3>{building.name}</h3><p><MapPin size={13} /> {building.district} · Localisation fictive</p></div><button className="icon-button close-detail" aria-label="Fermer la fiche bâtiment" onClick={onClose}><X size={18} /></button></div>
    <span className={`status-badge ${assessment.cohort}`}>{state.label}{dueYear !== null && ` · ${dueYear}`}</span>
    <div className="detail-properties"><span>Surface énergétique<strong>{number(building.area)} m²</strong></span><span>Construction fictive<strong>{building.constructionYear}</strong></span><span>Chauffage actuel<strong>{building.heating}</strong></span><span>Dégradation simulée<strong>−{number(building.annualDecay, 3)} / an</strong></span></div>
    <h4>Pourquoi cette priorité ?</h4>
    {assessment.triggers.length > 0 ? <ul className="reason-list">
      {assessment.triggers.includes('idc') && <li><Flame size={15} /><span>IDC : <strong>{building.idc} &gt; {dueThresholds.idc}</strong> MJ/m²/an</span></li>}
      {assessment.triggers.includes('condition') && <li><Building2 size={15} /><span>État en {dueYear} : <strong>{number(dueCondition, 3)} &lt; {number(dueThresholds.condition, 2)}</strong></span></li>}
      {assessment.triggers.includes('carbon') && <li><Leaf size={15} /><span>CO₂ : <strong>{number(building.carbonIntensity, 1)} &gt; {dueThresholds.carbon}</strong> kg/m²/an</span></li>}
    </ul> : <p className="muted-text">Aucun seuil franchi jusqu’en {BASE_YEAR + 10}. Surveillance recommandée, sans travaux simulés.</p>}
    <h4>{renovation ? 'Rénovation simulée à l’échéance' : 'État actuel'}</h4>
    <div className="before-after">
      <div><span>IDC <small>MJ/m²/an</small></span><strong>{building.idc}{renovation && <><ArrowRight size={13} />{number(renovation.idcAfter)}</>}</strong></div>
      <div><span>CO₂ <small>kg/m²/an</small></span><strong>{number(building.carbonIntensity, 1)}{renovation && <><ArrowRight size={13} />{number(renovation.carbonAfter, 1)}</>}</strong></div>
      <div><span>Indice d’état</span><strong>{number(renovation?.conditionBefore ?? building.condition, 2)}{renovation && <><ArrowRight size={13} />{number(renovation.conditionAfter, 2)}</>}</strong></div>
    </div>
    {renovation && <><div className="detail-investment"><span>Enveloppe estimée<strong>{money(renovation.cost)} CHF</strong></span><span>CO₂ évitable chaque année<strong>{number(renovation.carbonSaved, 1)} tCO₂e</strong></span></div>
      <p className="detail-note">Enveloppe rénovée + chauffage décarboné générique. Faisabilité PAC/CAD non étudiée ; gains d’exploitation hors carbone des travaux.</p>
      {(renovation.idcAfter > dueThresholds.idc || renovation.carbonAfter > dueThresholds.carbon || renovation.conditionAfter < dueThresholds.condition)
        && <p className="residual-warning">L’intervention générique ne satisfait pas tous les seuils de cette stratégie. Une étude complémentaire est nécessaire.</p>}
    </>}
    <small className="fiction-note">Données entièrement fictives · aucun diagnostic réel.</small>
  </section>;
}

function exportProgram(program: Assessment[], strategy: Strategy) {
  const rows = [
    ['Données fictives', `Stratégie : ${strategy.name}`, `Année de référence : ${BASE_YEAR}`],
    ['ID', 'Nom fictif', 'Quartier', 'Usage', 'Échéance', 'Motifs', 'Surface m²', 'IDC MJ/m²/an', 'CO2 kg/m²/an', 'État actuel', 'État à échéance', 'Enveloppe CHF', 'Gain tCO2e/an'],
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
  anchor.download = `energiack-${strategy.id}-donnees-fictives.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [strategyId, setStrategyId] = useState<StrategyId>('conservative');
  const [customBase, setCustomBase] = useState<'conservative' | 'ambitious'>('conservative');
  const [custom, setCustom] = useState<Strategy>({ ...PRESETS.conservative, id: 'custom', name: 'Personnalisée', thresholds: { ...PRESETS.conservative.thresholds }, changes: [] });
  const [horizon, setHorizon] = useState(0);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [use, setUse] = useState<BuildingUse | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const strategy = strategyId === 'custom' ? custom : PRESETS[strategyId];
  const portfolio = useMemo(() => assessPortfolio(BUILDINGS, strategy), [strategy]);
  const filtered = useMemo(() => portfolio.filter((item) =>
    (use === 'all' || item.building.use === use)
    && `${item.building.name} ${item.building.district} ${item.building.id}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')),
  ), [portfolio, use, query]);
  const program = selectProgram(filtered, horizon, cohort);
  const metrics = programMetrics(program);
  const programIds = new Set(program.map((item) => item.building.id));
  const selectedAssessment = filtered.find((item) => item.building.id === selected);
  const selectionLabel = cohort ? COHORTS[cohort].label
    : horizon === 0 ? 'Programme immédiat' : `Programme cumulé d’ici ${BASE_YEAR + horizon}`;
  const counts = Object.fromEntries(cohortOrder.map((key) => [key, filtered.filter((item) => item.cohort === key).length]));

  function resetCustom(base = customBase) {
    setCustomBase(base);
    setCustom({ ...PRESETS[base], id: 'custom', name: 'Personnalisée', thresholds: { ...PRESETS[base].thresholds }, changes: [] });
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#main"><span className="brand-symbol"><Leaf size={23} /></span><span>énergi<span className="brand-emphasis">ACK</span><small>LA TRANSITION, BÂTIMENT PAR BÂTIMENT</small></span></a>
      <div className="topbar-divider" />
      <div className="territory"><MapPin size={17} /><span>Ville de Genève<small>Pilotage du patrimoine municipal</small></span></div>
      <div className="topbar-right"><span className="demo-tag"><span /> DÉMONSTRATEUR</span><button className="help-button" onClick={() => setShowAssumptions(!showAssumptions)} aria-expanded={showAssumptions}><CircleHelp size={17} /> Méthode & hypothèses</button></div>
    </header>

    <main id="main">
      <section className="page-heading">
        <div><div className="eyebrow"><span /> STRATÉGIE TERRITORIALE · {BASE_YEAR}—{BASE_YEAR + 10}</div><h1>Une trajectoire claire.<br /><span>Un patrimoine qui se transforme.</span></h1><p>Priorisez les rénovations et mesurez leur potentiel pour sortir des énergies fossiles.</p></div>
        <div className="portfolio-summary"><div className="portfolio-summary-icon"><Building2 size={24} /></div><div><strong>{BUILDINGS.length}</strong><span>bâtiments fictifs<br />du parc municipal</span></div></div>
      </section>

      <div className="simulation-notice"><ShieldCheck size={16} /><span><strong>Mode simulation.</strong> Données, coûts et projections fictifs. Seuils non validés réglementairement ; aucune clé API utilisée.</span><span className="notice-year">RÉFÉRENCE {BASE_YEAR}</span></div>

      {showAssumptions && <section className="assumptions-panel" aria-label="Méthode et hypothèses">
        <div className="panel-heading"><h2>Une méthode lisible, pas une boîte noire</h2><button className="icon-button" aria-label="Fermer les hypothèses" onClick={() => setShowAssumptions(false)}><X size={18} /></button></div>
        <div className="assumptions-grid">
          <div><h3>Déclenchement et priorité</h3><p>Un seul critère hors seuil suffit. Premier franchissement calculé chaque année de {BASE_YEAR} à {BASE_YEAR + 10}. Tri par année, puis critères déclenchés : IDC → état → CO₂, puis gain carbone annuel décroissant.</p></div>
          <div><h3>Projection sans travaux</h3><p>État(t) = max(0, état initial − dégradation annuelle × années). IDC et CO₂ constants. Un changement de seuil s’applique dès son année et reste actif jusqu’au suivant. Aucun calendrier légal chargé.</p></div>
          <div><h3>Intervention générique</h3><p>Chaleur −{percent(RENOVATION.heatReduction)} ; état relevé à au moins {number(RENOVATION.targetCondition, 2)}. Carbone après = minimum du carbone actuel et IDC après ÷ 3,6 × {number(RENOVATION.lowCarbonFactor, 3)} kgCO₂e/kWh.</p></div>
          <div><h3>Coûts et agrégation</h3><p>Coût = surface × [{RENOVATION.fixedCostPerM2} + {RENOVATION.conditionCostPerM2} × (1 − état à l’échéance)] CHF/m². Moyennes pondérées par la surface, même périmètre avant/après, interventions réalisées à l’échéance. Hors inflation, subventions, frais d’exploitation et carbone des travaux.</p></div>
        </div>
        <p className="assumption-footer">Les KPI sont le potentiel annuel des travaux achevés, pas un cumul des émissions évitées. La faisabilité technique, le patrimoine protégé et les contraintes de réseau ne sont pas modélisés. La maquette ne démontre pas la sortie complète des fossiles.</p>
      </section>}

      <div className="workspace">
        <aside className="strategy-panel">
          <div className="section-label"><SlidersHorizontal size={16} /> VOTRE STRATÉGIE</div>
          <h2>Choisir le cap</h2><p className="panel-description">Trois approches pour éclairer vos arbitrages.</p>
          <div className="strategy-options">
            {([
              { id: 'conservative', title: 'Conservatoire', subtitle: 'Cadre législatif à valider', icon: ShieldCheck, index: '01' },
              { id: 'ambitious', title: 'Accélération carbone', subtitle: 'Une ambition visionnaire', icon: Sparkles, index: '02' },
              { id: 'custom', title: 'À votre mesure', subtitle: 'Seuils et trajectoire libres', icon: SlidersHorizontal, index: '03' },
            ] as const).map(({ id, title, subtitle, icon: Icon, index }) => <button key={id} className={`strategy-option ${strategyId === id ? 'active' : ''}`} aria-pressed={strategyId === id} onClick={() => setStrategyId(id)}>
              <span className="strategy-option-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><span className="strategy-option-number">{strategyId === id ? <Check size={17} /> : index}</span>
            </button>)}
          </div>
          {strategyId === 'custom' && <div className="custom-base"><label htmlFor="custom-base">Partir de la stratégie</label><select id="custom-base" value={customBase} onChange={(event) => resetCustom(event.target.value === 'ambitious' ? 'ambitious' : 'conservative')}><option value="conservative">Conservatoire</option><option value="ambitious">Accélération carbone</option></select><small>Changer la base réinitialise les curseurs et les seuils futurs.</small></div>}
          <div className="threshold-heading"><h3>Seuils en {BASE_YEAR}</h3>{strategyId === 'custom' ? <button className="icon-button" aria-label="Réinitialiser la stratégie personnalisée" onClick={() => resetCustom()}><RotateCcw size={14} /></button> : <span className="fixed-tag">PRÉDÉFINIS</span>}</div>
          <ThresholdControls value={strategy.thresholds} editable={strategyId === 'custom'} onChange={(thresholds) => setCustom({ ...custom, thresholds })} />
          {strategyId !== 'custom' && <button className="text-button customize-link" onClick={() => { resetCustom(strategyId); setStrategyId('custom'); }}>Personnaliser cette stratégie <ArrowRight size={14} /></button>}
          {strategyId === 'custom' ? <FutureThresholds key={customBase} strategy={custom} onChange={setCustom} /> : <div className="calendar-note"><CalendarDays size={17} /><p><strong>Seuils constants par défaut</strong>Aucun calendrier réglementaire chargé. Simulez une évolution dans « À votre mesure ».</p></div>}
          <div className="priority-note"><span className="live-dot" /><p>Un critère suffit à déclencher.<br /><strong>Priorité IDC → état → CO₂</strong></p></div>
        </aside>

        <div className="dashboard">
          <section className="program-toolbar">
            <div><div className="section-label">IMPACT DU PROGRAMME</div><h2>{selectionLabel}</h2><p>{metrics.count} bâtiment{metrics.count > 1 ? 's' : ''} à rénover · {number(metrics.area)} m² concernés{cohort === 'safe' && ` · ${program.length} bâtiment(s) en surveillance`}</p></div>
            <div className="horizon-control" aria-label="Horizon du programme cumulé">{[0, 5, 10].map((value) => <button key={value} className={cohort === null && horizon === value ? 'active' : ''} aria-pressed={cohort === null && horizon === value} onClick={() => { setHorizon(value); setCohort(null); }}>{value === 0 ? 'Aujourd’hui' : `D’ici ${BASE_YEAR + value}`}</button>)}</div>
          </section>
          <div className="kpi-grid" aria-live="polite" aria-atomic="true" data-testid="kpis">
            <article className="kpi-card"><div className="kpi-label"><span>Enveloppe stratégique</span><Wallet size={17} /></div><div className="kpi-value">{money(metrics.cost)}<small>CHF</small></div><div className="kpi-footnote">Investissement estimé · non voté</div></article>
            <article className="kpi-card"><div className="kpi-label"><span>CO₂ évitable / an</span><Leaf size={17} /></div><div className="kpi-value">{number(metrics.carbonSaved)}<small>tCO₂e</small></div><div className="kpi-footnote positive"><ArrowDownRight size={14} /> {percent(metrics.carbonReduction)} des émissions sélectionnées</div></article>
            <article className="kpi-card"><div className="kpi-label"><span>IDC moyen</span><Flame size={17} /></div><div className="kpi-value transition-value">{metrics.count ? number(metrics.idcBefore) : '—'}<ArrowRight size={17} /><span>{metrics.count ? number(metrics.idcAfter) : '—'}</span></div><div className="kpi-footnote">MJ/m²/an · pondéré par surface</div></article>
            <article className="kpi-card"><div className="kpi-label"><span>État moyen du parc</span><TrendingUp size={17} /></div><div className="kpi-value transition-value">{metrics.count ? number(metrics.conditionBefore, 2) : '—'}<ArrowRight size={17} /><span>{metrics.count ? number(metrics.conditionAfter, 2) : '—'}</span></div><div className="kpi-footnote">Indice 0 = ruine · 1 = neuf</div></article>
          </div>

          <section className="map-panel">
            <div className="map-panel-header"><div><h2>Le territoire, bâtiment par bâtiment</h2><p>Les couleurs indiquent l’échéance sans travaux. Les points atténués sont hors sélection.</p></div><span className="map-count"><MapPin size={13} /> {filtered.length} points</span></div>
            <div className="map-filters"><label className="search-box"><Search size={16} /><input type="search" aria-label="Rechercher un bâtiment ou quartier" placeholder="Bâtiment, quartier, identifiant…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} /></label><select aria-label="Filtrer par usage" value={use} onChange={(event) => { const next = BUILDING_USES.find((item) => item === event.target.value); setUse(next ?? 'all'); setSelected(null); }}><option value="all">Tous les usages</option>{BUILDING_USES.map((item) => <option key={item} value={item}>{item}</option>)}</select>{(query || use !== 'all') && <button className="icon-button" aria-label="Effacer les filtres" onClick={() => { setUse('all'); setQuery(''); }}><X size={16} /></button>}</div>
            <BuildingMap assessments={filtered} programIds={programIds} selected={selectedAssessment?.building.id ?? null} onSelect={setSelected} />
            <div className="map-legend" aria-label="Sélectionner une catégorie de priorité">
              {cohortOrder.map((key) => <button key={key} aria-pressed={cohort === key} className={cohort === key ? 'active' : ''} onClick={() => setCohort(cohort === key ? null : key)}><span className={`legend-dot ${key}`} /><span>{COHORTS[key].short}</span><strong>{counts[key]}</strong></button>)}
            </div>
          </section>

          <div className={`lower-grid ${selectedAssessment ? 'with-detail' : ''}`}>
            <section className="building-list">
              <div className="list-heading"><div><h2>{cohort === 'safe' ? 'Bâtiments à surveiller' : 'Votre feuille de route'}</h2><p>{program.length} bâtiments · {cohort === 'safe' ? 'pas de rénovation simulée' : 'échéance, critères puis impact carbone'}</p></div><button className="export-button" disabled={program.length === 0} onClick={() => exportProgram(program, strategy)}><Download size={15} /> Export CSV</button></div>
              <div className="table-scroll"><table><thead><tr><th>Bâtiment / quartier</th><th>Échéance</th><th>IDC<small>MJ/m²/an</small></th><th>État</th><th>CO₂<small>kg/m²/an</small></th><th>Motif principal</th><th aria-label="Ouvrir la fiche" /></tr></thead><tbody>
                {program.map((item) => <tr key={item.building.id} className={selected === item.building.id ? 'selected-row' : ''}>
                  <td><button className="building-name" onClick={() => setSelected(item.building.id)}>{item.building.name}<small>{item.building.district} · {item.building.use}</small></button></td>
                  <td><span className={`table-status ${item.cohort}`}><span />{item.dueYear ?? 'Suivi'}</span></td>
                  <td>{item.building.idc}</td><td>{number(item.building.condition, 2)}</td><td>{number(item.building.carbonIntensity, 1)}</td>
                  <td><span className="reason-tag">{item.triggers[0] ? CRITERIA[item.triggers[0]] : 'Aucun seuil franchi'}</span></td>
                  <td><button className="icon-button" aria-label={`Ouvrir ${item.building.name}`} onClick={() => setSelected(item.building.id)}><ChevronRight size={16} /></button></td>
                </tr>)}
              </tbody></table></div>
              {program.length === 0 && <div className="empty-state"><Building2 size={27} /><h3>Aucun bâtiment dans cette sélection</h3><p>Changez d’horizon, de catégorie ou de filtre pour explorer le parc.</p></div>}
            </section>
            {selectedAssessment && <BuildingDetail assessment={selectedAssessment} onClose={() => setSelected(null)} />}
          </div>
          <div className="dashboard-footer"><span><ShieldCheck size={14} /> Calculs déterministes et explicables</span><span>Chaque rénovation comptée une seule fois · hypothèses disponibles en haut de page</span></div>
        </div>
      </div>
    </main>
    <footer className="site-footer"><span>énergiACK <span>·</span> Défi 5 — Sortir des énergies fossiles</span><span>Genève, un cap commun.</span></footer>
  </div>;
}
