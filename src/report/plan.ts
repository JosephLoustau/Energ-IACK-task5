import { BASE_YEAR, assessPortfolio, renovationFor } from '../model';
import type { Assessment, Building, RenovationDepth, Strategy, Thresholds } from '../model';

/** Planning hypotheses for the operational roadmap (to be validated with the City). */
export const PLANNING = {
  /** Earliest works year: one year of studies + one year of public tender after the decision. */
  firstWorksYear: BASE_YEAR + 2,
  studyYears: 1,
  tenderYears: 1,
  /** Trajectory end (Geneva climate-neutrality target year). */
  horizonYear: 2050,
  /** Annual investment caps proposed in the report, CHF/year; null = no cap. */
  budgetLevels: [40e6, 60e6, 80e6, 120e6, 200e6, null] as (number | null)[],
  defaultBudget: 80e6,
  /** Heating set-point reductions offered (°C), a demand-side lever applied from BASE_YEAR. */
  comfortLevels: [0, 1, 2],
  /** Heat demand saved per °C of set-point reduction (rule of thumb, to be validated). */
  savingPerDegree: 0.06,
  /** Default social cost of carbon, CHF/tCO2e (marginal damage of one more tonne emitted). */
  defaultScc: 177,
};

/** Demand factor for a set-point reduction; applies to heat demand (IDC) and operational CO2 alike. */
export const comfortFactor = (degrees: number) => Math.max(0, 1 - PLANNING.savingPerDegree * degrees);

export const withComfort = (buildings: Building[], degrees: number): Building[] => degrees === 0 ? buildings
  : buildings.map((b) => ({ ...b, idc: b.idc * comfortFactor(degrees), carbonIntensity: b.carbonIntensity * comfortFactor(degrees) }));

export interface ScheduledWork {
  index: number;          // position in the building list
  dueYear: number;
  worksYear: number;
  cost: number;
  carbonSaved: number;    // tCO2e/yr once completed
  carbonAfter: number;    // kgCO2e/m2/yr
  idcAfter: number;
  depth: RenovationDepth; // recommended package: 'complete' or 'energy' (see renovationFor)
  /** Recommended package still exceeds a threshold in force between the works year and the horizon (same rule as the depth escalation). */
  residual: boolean;
  /** First threshold still exceeded after works: year and criteria, or null. */
  residualBreach: { year: number; criteria: string[] } | null;
}

export interface PlanSeries {
  capex: number[];        // CHF per year
  count: number[];        // buildings in works per year
  emissions: number[];    // tCO2e/yr of the scope
}

/** Greedy scheduler: buildings in priority order, each placed in the first year with enough budget left. */
export class RoadmapPlanner {
  readonly budget: number | null;
  readonly firstWorksYear: number;

  constructor(budget: number | null, firstWorksYear = PLANNING.firstWorksYear) {
    this.budget = budget;
    this.firstWorksYear = firstWorksYear;
  }

  /** Costs and residual checks use the recommended package of `strategy`, checked up to `lastYear` (the report horizon). */
  schedule(assessments: Assessment[], indexOf: Map<string, number>, strategy: Strategy, lastYear = PLANNING.horizonYear): ScheduledWork[] {
    const spent = new Map<number, number>();
    const works: ScheduledWork[] = [];
    for (const item of assessments) {
      if (item.dueYear === null) continue;
      let year = Math.max(item.dueYear, this.firstWorksYear);
      let renovation = renovationFor(item.building, year, strategy, lastYear);
      // An empty year always accepts a building, even above the cap, so the loop terminates.
      while (this.budget !== null && (spent.get(year) ?? 0) > 0 && (spent.get(year) ?? 0) + renovation.cost > this.budget) {
        year += 1;
        renovation = renovationFor(item.building, year, strategy, lastYear);
      }
      spent.set(year, (spent.get(year) ?? 0) + renovation.cost);
      works.push({
        index: indexOf.get(item.building.id)!,
        dueYear: item.dueYear,
        worksYear: year,
        cost: renovation.cost,
        carbonSaved: renovation.carbonSaved,
        carbonAfter: renovation.carbonAfter,
        idcAfter: renovation.idcAfter,
        depth: renovation.depth,
        residual: renovation.residual !== null,
        residualBreach: renovation.residual && { year: renovation.residual.year, criteria: renovation.residual.criteria },
      });
    }
    return works;
  }
}

/** One strategy scheduled under one annual budget, with its yearly series up to the horizon. */
export class ScenarioPlan {
  readonly works: ScheduledWork[];
  readonly years: number[];
  readonly series: PlanSeries;

  constructor(buildings: Building[], works: ScheduledWork[], years: number[]) {
    this.works = works;
    this.years = years;
    const capex = years.map(() => 0);
    const count = years.map(() => 0);
    const reductionFrom = new Map<number, number>(); // year gains start → tCO2e/yr
    for (const work of works) {
      const slot = work.worksYear - years[0]!;
      if (slot < years.length) { capex[slot]! += work.cost; count[slot]! += 1; }
      reductionFrom.set(work.worksYear + 1, (reductionFrom.get(work.worksYear + 1) ?? 0) + work.carbonSaved);
    }
    const baseline = baselineEmissions(buildings);
    let reduction = 0;
    const emissions = years.map((year) => {
      reduction += reductionFrom.get(year) ?? 0;
      return baseline - reduction;
    });
    this.series = { capex, count, emissions };
  }

  get totalCost() { return this.works.reduce((sum, work) => sum + work.cost, 0); }
  get carbonSaved() { return this.works.reduce((sum, work) => sum + work.carbonSaved, 0); }
  get completionYear() { return this.works.length ? Math.max(...this.works.map((work) => work.worksYear)) : null; }
  get residualCount() { return this.works.filter((work) => work.residual).length; }
  /** Sum of annual emissions over the trajectory, tCO2e. */
  get cumulativeEmissions() { return this.series.emissions.reduce((sum, value) => sum + value, 0); }
}

export const baselineEmissions = (buildings: Building[]) =>
  buildings.reduce((sum, building) => sum + building.carbonIntensity * building.area / 1000, 0);

/** All strategies × comfort levels × budget levels for a building scope. */
export class StrategyComparison {
  readonly buildings: Building[];
  readonly strategies: Strategy[];
  readonly years: number[];
  readonly assessments: Map<string, Assessment[]>;
  readonly plans: Map<string, ScenarioPlan>;

  constructor(buildings: Building[], strategies: Strategy[], budgets = PLANNING.budgetLevels, comfortLevels = PLANNING.comfortLevels) {
    this.buildings = buildings;
    this.strategies = strategies;
    this.years = Array.from({ length: PLANNING.horizonYear - BASE_YEAR + 1 }, (_, i) => BASE_YEAR + i);
    const indexOf = new Map(buildings.map((building, index) => [building.id, index]));
    this.assessments = new Map();
    this.plans = new Map();
    for (const comfort of comfortLevels) {
      const adjusted = withComfort(buildings, comfort);
      for (const strategy of strategies) {
        // Scanned up to the horizon, so buildings first exceeding a threshold after the dashboard's 10 years are scheduled too.
        const assessments = assessPortfolio(adjusted, strategy, PLANNING.horizonYear, PLANNING.horizonYear);
        this.assessments.set(`${strategy.id}|${comfort}`, assessments);
        for (const budget of budgets) {
          const works = new RoadmapPlanner(budget).schedule(assessments, indexOf, strategy);
          this.plans.set(`${strategy.id}|${comfort}|${budget}`, new ScenarioPlan(adjusted, works, this.years));
        }
      }
    }
  }

  plan(strategyId: string, budget: number | null, comfort = 0) {
    const plan = this.plans.get(`${strategyId}|${comfort}|${budget}`);
    if (!plan) throw new Error(`No plan for ${strategyId} / ${comfort} °C / ${budget}`);
    return plan;
  }

  baseline(comfort = 0) { return baselineEmissions(withComfort(this.buildings, comfort)); }
}

/** Thresholds of the last calendar step (not necessarily the strictest: the residual check scans every year instead). */
export function finalThresholdsOf(strategy: Strategy): Thresholds {
  return [...strategy.changes].sort((a, b) => b.year - a.year)[0]?.thresholds ?? strategy.thresholds;
}
