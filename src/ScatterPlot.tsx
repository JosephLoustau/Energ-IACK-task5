import { useState } from 'react';
import { BUILDINGS } from './data';
import { COHORTS, thresholdsAt } from './model';
import type { Assessment, Strategy } from './model';
import { SHAPES, criteriaOf, markerColor, shapeFor, symbolScale } from './symbols';

const W = 900, H = 560, M = { top: 24, right: 28, bottom: 58, left: 70 };
const xMax = Math.ceil(Math.max(...BUILDINGS.map((b) => b.idc)) / 100) * 100;
const yMax = Math.ceil(Math.max(...BUILDINGS.map((b) => b.carbonIntensity)) / 10) * 10;
const sx = (value: number) => M.left + value / xMax * (W - M.left - M.right);
const sy = (value: number) => H - M.bottom - value / yMax * (H - M.top - M.bottom);
const ticks = (max: number, step: number) => Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);

interface Props {
  assessments: Assessment[];
  selected: string | null;
  strategy: Strategy;
  year: number;
  onSelect: (id: string) => void;
}

export default function ScatterPlot({ assessments, selected, strategy, year, onSelect }: Props) {
  const [hover, setHover] = useState<Assessment | null>(null);
  const limits = thresholdsAt(strategy, year);
  const ordered = [...assessments].sort((a, b) => b.building.area - a.building.area);
  const hovered = hover?.building;
  return <div className="scatter-wrap">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Diagramme IDC et intensité carbone des bâtiments">
      <rect x={sx(limits.idc)} y={M.top} width={sx(xMax) - sx(limits.idc)} height={sy(0) - M.top} className="zone-idc" />
      <rect x={M.left} y={M.top} width={sx(limits.idc) - M.left} height={sy(limits.carbon) - M.top} className="zone-co2" />
      {ticks(xMax, 200).map((t) => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={M.top} y2={sy(0)} className="grid" /><text x={sx(t)} y={sy(0) + 20} textAnchor="middle" className="tick">{t}</text></g>)}
      {ticks(yMax, 10).map((t) => <g key={`y${t}`}><line x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} className="grid" /><text x={M.left - 10} y={sy(t) + 4} textAnchor="end" className="tick">{t}</text></g>)}
      <line x1={sx(limits.idc)} x2={sx(limits.idc)} y1={M.top} y2={sy(0)} className="threshold-line" />
      <line x1={M.left} x2={W - M.right} y1={sy(limits.carbon)} y2={sy(limits.carbon)} className="threshold-line" />
      <text x={sx(limits.idc) + 6} y={M.top + 14} className="threshold-label">seuil IDC {limits.idc}</text>
      <text x={W - M.right - 4} y={sy(limits.carbon) - 6} textAnchor="end" className="threshold-label">seuil CO₂ {limits.carbon}</text>
      <rect x={M.left} y={M.top} width={W - M.left - M.right} height={sy(0) - M.top} className="frame" />
      <text x={(M.left + W - M.right) / 2} y={H - 14} textAnchor="middle" className="axis-title">IDC — MJ/m²/an (chauffage + eau chaude)</text>
      <text transform={`translate(18 ${(M.top + sy(0)) / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">Intensité carbone — kgCO₂e/m²/an</text>
      {ordered.map((item) => {
        const { building } = item;
        const r = 6 * symbolScale(building.area);
        const isSelected = selected === building.id;
        return <g key={building.id} transform={`translate(${sx(building.idc)} ${sy(building.carbonIntensity)}) scale(${r})`}
          opacity={COHORTS[item.cohort].opacity} className="scatter-point" data-building-id={building.id} data-cohort={item.cohort} tabIndex={0} role="button"
          aria-label={`${building.name}, IDC ${building.idc}, CO₂ ${building.carbonIntensity}`}
          onMouseEnter={() => setHover(item)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(item)} onBlur={() => setHover(null)}
          onClick={() => onSelect(building.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(building.id); }}>
          <path d={SHAPES[shapeFor(building.use)]} fill={markerColor(item.cohort, criteriaOf(item))} stroke={isSelected ? '#e30613' : '#111'} strokeWidth={isSelected ? 0.34 : 0.14} vectorEffect="none" />
        </g>;
      })}
    </svg>
    {hovered && <div className="scatter-tooltip" style={{ left: `${sx(hovered.idc) / W * 100}%`, top: `${sy(hovered.carbonIntensity) / H * 100}%` }}>
      <strong>{hovered.name}</strong><span>{hovered.use} · {hovered.area.toLocaleString('fr-CH')} m² SRE</span><span>IDC {hovered.idc} · CO₂ {hovered.carbonIntensity}</span>
    </div>}
  </div>;
}
