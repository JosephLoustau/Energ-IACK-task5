import { COHORTS } from './model';
import type { Assessment, Cohort } from './model';

/** Formes en repère [-1, 1], utilisables en SVG (path) et en canvas (Path2D). */
const star = (() => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? 1.1 : 0.48;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    return `${(Math.cos(angle) * radius).toFixed(3)} ${(Math.sin(angle) * radius).toFixed(3)}`;
  });
  return `M${points.join(' L')}Z`;
})();

export const SHAPES = {
  circle: 'M0 -1 A1 1 0 1 1 0 1 A1 1 0 1 1 0 -1Z',
  square: 'M-.85 -.85 H.85 V.85 H-.85Z',
  triangle: 'M0 -1.05 L1.05 .85 L-1.05 .85Z',
  diamond: 'M0 -1.15 L1.15 0 L0 1.15 L-1.15 0Z',
  hexagon: 'M-.5 -.87 L.5 -.87 L1 0 L.5 .87 L-.5 .87 L-1 0Z',
  pentagon: 'M0 -1 L.95 -.31 L.59 .81 L-.59 .81 L-.95 -.31Z',
  star,
  cross: 'M-.35 -1 H.35 V-.35 H1 V.35 H.35 V1 H-.35 V.35 H-1 V-.35 H-.35Z',
} as const;
export type ShapeName = keyof typeof SHAPES;

const USE_SHAPE: Record<string, ShapeName> = {
  'Logement': 'circle', 'Logement mixte': 'hexagon', 'Éducation': 'triangle',
  'Administration': 'square', 'Commerce & ateliers': 'diamond', 'Culture & loisirs': 'star',
  'Sport': 'cross', 'Santé & social': 'pentagon',
  // Jeu de démonstration historique
  'École': 'triangle', 'Musée': 'star',
};
export const shapeFor = (use: string): ShapeName => USE_SHAPE[use] ?? 'circle';

/** Teintes selon l'échéance et le nombre de critères dépassés (IDC, CO₂, vétusté). */
export const SHADES: Record<Cohort, [string, string, string]> = {
  now: ['#f4958d', COHORTS.now.color, '#8b0a12'],
  five: ['#fbe58b', COHORTS.five.color, '#b28b0b'],
  ten: ['#a8d7bf', COHORTS.ten.color, '#1c654e'],
  safe: [COHORTS.safe.color, COHORTS.safe.color, COHORTS.safe.color],
};
export const markerColor = (cohort: Cohort, criteria: number) =>
  SHADES[cohort][Math.min(3, Math.max(1, criteria)) - 1]!;
export const criteriaOf = (item: Assessment) => item.triggers.length;

/** Échelle proportionnelle à la racine de la SRE (la surface du symbole suit la SRE). */
export const SRE_MAX = 25000;
export const symbolScale = (sre: number) => 0.4 + 1.4 * Math.sqrt(Math.min(sre, SRE_MAX) / SRE_MAX);
export const iconKey = (use: string, color: string) => `${shapeFor(use)}|${color}`;
export const ICON_COLORS = [...new Set(Object.values(SHADES).flat())];
export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];
