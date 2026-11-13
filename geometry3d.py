"""Per-building 3D model payload: extruded footprint + real roof planes, in local metres.

Same payload as reho-fm's `BuildingGeometry.model3d` (app/services/geometry.py), so its Three.js
renderer (static/common/building3d.js) can draw it unchanged. Roof planes here come from SITG
OCEN_SOLAIRE_ID_SURFACE_BASE instead of QBuildings/Sonnendach.

Conventions of the output (those expected by building3d.js):
- coordinates: metres relative to the footprint centroid (LV95), +x east, +y north;
- plane `ring`: flat (projected) outline, raised client-side along `tilt`;
- plane `azimuth`: degrees from SOUTH, positive clockwise (0 = S, +90 = W). SITG gives a compass
  bearing (0 = N, clockwise), converted with `bearing - 180`.
"""
import math
from dataclasses import dataclass

from shapely.geometry import Polygon


@dataclass
class RoofSurface:
    """One SITG roof surface (LV95 outline)."""
    polygon: Polygon
    tilt: float          # °
    bearing: float       # ° compass, 0 = N, clockwise
    irr: float           # kWh/m²/y, mean annual irradiation
    area: float          # m², true (tilted) area


@dataclass
class Model3DBuilder:
    simplify_m: float = 0.4     # outline simplification tolerance
    max_points: int = 400       # vertex cap per ring
    min_plane_m2: float = 2.0   # drop slivers
    max_planes: int = 60        # largest planes kept
    ridge_snap_m: float = 0.75  # two plane corners closer than this are a shared ridge vertex

    def build(self, footprint: Polygon, surfaces: list[RoofSurface], height_m: float | None,
              base_altitude: float | None) -> dict | None:
        footprint = self._simplify(_largest(footprint))
        if footprint is None:
            return None
        c = footprint.centroid
        outline = self._local(footprint, c.x, c.y)
        planes = []
        for s in surfaces:
            for poly in getattr(s.polygon, "geoms", [s.polygon]):
                poly = self._simplify(poly)
                if poly is None or poly.area < self.min_plane_m2:
                    continue
                az = (s.bearing - 180 + 180) % 360 - 180  # bearing → from south, in [-180, 180)
                planes.append({"ring": self._local(poly, c.x, c.y), "tilt": round(s.tilt), "azimuth": round(az),
                               "area_solar_m2": round(s.area, 1), "irr": round(s.irr)})
        planes.sort(key=lambda p: (-p["area_solar_m2"], p["azimuth"], p["tilt"]))
        planes = planes[:self.max_planes]
        self._solve_plane_offsets(planes)
        return {"outline": outline, "height_m": round(height_m or 0, 2), "base_altitude": base_altitude,
                "planes": planes, "origin": {"e": round(c.x, 2), "n": round(c.y, 2)}}

    # ── helpers ────────────────────────────────────────────────────────────
    def _simplify(self, poly: Polygon) -> Polygon | None:
        q = poly.simplify(self.simplify_m, preserve_topology=True)
        q = poly if q.is_empty or len(q.exterior.coords) < 4 else q
        return q if len(q.exterior.coords) >= 4 else None

    def _local(self, poly: Polygon, ox: float, oy: float) -> list[list[float]]:
        ring = [[round(x - ox, 2), round(y - oy, 2)] for x, y in list(poly.exterior.coords)[:-1]]
        return ring[::len(ring) // self.max_points + 1] if len(ring) > self.max_points else ring

    @staticmethod
    def _plane_frame(plane):
        a = math.radians(plane["azimuth"])
        dx, dy = -math.sin(a), -math.cos(a)
        projs = [p[0] * dx + p[1] * dy for p in plane["ring"]]
        return (dx, dy), max(projs), math.tan(math.radians(plane["tilt"]))

    def _solve_plane_offsets(self, planes: list[dict]) -> None:
        """Vertical offset `dz` per plane so that planes sharing a ridge meet there (ported from reho-fm).
        Surfaces carry no elevation; without this, stepped roofs would all sit at one eaves height."""
        n = len(planes)
        if n <= 1:
            for p in planes:
                p["dz"] = 0.0
            return
        frames = [self._plane_frame(p) for p in planes]

        def z_rel(k, pt):
            (dx, dy), hi, slope = frames[k]
            return (hi - (pt[0] * dx + pt[1] * dy)) * slope

        constraints = []
        for i in range(n):
            for j in range(i + 1, n):
                shared = [p for p in planes[i]["ring"]
                          if any(math.hypot(p[0] - q[0], p[1] - q[1]) < self.ridge_snap_m for q in planes[j]["ring"])]
                if len(shared) >= 2:
                    constraints.append((i, j, sum(z_rel(j, p) - z_rel(i, p) for p in shared) / len(shared), len(shared)))
        offsets = [0.0] * n
        for _ in range(200 if constraints else 0):
            num, den = [0.0] * n, [0.0] * n
            for i, j, delta, w in constraints:
                num[i] += (offsets[j] + delta) * w
                den[i] += w
                num[j] += (offsets[i] - delta) * w
                den[j] += w
            for k in range(n):
                if den[k]:
                    offsets[k] = 0.7 * offsets[k] + 0.3 * num[k] / den[k]
        base = min(offsets)
        for k in range(n):
            planes[k]["dz"] = round(offsets[k] - base, 2)


def _largest(geom) -> Polygon:
    return max(getattr(geom, "geoms", [geom]), key=lambda g: g.area)
