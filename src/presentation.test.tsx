import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import App, { ThresholdControls } from './App';
import Blason from './Blason';
import RenovationTab from './RenovationTab';
import ScatterPlot from './ScatterPlot';
import { BUILDINGS } from './data';
import { BASE_YEAR, COHORTS, DASHBOARD_LAST_YEAR, PRESETS, assessBuilding, assessPortfolio, programMetrics, renovationFor, selectProgram } from './model';
import type { Building } from './model';
import { ICON_COLORS, SHADES, criteriaOf, markerColor } from './symbols';

vi.mock('./BuildingMap', () => ({
  default: ({ assessments }: { assessments: { building: { id: string }; cohort: string }[] }) =>
    <div data-testid="map-points">{assessments.map((item) =>
      <span key={item.building.id} data-building-id={item.building.id} data-cohort={item.cohort} />)}</div>,
}));

describe('Présentation des scénarios', () => {
  it('utilise les trois noms demandés dans le tableau de bord', () => {
    const html = renderToStaticMarkup(<App />);
    expect(PRESETS.conservative.name).toBe('Base légale');
    expect(PRESETS.ambitious.name).toBe('Exemplaire');
    expect(html).toContain('Base légale');
    expect(html).toContain('Exemplaire');
    expect(html).toContain('Modulable');
    expect(html).toContain('DeCathlon Genève');
    expect(html).toContain('decathlon-geneve-logo.png');
    expect(html).toContain('10 ans pour renforcer');
    expect(html).not.toContain('énergi<span class="brand-emphasis">ACK');
    expect(html).not.toContain('Accélération décarbonation');
    expect(html).not.toContain('Conservatoire');
    expect(html).not.toContain('À votre mesure');
  });

  it('affiche les six repères avec leurs valeurs et leur position sur chaque plage', () => {
    const html = renderToStaticMarkup(<ThresholdControls value={PRESETS.conservative.thresholds} editable onChange={vi.fn()} />);
    const references = [
      ['idc-conservative', 'Scénario 1, Base légale : 650 MJ/m²/an', 56.25],
      ['idc-ambitious', 'Scénario 2, Exemplaire : 450 MJ/m²/an', 31.25],
      ['condition-conservative', 'Scénario 1, Base légale : 0,50 / 1', 50],
      ['condition-ambitious', 'Scénario 2, Exemplaire : 0,50 / 1', 50],
      ['carbon-conservative', 'Scénario 1, Base légale : 48 kgCO₂e/m²/an', 47 / 79 * 100],
      ['carbon-ambitious', 'Scénario 2, Exemplaire : 25 kgCO₂e/m²/an', 24 / 79 * 100],
    ] as const;
    for (const [id, label, position] of references) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`data-testid="reference-${id}" style="left:${position}%"`);
    }
    expect((html.match(/class="reference-key conservative"/g) ?? []).length).toBe(3);
    expect((html.match(/class="reference-key ambitious"/g) ?? []).length).toBe(3);
  });

  it('garde les repères des bases fixes lorsque les seuils modulables sont différents', () => {
    const html = renderToStaticMarkup(<ThresholdControls value={{ idc: 700, condition: 0.9, carbon: 35 }} editable onChange={vi.fn()} />);
    expect(html).toContain('value="700"');
    expect(html).toContain('Base légale : 650 MJ/m²/an');
    expect(html).toContain('Exemplaire : 450 MJ/m²/an');
    expect(html).not.toContain('disabled=""');
  });

  it('conserve les trois curseurs prédéfinis en lecture seule', () => {
    const html = renderToStaticMarkup(<ThresholdControls value={PRESETS.conservative.thresholds} editable={false} onChange={vi.fn()} />);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
    expect(html).not.toContain('class="range-references"');
    expect(html).not.toContain('class="reference-values"');
  });

  it('démarre au 1er janvier 2027 et affiche les trois horizons demandés', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Seuils au 1er janvier 2027');
    for (const label of ['Dès 2027', 'D’ici 2032', 'D’ici 2037']) expect(html).toContain(label);
    expect(html).not.toContain('Aujourd’hui');
  });

  it('place l’export coloré sous les scénarios, sans boutons d’export dans la feuille de route', () => {
    const html = renderToStaticMarkup(<App />);
    const exportPosition = html.indexOf('class="strategy-export-button"');
    expect(exportPosition).toBeGreaterThan(html.indexOf('class="strategy-options"'));
    expect(exportPosition).toBeLessThan(html.indexOf('class="threshold-heading"'));
    expect(html).toContain('Exporter la stratégie');
    expect(html).not.toContain('Export CSV');
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).not.toContain('Rapport HTML');
    const roadmap = html.slice(html.indexOf('data-tour="roadmap"'));
    expect(roadmap).not.toContain('Rapport HTML');
    expect(roadmap).not.toContain('export-actions');
  });
});

describe('Indicateurs de périmètre et identité', () => {
  it('affiche le nombre exact de bâtiments et leur surface dans les valeurs mises en avant', () => {
    const program = selectProgram(assessPortfolio(BUILDINGS, PRESETS.conservative), 0, null);
    const format = (value: number) => new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(value);
    const html = renderToStaticMarkup(<App />);
    const displayedCount = html.match(/data-testid="program-count">([^<]+)<\/strong>/)?.[1];
    const displayedArea = html.match(/data-testid="program-area">([^<]+)<\/strong>/)?.[1];
    expect(displayedCount).toBe(renderToStaticMarkup(<>{format(program.length)}</>));
    expect(displayedArea).toBe(renderToStaticMarkup(<>{format(program.reduce((sum, item) => sum + item.building.area, 0))}</>));
    expect(html).toContain('bâtiments à rénover');
    expect(html).toContain('concernés');
  });

  it('affiche les moyennes de tout le parc et le nouveau libellé de l’investissement', () => {
    const program = selectProgram(assessPortfolio(BUILDINGS, PRESETS.conservative), 0, null);
    const metrics = programMetrics(program, PRESETS.conservative, DASHBOARD_LAST_YEAR, BUILDINGS);
    const format = (value: number, digits = 0) => new Intl.NumberFormat('fr-CH', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Investissement requis');
    expect(html).not.toContain('<span>Enveloppe</span>');
    expect(html).toContain('IDC moyen · tout le parc');
    expect(html).toContain('État moyen · tout le parc');
    expect(html).toContain(`data-testid="portfolio-idc">${format(metrics.idcBefore)}<`);
    expect(html).toContain(`data-testid="portfolio-condition">${format(metrics.conditionBefore, 2)}<`);
    expect(metrics.portfolioCount).toBe(BUILDINGS.length);
  });

  it('utilise le fichier du logo officiel sans redessiner le blason', () => {
    const html = renderToStaticMarkup(<Blason />);
    expect(html).toContain('src="/ville-geneve.svg"');
    expect(html).toContain('width="110"');
    expect(html).toContain('alt="Ville de Genève — logo officiel"');
    expect(html).not.toContain('<svg');
  });
});

describe('Couleurs des échéances', () => {
  it('propose la réinitialisation et explique comment isoler les bâtiments à dix ans', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Réinitialiser les filtres');
    expect(html).toContain('Effacer l’échéance, les affectations et la recherche');
    expect(html).toContain('Rouge, jaune et vert : pleine opacité.');
    expect(html).toContain('Au-delà de 10 ans : gris à 30 %.');
    expect(html).toContain('« Sous 10 ans » couvre les besoins entre 5 et 10 ans.');
  });

  it('transmet tous les bâtiments à la carte par défaut, dont les bâtiments verts à dix ans', () => {
    const portfolio = assessPortfolio(BUILDINGS, PRESETS.conservative);
    const html = renderToStaticMarkup(<App />);
    expect((html.match(/data-building-id="/g) ?? []).length).toBe(BUILDINGS.length);
    expect((html.match(/data-building-id="[^"]+" data-cohort="ten"/g) ?? []).length)
      .toBe(portfolio.filter((item) => item.cohort === 'ten').length);
  });

  it('conserve tous les points et leurs positions, avec 30 % seulement pour le gris, lorsque les seuils changent', () => {
    const strategies = [
      PRESETS.conservative,
      PRESETS.ambitious,
      { ...PRESETS.conservative, thresholds: { idc: 1000, condition: 0, carbon: 80 } },
      { ...PRESETS.conservative, thresholds: { idc: 200, condition: 1, carbon: 1 } },
    ];
    let initialPositions: string[] | undefined;
    for (const strategy of strategies) {
      const assessments = assessPortfolio(BUILDINGS, strategy);
      const html = renderToStaticMarkup(<ScatterPlot assessments={assessments} selected={null}
        strategy={strategy} year={BASE_YEAR} onSelect={vi.fn()} />);
      const points = [...html.matchAll(/<g transform="([^"]+)" opacity="([^"]+)" class="scatter-point" data-building-id="([^"]+)" data-cohort="([^"]+)"/g)];
      const positions = points.map((match) => `${match[3]}:${match[1]}`).sort();
      expect(positions.length).toBe(BUILDINGS.length);
      for (const point of points) {
        expect(Number(point[2])).toBe(point[4] === 'safe' ? 0.3 : 1);
      }
      if (initialPositions) expect(positions).toEqual(initialPositions);
      else initialPositions = positions;
      for (const item of assessments.filter((entry) => entry.cohort === 'ten')) {
        expect(html).toContain(`fill="${markerColor(item.cohort, criteriaOf(item))}"`);
      }
    }
  });

  it.each(['conservative'] as const)('conserve des bâtiments à dix ans dans le parc réel (%s)', (id) => {
    const portfolio = assessPortfolio(BUILDINGS, PRESETS[id]);
    const ten = selectProgram(portfolio, 0, 'ten');
    expect(ten.length).toBeGreaterThan(0);
    expect(ten.every((item) => item.dueYear !== null && item.dueYear > BASE_YEAR + 5 && item.dueYear <= DASHBOARD_LAST_YEAR)).toBe(true);
    expect(markerColor('ten', 1)).toBe(SHADES.ten[0]);
    expect(new Set(ten.map((item) => item.building.id)).size).toBe(ten.length);
  });

  it.each([
    ['now', '#d64a48'],
    ['five', '#d4ad25'],
    ['ten', '#329780'],
    ['safe', '#827f7c'],
  ] as const)('garde la famille de couleur %s cohérente entre le modèle et les symboles', (cohort, color) => {
    expect(COHORTS[cohort].color).toBe(color);
    expect(SHADES[cohort][1]).toBe(color);
    expect(markerColor(cohort, 2)).toBe(color);
    for (const shade of SHADES[cohort]) expect(ICON_COLORS).toContain(shade);
  });

  it('utilise le gris à 30 % pour la surveillance et conserve les trois autres échéances à 100 %', () => {
    expect(markerColor('safe', 0)).toBe('#827f7c');
    expect(COHORTS.safe.opacity).toBe(0.3);
    for (const cohort of ['now', 'five', 'ten'] as const) expect(COHORTS[cohort].opacity).toBe(1);
    expect(SHADES.safe.every((color) => color === COHORTS.safe.color)).toBe(true);
    expect(SHADES.five).not.toEqual(SHADES.ten);
  });

  it('utilise des symboles bleus pour les affectations et les tailles de la légende', () => {
    const html = renderToStaticMarkup(<App />);
    const sizes = html.match(/<div class="size-legend">([\s\S]*?)<\/div>/)?.[1];
    expect(sizes?.match(/fill="#347bc1"/g)?.length).toBe(4);
    expect(html).toContain('class="use-filter "');
    expect(html).toContain('data-cohort="safe"');
    expect(html).toContain('Au-delà de 10 ans');
  });
});

describe('Paquet recommandé dans l’onglet Mesures', () => {
  const sample: Building = {
    id: 'T', name: 'Test', district: 'Démo', use: 'Administration', coordinates: [46.2, 6.14], area: 1000,
    constructionYear: 1980, condition: 0.9, annualDecay: 0, idc: 400, carbonIntensity: 60, heating: 'Gaz',
  };
  it('coche par défaut le paquet recommandé et affiche sa profondeur et la part vitrée', () => {
    const assessment = assessBuilding(sample, PRESETS.conservative);
    expect(assessment.cohort).toBe('now');
    const html = renderToStaticMarkup(<RenovationTab assessment={assessment} strategy={PRESETS.conservative} onShowOnMap={vi.fn()} />);
    const recommended = renovationFor(sample, assessment.dueYear!, PRESETS.conservative);
    expect(html).toContain('data-testid="recommended-depth"');
    expect(recommended.depth).toBe('energy');
    expect(html).toContain('rénovation énergétique');
    expect((html.match(/type="checkbox" checked=""/g) ?? []).length).toBe(recommended.plan.measures.filter((m) => m.included).length);
    expect(html).toContain('60 % de la façade brute (Administration)');
    expect(html).toContain('Tout cocher');
  });
});
