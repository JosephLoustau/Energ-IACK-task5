import { describe, expect, it } from 'vitest';
import { BASE_YEAR, PRESETS, assessPortfolio, renovationFor } from '../model';
import type { Building } from '../model';
import { HtmlReport } from './HtmlReport';
import { PLANNING, RoadmapPlanner, ScenarioPlan, StrategyComparison, baselineEmissions, comfortFactor } from './plan';

const building = (id: string, overrides: Partial<Building> = {}): Building => ({
  id, name: `Bât ${id}`, district: 'Test', use: 'Administration', coordinates: [46.2, 6.14],
  area: 1000, constructionYear: 1960, condition: 0.8, annualDecay: 0.01,
  idc: 800, carbonIntensity: 40, heating: 'Gaz', ...overrides,
});

const stock = [
  building('A', { area: 2000 }),
  building('B'),
  building('C', { idc: 300, carbonIntensity: 3, condition: 0.95 }), // never triggered
];
const indexOf = new Map(stock.map((b, i) => [b.id, i]));
const assessments = assessPortfolio(stock, PRESETS.conservative);

describe('RoadmapPlanner', () => {
  it('starts works no earlier than the first works year and skips safe buildings', () => {
    const works = new RoadmapPlanner(null).schedule(assessments, indexOf, PRESETS.conservative.thresholds);
    expect(works.map((w) => stock[w.index]!.id).sort()).toEqual(['A', 'B']);
    expect(works.every((w) => w.worksYear === PLANNING.firstWorksYear)).toBe(true);
  });

  it('pushes buildings to later years when the annual budget is exhausted, with costs at the works year', () => {
    const costA = renovationFor(stock[0]!, PLANNING.firstWorksYear).cost;
    const works = new RoadmapPlanner(costA + 1).schedule(assessments, indexOf, PRESETS.conservative.thresholds);
    const years = works.map((w) => w.worksYear).sort();
    expect(years).toEqual([PLANNING.firstWorksYear, PLANNING.firstWorksYear + 1]);
    const late = works.find((w) => w.worksYear > PLANNING.firstWorksYear)!;
    expect(late.cost).toBeCloseTo(renovationFor(stock[late.index]!, late.worksYear).cost);
  });

  it('places a building above the cap alone in an empty year', () => {
    const works = new RoadmapPlanner(1).schedule(assessments, indexOf, PRESETS.conservative.thresholds);
    expect(new Set(works.map((w) => w.worksYear)).size).toBe(works.length);
  });
});

describe('ScenarioPlan', () => {
  it('counts the CO2 gain from the year after works, and never double counts', () => {
    const works = new RoadmapPlanner(null).schedule(assessments, indexOf, PRESETS.conservative.thresholds);
    const years = [BASE_YEAR, BASE_YEAR + 1, BASE_YEAR + 2, BASE_YEAR + 3, BASE_YEAR + 4];
    const plan = new ScenarioPlan(stock, works, years);
    const base = baselineEmissions(stock);
    const worksSlot = PLANNING.firstWorksYear - BASE_YEAR;
    expect(plan.series.emissions[worksSlot]).toBeCloseTo(base);
    expect(plan.series.emissions[worksSlot + 1]).toBeCloseTo(base - plan.carbonSaved);
    expect(plan.series.capex.reduce((s, v) => s + v, 0)).toBeCloseTo(plan.totalCost);
    expect(plan.completionYear).toBe(PLANNING.firstWorksYear);
  });
});

describe('StrategyComparison & HtmlReport', () => {
  const comparison = new StrategyComparison(stock, [PRESETS.conservative, PRESETS.ambitious]);

  it('a tighter budget never ends earlier nor emits less', () => {
    const tight = comparison.plan('ambitious', 40e6);
    const free = comparison.plan('ambitious', null);
    expect(tight.cumulativeEmissions).toBeGreaterThanOrEqual(free.cumulativeEmissions - 1e-6);
    expect(tight.completionYear!).toBeGreaterThanOrEqual(free.completionYear!);
  });

  it('a lower thermostat cuts baseline emissions and never adds works or cost', () => {
    expect(comparison.baseline(2)).toBeCloseTo(comparison.baseline(0) * comfortFactor(2));
    for (const id of ['conservative', 'ambitious']) {
      const normal = comparison.plan(id, null, 0), sober = comparison.plan(id, null, 2);
      expect(sober.works.length).toBeLessThanOrEqual(normal.works.length);
      expect(sober.cumulativeEmissions).toBeLessThan(normal.cumulativeEmissions);
    }
  });

  it('renders a self-contained report that escapes script-closing names', () => {
    const html = new HtmlReport({
      buildings: [...stock, building('X', { name: '</script><b>x' })],
      strategies: [PRESETS.conservative, PRESETS.ambitious],
      selectedStrategy: 'conservative', scopeLabel: 'Test',
    }).render();
    expect(html).toContain('id="report-data"');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});
