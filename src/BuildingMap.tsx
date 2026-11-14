import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { AlertTriangle, Box, LocateFixed, Map as MapIcon } from 'lucide-react';
import { COHORTS, describeDue } from './model';
import type { Assessment, Building } from './model';
import { ICON_COLORS, SHAPES, SHAPE_NAMES, criteriaOf, iconKey, markerColor, shapeFor, shapePolygon, symbolScale } from './symbols';

maplibregl.setWorkerUrl(workerUrl);

export const BASEMAP_STYLE = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json';

// Fond allégé : sans voies ferrées ni tram ; autoroutes et routes principales en blanc comme les autres.
const RAIL_LAYERS = ['public_transport', 'tunnel_public_transport', 'l1_public_transport', 'l2_public_transport_aerialway', 'road_number'];
const ROAD_FILL = ['road_fill', 'l1_fill', 'l2_fill'];
const ROAD_CASING = ['road_casing', 'l1_road_casing', 'l2_road_casing'];

function simplifyBasemap(map: maplibregl.Map) {
  for (const id of RAIL_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  for (const id of ROAD_FILL) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', '#fff');
  for (const id of ROAD_CASING) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', 'rgb(90, 90, 90)');
}

const ICON_PX = 44; // pixelRatio 2 → 22 px à l'échelle 1
const BLOCKS_URL = `${import.meta.env.BASE_URL}data/ville_geneve_3d.geojson`; // produit par stock.py (npm run data)
const BLOCK_LAYERS = ['context-3d', 'city-3d', 'pins', 'selection-disc', 'selection-ring'];
// Passage progressif plan → 3D : à Z_FLAT et en dessous, carte à plat ; à Z_FULL, volumes et inclinaison complets.
const Z_FLAT = 13;
const Z_FULL = 16;
const PITCH_3D = 55;
const pitchForZoom = (zoom: number) => PITCH_3D * Math.min(1, Math.max(0, (zoom - Z_FLAT) / (Z_FULL - Z_FLAT)));
/** Hauteur qui croît de 0 (Z_FLAT) à la hauteur réelle (Z_FULL). */
const risingHeight = (height: unknown) => ['interpolate', ['linear'], ['zoom'], Z_FLAT, 0, Z_FULL, height] as never;

const BLOCK_NEUTRAL = 'hsl(220, 6%, 70%)';
const SELECTED = '#f6c51c';
/** Volumes du parc : gris neutre, sélection en jaune. */
const blockColor = (selected: string | null) =>
  ['case', ['==', ['to-string', ['id']], selected ?? ''], SELECTED, BLOCK_NEUTRAL] as never;

// Marqueurs flottants (« plumbob ») : la forme du symbole (affectation) en volume au-dessus du toit,
// avec une petite pointe vers le bâtiment, colorée comme le symbole.
// Ils prennent le relais des symboles au sol (qui ne peuvent pas être surélevés) entre PIN_IN et PIN_IN + 1.
const PIN_IN = 14.5;
const PIN_GAP = 4;                                 // m au-dessus du toit
// Tranches du bas vers le haut : échelle de la forme et épaisseur (en multiples du rayon r).
const PIN_LEVELS = [{ scale: 0.22, thick: 0.3 }, { scale: 0.5, thick: 0.25 }, { scale: 1, thick: 0.6 }];
const pinColor = (selected: string | null) =>
  ['case', ['==', ['get', 'id'], selected ?? ''], SELECTED, ['get', 'color']] as never;
const symbolOpacity = (fade: boolean) => (fade
  ? ['interpolate', ['linear'], ['zoom'], PIN_IN, ['get', 'opacity'], PIN_IN + 1, 0]
  : ['get', 'opacity']) as never;
const fadeOut = (value: number, fade: boolean) =>
  (fade ? ['interpolate', ['linear'], ['zoom'], PIN_IN, value, PIN_IN + 1, 0] : value) as never;

// Sélection en 3D : le cercle au sol devient un disque jaune cerclé de noir, au pied du bâtiment.
const RING_WIDTH = 1.5;   // m
const RING_MARGIN = 4;    // m au-delà de l'emprise

/** Cercle de rayon r mètres (sens trigonométrique, ou horaire pour un trou). */
function circle(lng: number, lat: number, r: number, hole = false, n = 48) {
  const mLat = 1 / 111320;
  const mLng = 1 / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const a = (hole ? -1 : 1) * 2 * Math.PI * (i % n) / n;
    return [lng + Math.cos(a) * r * mLng, lat + Math.sin(a) * r * mLat];
  });
  return ring;
}

/** Rayon (m) de l'emprise du volume 3D autour du point, ou null si la tuile n'est pas chargée. */
function footprintRadius(map: maplibregl.Map, id: string, lng: number, lat: number) {
  const mLng = 111320 * Math.cos(lat * Math.PI / 180);
  let r = 0;
  for (const f of map.querySourceFeatures('city-blocks', { filter: ['==', ['to-string', ['id']], id] })) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const [x, y] of poly[0]!) {
      r = Math.max(r, Math.hypot((x! - lng) * mLng, (y! - lat) * 111320));
    }
  }
  return r || null;
}

function selectionRing(map: maplibregl.Map, id: string | null, buildings: Building[]) {
  const b = buildings.find((x) => x.id === id);
  if (!b || !id) return { type: 'FeatureCollection' as const, features: [] };
  const [lat, lng] = b.coordinates;
  const R = (footprintRadius(map, id, lng, lat) ?? 6 + 6 * symbolScale(b.area)) + RING_MARGIN;
  const feature = (part: string, coordinates: number[][][]): GeoJSON.Feature<GeoJSON.Polygon> =>
    ({ type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: { part } });
  return {
    type: 'FeatureCollection' as const,
    features: [
      feature('disc', [circle(lng, lat, R - RING_WIDTH)]),
      feature('ring', [circle(lng, lat, R), circle(lng, lat, R - RING_WIDTH, true)]),
    ],
  };
}

/** Forme (repère [-1, 1], y vers le bas) → anneau lng/lat de rayon r mètres autour du point. */
function shapeRing(shape: [number, number][], lng: number, lat: number, r: number) {
  const mLat = 1 / 111320;
  const mLng = 1 / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = shape.map(([x, y]) => [lng + x * r * mLng, lat - y * r * mLat]);
  return [[...ring, ring[0]!]];
}

/** Infobulle : affectation, catégorie et premier dépassement, y compris au-delà de l'horizon du tableau de bord. */
const popupInfo = (item: Assessment) => [item.building.use, COHORTS[item.cohort].short, describeDue(item)].filter(Boolean).join(' · ');

function toPins(assessments: Assessment[]) {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const item of assessments) {
    const b = item.building;
    const [lat, lng] = b.coordinates;
    const r = 4 + 3 * symbolScale(b.area);          // m, suit la taille du symbole (SRE)
    const shape = shapePolygon(shapeFor(b.use));
    let z = (b.height ?? 6) + PIN_GAP;
    const color = item.cohort === 'safe' ? '#d9d9d9' : markerColor(item.cohort, criteriaOf(item));
    const info = popupInfo(item);
    for (const { scale, thick } of PIN_LEVELS) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: shapeRing(shape, lng, lat, r * scale) },
        properties: { id: b.id, name: b.name, info, color, base: z, top: z + thick * r },
      });
      z += thick * r;
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

/** Volumes gris clairs : bâti environnant (fond swisstopo) + parc de la Ville (stock.py). */
function addBlocks(map: maplibregl.Map) {
  map.addSource('city-blocks', { type: 'geojson', data: BLOCKS_URL, promoteId: 'egid' });
  map.addLayer({
    id: 'context-3d', type: 'fill-extrusion', source: 'base_v1.0.0', 'source-layer': 'building', minzoom: 13,
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': 'hsl(220, 8%, 90%)',
      'fill-extrusion-height': risingHeight(['coalesce', ['get', 'render_height'], 0]),
      'fill-extrusion-base': risingHeight(['coalesce', ['get', 'render_min_height'], 0]),
      'fill-extrusion-opacity': 0.85,
    },
  }, 'selected-halo');
  map.addLayer({
    id: 'city-3d', type: 'fill-extrusion', source: 'city-blocks', layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': blockColor(null),
      'fill-extrusion-height': risingHeight(['coalesce', ['get', 'height'], 3]),
      'fill-extrusion-opacity': 0.95,
    },
  }, 'selected-halo');
  map.addSource('selection', { type: 'geojson', data: selectionRing(map, null, []) });
  for (const part of ['disc', 'ring']) map.addLayer({
    id: `selection-${part}`, type: 'fill-extrusion', source: 'selection', layout: { visibility: 'none' },
    filter: ['==', ['get', 'part'], part],
    paint: {
      'fill-extrusion-color': part === 'disc' ? SELECTED : '#111',
      'fill-extrusion-height': part === 'disc' ? 0.3 : 1,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], PIN_IN, 0, PIN_IN + 1, part === 'disc' ? 0.55 : 1],
    },
  }, 'context-3d');
  map.addSource('pins', { type: 'geojson', data: toPins([]) });
  map.addLayer({
    id: 'pins', type: 'fill-extrusion', source: 'pins', layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': pinColor(null),
      'fill-extrusion-base': risingHeight(['get', 'base']),
      'fill-extrusion-height': risingHeight(['get', 'top']),
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], PIN_IN, 0, PIN_IN + 1, 1],
    },
  }, 'selected-halo');
}

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
        info: popupInfo(item),
        icon: iconKey(item.building.use, markerColor(item.cohort, criteriaOf(item))),
        size: Number(symbolScale(item.building.area).toFixed(2)),
        sre: item.building.area,
        opacity: COHORTS[item.cohort].opacity,
      },
    })),
  };
}

interface Props {
  buildings: Building[];
  assessments: Assessment[];
  selected: string | null;
  active: boolean;
  onSelect: (id: string) => void;
}

export default function BuildingMap({ buildings, assessments, selected, active, onSelect }: Props) {
  const bounds = useMemo<LngLatBoundsLike>(() => {
    const lngs = buildings.map((building) => building.coordinates[1]);
    const lats = buildings.map((building) => building.coordinates[0]);
    return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  }, [buildings]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [blocksError, setBlocksError] = useState(false);
  const [is3d, setIs3d] = useState(true); // 3D automatique selon le zoom ; false = toujours en plan
  const is3dRef = useRef(is3d);
  is3dRef.current = is3d;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!, style: BASEMAP_STYLE, bounds,
      fitBoundsOptions: { padding: 50 }, maxPitch: 70, dragRotate: false, attributionControl: { compact: true },
      // L'inclinaison suit le zoom à chaque image, quel que soit le mouvement (molette, boutons +/−, animation).
      // Un setPitch pendant le zoom l'interromprait : au-delà de Z_FLAT, la carte ne zoomait presque plus.
      transformCameraUpdate: ({ zoom }) => (is3dRef.current && zoom !== undefined ? { pitch: pitchForZoom(zoom) } : {}),
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', (event) => {
      const sourceId = (event as { sourceId?: string }).sourceId;
      console.warn('[carte]', event.error?.message ?? event, sourceId ?? '');
      // Les volumes 3D (public/data/ville_geneve_3d.geojson) sont indépendants du fond de carte swisstopo.
      if (sourceId === 'city-blocks') setBlocksError(true); else setError(true);
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'building-popup' });
    map.on('load', () => {
      simplifyBasemap(map);
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
      addBlocks(map);
      map.on('click', 'city-3d', (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.id;
        if (id !== undefined) onSelectRef.current(String(id));
      });
      map.on('mouseenter', 'city-3d', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'city-3d', () => { map.getCanvas().style.cursor = ''; });
      for (const layer of ['buildings', 'pins']) map.on('click', layer, (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(String(id));
      });
      map.on('mousemove', ['buildings', 'pins'], (event: MapLayerMouseEvent) => {
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
      map.on('mouseleave', ['buildings', 'pins'], () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      setReady(true);
    });
    return () => { popup.remove(); map.remove(); mapRef.current = null; setReady(false); };
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const shape of SHAPE_NAMES) for (const color of ICON_COLORS) {
      const key = `${shape}|${color}`;
      if (!map.hasImage(key)) map.addImage(key, drawIcon(shape, color), { pixelRatio: 2 });
    }
    (map.getSource('buildings') as GeoJSONSource).setData(toCollection(assessments));
    (map.getSource('pins') as GeoJSONSource).setData(toPins(assessments));
  }, [assessments, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter('selected-halo', ['==', ['get', 'id'], selected ?? '']);
    map.setPaintProperty('city-3d', 'fill-extrusion-color', blockColor(selected));
    map.setPaintProperty('pins', 'fill-extrusion-color', pinColor(selected));
    const building = buildings.find((b) => b.id === selected);
    if (building) map.easeTo({ center: [building.coordinates[1], building.coordinates[0]], duration: 500 });
  }, [selected, ready, buildings]);

  // Anneau 3D : recalculé quand les volumes sont chargés (l'emprise vient de leurs tuiles).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const update = () => (map.getSource('selection') as GeoJSONSource).setData(selectionRing(map, selected, buildings));
    update();
    map.once('idle', update);
    return () => { map.off('idle', update); };
  }, [selected, is3d, ready, buildings]);

  useEffect(() => { if (active) mapRef.current?.resize(); }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of BLOCK_LAYERS) map.setLayoutProperty(id, 'visibility', is3d ? 'visible' : 'none');
    map.setPaintProperty('buildings', 'icon-opacity', symbolOpacity(is3d));
    map.setPaintProperty('selected-halo', 'circle-opacity', fadeOut(0.55, is3d));
    map.setPaintProperty('selected-halo', 'circle-stroke-opacity', fadeOut(1, is3d));
    map.easeTo({ pitch: is3d ? pitchForZoom(map.getZoom()) : 0, duration: 600 });
  }, [is3d, ready]);

  return <div className="map-wrap">
    <div ref={container} className="building-map" aria-label="Carte des bâtiments de la Ville de Genève" />
    <button className="map-recenter" onClick={() => mapRef.current?.fitBounds(bounds, { padding: 50, pitch: 0 })} title="Recentrer sur le parc" aria-label="Recentrer sur le parc"><LocateFixed size={18} /></button>
    <button className="map-recenter map-toggle-3d" onClick={() => setIs3d((v) => !v)} aria-pressed={is3d} title={is3d ? 'Rester en plan' : 'Volumes 3D en zoomant'} aria-label={is3d ? 'Rester en plan' : 'Volumes 3D en zoomant'}>{is3d ? <MapIcon size={18} /> : <Box size={18} />}</button>
    {blocksError && <div className="map-warning blocks" role="status"><AlertTriangle size={15} /> Volumes 3D indisponibles : <code>public/data/ville_geneve_3d.geojson</code> est introuvable (lancer <code>npm run data</code>). La carte 2D reste utilisable.</div>}
    {error && <div className="map-warning" role="status"><AlertTriangle size={15} /> Fond de carte swisstopo partiellement indisponible. Les points restent utilisables.</div>}
    {assessments.length === 0 && <div className="map-empty">Aucun bâtiment ne correspond aux filtres.</div>}
  </div>;
}
