import { useEffect, useRef, useState } from 'react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { AlertTriangle, LocateFixed } from 'lucide-react';
import { COHORTS } from './model';
import type { Assessment, Building } from './model';

const cityBounds = latLngBounds([46.177, 6.101], [46.239, 6.189]);

function Camera({ selected }: { selected: Building | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.panTo(selected.coordinates, { animate: true });
  }, [map, selected]);
  return <button className="map-recenter" onClick={() => map.fitBounds(cityBounds)} title="Recentrer sur Genève" aria-label="Recentrer sur Genève"><LocateFixed size={18} /></button>;
}

interface Props {
  assessments: Assessment[];
  programIds: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function BuildingMap({ assessments, programIds, selected, onSelect }: Props) {
  const [tileError, setTileError] = useState(false);
  const reported = useRef(false);
  const selectedBuilding = assessments.find((item) => item.building.id === selected)?.building;
  return (
    <div className="map-wrap">
      <MapContainer bounds={cityBounds} scrollWheelZoom={false} className="building-map" aria-label="Carte des bâtiments fictifs de Genève">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={{
            tileerror: () => {
              setTileError(true);
              if (!reported.current) {
                console.warn('Fond OpenStreetMap indisponible : les bâtiments et la liste restent accessibles.');
                reported.current = true;
              }
            },
          }}
        />
        {assessments.map((item) => {
          const highlighted = selected === item.building.id;
          const active = programIds.has(item.building.id);
          const icon = divIcon({
            className: 'building-marker',
            html: `<span class="map-dot ${highlighted ? 'selected' : ''} ${active ? '' : 'muted'}" style="--marker-color:${COHORTS[item.cohort].color}"></span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          return (
            <Marker
              key={item.building.id}
              position={item.building.coordinates}
              icon={icon}
              title={`${item.building.name} — ${COHORTS[item.cohort].label}`}
              alt={`${item.building.name} — ${COHORTS[item.cohort].label}`}
              eventHandlers={{ click: () => onSelect(item.building.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <strong>{item.building.name}</strong><br />{item.building.district} · {COHORTS[item.cohort].short}
              </Tooltip>
            </Marker>
          );
        })}
        <Camera selected={selectedBuilding} />
      </MapContainer>
      <div className="map-caption"><span className="live-dot" /> GENÈVE · PARC MUNICIPAL FICTIF</div>
      {tileError && <div className="map-warning" role="status"><AlertTriangle size={15} /> Fond de carte partiellement indisponible. Les points et la liste restent utilisables.</div>}
      {assessments.length === 0 && <div className="map-empty">Aucun bâtiment ne correspond aux filtres.</div>}
    </div>
  );
}
