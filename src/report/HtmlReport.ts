import { BASE_YEAR, CRITERIA } from '../model';
import type { Building, Strategy } from '../model';
import { PLANNING, StrategyComparison } from './plan';
import { Basemap } from './basemap';
import { SHADES, SHAPES, shapeFor } from '../symbols';
import { REPORT_TEXTS } from './texts';
import type { ReportTexts } from './texts';
import css from './report.css?raw';
import runtime from './runtime.js?raw';

export interface ReportOptions {
  buildings: Building[];
  strategies: Strategy[];
  selectedStrategy: string;
  scopeLabel: string;
  /** Overrides of the default wording (see texts.ts). */
  texts?: Partial<ReportTexts>;
  generatedAt?: Date;
}

const round = (value: number, digits = 0) => Number(value.toFixed(digits));

/** Self-contained interactive HTML report (data + CSS + vanilla JS, no network needed except fonts). */
export class HtmlReport {
  readonly options: ReportOptions;
  readonly comparison: StrategyComparison;
  readonly basemap: Basemap;
  private basemapImage?: string;

  constructor(options: ReportOptions) {
    this.options = options;
    this.comparison = new StrategyComparison(options.buildings, options.strategies);
    this.basemap = new Basemap(options.buildings.map((b) => ({ lat: b.coordinates[0], lon: b.coordinates[1] })));
  }

  /** Fetches the basemap image (network); without it the maps still render, on a plain background. */
  async prepare() {
    this.basemapImage = await this.basemap.image();
    return this;
  }

  payload() {
    const { buildings, strategies, selectedStrategy, scopeLabel } = this.options;
    const budgetKey = (budget: number | null) => budget === null ? 'none' : String(budget);
    return {
      meta: {
        generatedAt: (this.options.generatedAt ?? new Date()).toISOString(),
        scopeLabel,
        baseYear: BASE_YEAR,
        horizonYear: PLANNING.horizonYear,
        firstWorksYear: PLANNING.firstWorksYear,
        selectedStrategy,
        fileName: `decathlon-geneve-${(this.options.generatedAt ?? new Date()).toISOString().slice(0, 10)}`,
        defaultBudget: budgetKey(PLANNING.defaultBudget),
        budgets: PLANNING.budgetLevels.map((budget) => ({ key: budgetKey(budget), value: budget })),
        comfortLevels: PLANNING.comfortLevels.map(String),
        savingPerDegree: PLANNING.savingPerDegree,
        defaultScc: PLANNING.defaultScc,
        criteria: CRITERIA,
        texts: { ...REPORT_TEXTS, ...this.options.texts },
        // Map symbols shared with the app: shape per usage, shades per cohort (1, 2, 3 criteria).
        shapes: Object.fromEntries([...new Set(buildings.map((b) => b.use))].map((use) => [use, SHAPES[shapeFor(use)]])),
        shades: SHADES,
        map: { ...this.basemap.view, image: this.basemapImage ?? null },
      },
      years: this.comparison.years,
      baseline: round(this.comparison.baseline(), 1),
      baselineByComfort: Object.fromEntries(PLANNING.comfortLevels.map((c) => [String(c), round(this.comparison.baseline(c), 1)])),
      buildings: buildings.map((b) => ({
        id: b.id, name: b.name, district: b.district, use: b.use,
        lat: b.coordinates[0], lon: b.coordinates[1], area: Math.round(b.area),
        idc: Math.round(b.idc), co2: round(b.carbonIntensity, 1), cond: round(b.condition, 2), heating: b.heating,
      })),
      strategies: strategies.map((strategy) => ({
        id: strategy.id, name: strategy.name, thresholds: strategy.thresholds, changes: strategy.changes,
        comfort: Object.fromEntries(PLANNING.comfortLevels.map((comfort) => [String(comfort), this.comfortPayload(strategy.id, comfort, budgetKey)])),
      })),
    };
  }

  private comfortPayload(strategyId: string, comfort: number, budgetKey: (budget: number | null) => string) {
    const { buildings } = this.options;
    const due = new Array<number | null>(buildings.length).fill(null);
    const triggers = new Array<string[]>(buildings.length).fill([]);
    const indexOf = new Map(buildings.map((b, i) => [b.id, i]));
    for (const item of this.comparison.assessments.get(`${strategyId}|${comfort}`) ?? []) {
      const index = indexOf.get(item.building.id)!;
      due[index] = item.dueYear;
      triggers[index] = item.triggers;
    }
    return {
      due, triggers,
      plans: Object.fromEntries(PLANNING.budgetLevels.map((budget) => {
        const plan = this.comparison.plan(strategyId, budget, comfort);
        return [budgetKey(budget), {
          works: plan.works.map((w) => [w.index, w.worksYear, Math.round(w.cost), round(w.carbonSaved, 2), w.residual ? 1 : 0]),
          capex: plan.series.capex.map((v) => Math.round(v)),
          count: plan.series.count,
          emissions: plan.series.emissions.map((v) => round(v, 1)),
          totalCost: Math.round(plan.totalCost),
          carbonSaved: round(plan.carbonSaved, 1),
          completionYear: plan.completionYear,
          residual: plan.residualCount,
          cumulative: Math.round(plan.cumulativeEmissions),
        }];
      })),
    };
  }

  render() {
    // `<` escaped so building names can never close the script tag.
    const data = JSON.stringify(this.payload()).replace(/</g, '\\u003c');
    const selected = this.options.strategies.find((s) => s.id === this.options.selectedStrategy);
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feuille de route de décarbonation · ${escapeHtml(selected?.name ?? '')}</title>
<style>${css}</style>
</head>
<body>
<div id="report"></div>
<script type="application/json" id="report-data">${data}</script>
<script>${runtime}</script>
</body>
</html>`;
  }

  /** Opens the report in a new tab; the report itself offers HTML and CSV downloads. */
  async open() {
    // Tab opened before any await, so popup blockers still see a user click.
    const tab = window.open('', '_blank');
    tab?.document.write('<p style="font:14px Helvetica Neue,Arial,sans-serif;padding:24px">Préparation du rapport…</p>');
    await this.prepare();
    const url = URL.createObjectURL(new Blob([this.render()], { type: 'text/html;charset=utf-8' }));
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
