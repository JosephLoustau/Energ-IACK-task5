import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { AlertTriangle, LocateFixed } from 'lucide-react';
import { BUILDINGS } from './data';
import { COHORTS } from './model';
import type { Assessment } from './model';
import { ICON_COLORS, SHAPES, SHAPE_NAMES, criteriaOf, iconKey, markerColor, symbolScale } from './symbols';

maplibregl.setWorkerUrl(workerUrl);

export const BASEMAP_STYLE = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json';

const lngs = BUILDINGS.map((b) => b.coordinates[1]);
const lats = BUILDINGS.map((b) => b.coordinates[0]);
const BOUNDS: LngLatBoundsLike = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
const ICON_PX = 44; // pixelRatio 2 → 22 px à l'échelle 1

function drawIcon(shape: keyof typeof SHAPES, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(ICON_PX / 2, ICON_PX / 2);
  ctx.scale(ICON_PX / 2 - 3, ICON_PX / 2 - 3);
  const path = new Path2D(SHAPES[shape]);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.lineWidth = 0.14;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';
  ctx.stroke(path);
  return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
}

function toCollection(assessments: Assessment[]) {
  return {
    type: 'FeatureCollection' as const,
    features: assessments.map((item) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [item.building.coordinates[1], item.building.coordinates[0]] },
      properties: {
        id: item.building.id,
        name: item.building.name,
        info: `${item.building.use} · ${COHORTS[item.cohort].short}`,
        icon: iconKey(item.building.use, markerColor(item.cohort, criteriaOf(item))),
        size: Number(symbolScale(item.building.area).toFixed(2)),
        sre: item.building.area,
        opacity: COHORTS[item.cohort].opacity,
      },
    })),
  };
}

interface Props {
  assessments: Assessment[];
  selected: string | null;
  active: boolean;
  onSelect: (id: string) => void;
}

export default function BuildingMap({ assessments, selected, active, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!, style: BASEMAP_STYLE, bounds: BOUNDS,
      fitBoundsOptions: { padding: 50 }, maxPitch: 0, dragRotate: false, attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', () => setError(true));
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'building-popup' });
    map.on('load', () => {
      map.addSource('buildings', { type: 'geojson', data: toCollection([]) });
      map.addLayer({
        id: 'selected-halo', type: 'circle', source: 'buildings', filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': ['+', 10, ['*', ['get', 'size'], 9]], 'circle-color': '#f6c51c', 'circle-opacity': 0.55,
          'circle-stroke-color': '#111', 'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'buildings', type: 'symbol', source: 'buildings',
        layout: {
          'icon-image': ['get', 'icon'], 'icon-size': ['get', 'size'], 'icon-allow-overlap': true,
          'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'sre']],
        },
        paint: { 'icon-opacity': ['get', 'opacity'] },
      });
      map.on('click', 'buildings', (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(String(id));
      });
      map.on('mousemove', 'buildings', (event: MapLayerMouseEvent) => {
        const props = event.features?.[0]?.properties;
        if (!props) return;
        map.getCanvas().style.cursor = 'pointer';
        const box = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = String(props.name);
        const info = document.createElement('span');
        info.textContent = String(props.info);
        box.append(title, document.createElement('br'), info);
        popup.setLngLat(event.lngLat).setDOMContent(box).addTo(map);
      });
      map.on('mouseleave', 'buildings', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      setReady(true);
    });
    return () => { popup.remove(); map.remove(); mapRef.current = null; setReady(false); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const shape of SHAPE_NAMES) for (const color of ICON_COLORS) {
      const key = `${shape}|${color}`;
      if (!map.hasImage(key)) map.addImage(key, drawIcon(shape, color), { pixelRatio: 2 });
    }
    (map.getSource('buildings') as GeoJSONSource).setData(toCollection(assessments));
  }, [assessments, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter('selected-halo', ['==', ['get', 'id'], selected ?? '']);
    const building = BUILDINGS.find((b) => b.id === selected);
    if (building) map.easeTo({ center: [building.coordinates[1], building.coordinates[0]], duration: 500 });
  }, [selected, ready]);

  useEffect(() => { if (active) mapRef.current?.resize(); }, [active]);

  return <div className="map-wrap">
    <div ref={container} className="building-map" aria-label="Carte des bâtiments de la Ville de Genève" />
    <button className="map-recenter" onClick={() => mapRef.current?.fitBounds(BOUNDS, { padding: 50 })} title="Recentrer sur le parc" aria-label="Recentrer sur le parc"><LocateFixed size={18} /></button>
    {error && <div className="map-warning" role="status"><AlertTriangle size={15} /> Fond de carte swisstopo partiellement indisponible. Les points restent utilisables.</div>}
    {assessments.length === 0 && <div className="map-empty">Aucun bâtiment ne correspond aux filtres.</div>}
  </div>;
}
