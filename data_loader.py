"""Client for the QuantHome v2 API (Geneva hackathon)."""
import os
import time
from dataclasses import dataclass, field

import requests
from dotenv import load_dotenv


@dataclass
class QuantHomeClient:
    api_key: str | None = None
    base_url: str = "https://api.quanthome.com/v2"
    timeout: int = 30
    max_retries: int = 3
    session: requests.Session = field(init=False, repr=False)

    def __post_init__(self):
        load_dotenv()
        self.api_key = self.api_key or os.environ.get("API_KEY")
        if not self.api_key:
            raise RuntimeError("API_KEY missing: set it in .env or the environment.")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.api_key}"

    def query(self, endpoint: str, payload: dict) -> list:
        """POST to an endpoint; retries on 429 honouring Retry-After."""
        for attempt in range(self.max_retries + 1):
            r = self.session.post(f"{self.base_url}/{endpoint}", json=payload, timeout=self.timeout)
            if r.status_code == 429 and attempt < self.max_retries:
                time.sleep(float(r.headers.get("Retry-After", 2 ** attempt)))
                continue
            r.raise_for_status()
            return r.json()["values"] or []
        return []

    def _paged(self, endpoint: str, payload: dict, page_size: int, max_rows: int | None):
        rows = []
        while max_rows is None or len(rows) < max_rows:
            limit = page_size if max_rows is None else min(page_size, max_rows - len(rows))
            page = self.query(endpoint, {**payload, "limit": limit, "offset": len(rows)})
            rows.extend(page)
            if len(page) < limit:
                break
        return rows

    # --- catalogue ---------------------------------------------------------
    def metadata(self, pattern: str, page_size: int = 200, lang: str = "en") -> list[dict]:
        """All catalogue fields whose qualified_name matches the regex."""
        payload = {
            "filters": [{"field": "qualified_name", "type": "regex", "value": pattern}],
            "properties": ["qualified_name", "title", "type", "unit", "description"],
            "order_by": "qualified_name", "direction": "ASC", "lang": lang,
        }
        return self._paged("metadata", payload, page_size, None)

    # --- records -----------------------------------------------------------
    def filter(self, entity: str, fields: list, filters: list | None = None, group_by: list | None = None,
               order_by: str = "id", direction: str = "ASC", page_size: int = 500,
               max_rows: int | None = 1000) -> list[dict]:
        """Search `buildings` or `dwellings`; returns flat dicts (paged)."""
        payload = {"fields": fields, "filters": filters or [], "order_by": order_by,
                   "direction": direction, "explode": True, "lang": None}
        if group_by:
            payload["group_by"] = group_by
        return self._paged(f"{entity}/filter", payload, page_size, max_rows)

    def values(self, entity: str, ids: list, fields: list, date: str | None = None) -> list[dict]:
        """Latest (or dated) [date, value] cells for given IDs."""
        return self.query(f"{entity}/values", {"ids": ids, "fields": fields, "date": date,
                                               "lang": None, "as_dict": False})

    def history(self, entity: str, ids: list, fields: list, date_from: str, date_to: str) -> list[dict]:
        return self.query(f"{entity}/range", {"ids": ids, "fields": fields, "date_from": date_from,
                                              "date_to": date_to, "lang": None, "as_dict": False})

    def comparable(self, entity: str, ref_id, fields: list, criteria: list, limit: int = 10) -> list[dict]:
        return self.query(f"{entity}/comparable", {"id": ref_id, "fields": fields, "criteria": criteria,
                                                   "limit": limit, "lang": None, "explode": True})

    def buildings_by_owner(self, pattern: str = r"(?i)^ville de gen[eè]ve", fields: list | None = None) -> list[dict]:
        """Buildings with at least one owner name matching the regex (one row per building)."""
        rows = self.filter("buildings", fields or ["id", "official_egid", "official_address", "computed_owner_names"],
                           [{"field": "computed_owner_names", "type": "regex", "value": pattern}], max_rows=None)
        return list({r["id"]: r for r in rows}.values())  # explode yields one row per owner name


@dataclass
class SitgClient:
    """ArcGIS REST FeatureServer client for SITG open layers (vector.sitg.ge.ch)."""
    base_url: str = "https://vector.sitg.ge.ch/arcgis/rest/services"
    timeout: int = 60
    session: requests.Session = field(default_factory=requests.Session, repr=False)

    LAYERS = {
        "solar": "OCEN_SOLAIRE_BASE_BATIMENT",     # roof irradiation per building (polygons, Grand Genève)
        "idc": "OCEN_ETAT_IDC_PUBLIC",            # IDC status + last 3 values (points)
        "idc_history": "SCANE_INDICE_MOYENNES_3_ANS",  # yearly IDC + energy carriers (polygons)
    }

    def _url(self, layer: str) -> str:
        return f"{self.base_url}/{self.LAYERS.get(layer, layer)}/FeatureServer/0"

    def fields(self, layer: str) -> list[dict]:
        return self.session.get(self._url(layer), params={"f": "json"}, timeout=self.timeout).json()["fields"]

    def count(self, layer: str, where: str = "1=1") -> int:
        r = self.session.get(f"{self._url(layer)}/query", params={"where": where, "returnCountOnly": "true", "f": "json"},
                             timeout=self.timeout)
        return r.json()["count"]

    def query(self, layer: str, where: str = "1=1", out_fields: str = "*", geometry: bool = True,
              page_size: int = 2000, max_rows: int | None = None, extra: dict | None = None,
              out_sr: int = 4326) -> dict:
        """GeoJSON FeatureCollection in `out_sr` (4326 = WGS84, 2056 = LV95 metres).
        `extra`: filter parameters (e.g. a spatial filter), applied when selecting ids.
        Fetches matching OBJECTIDs first, then features by id batch (offset paging is unreliable on SITG)."""
        ids = sorted(self._post(layer, {"where": where, "returnIdsOnly": "true", "f": "json", **(extra or {})})
                     .get("objectIds") or [])[:max_rows]
        feats = []
        for i in range(0, len(ids), page_size):
            feats += self._post(layer, {"objectIds": ",".join(map(str, ids[i:i + page_size])), "outFields": out_fields,
                                        "returnGeometry": str(geometry).lower(), "outSR": out_sr, "f": "geojson"})["features"]
        return {"type": "FeatureCollection", "features": feats}

    def _post(self, layer: str, data: dict) -> dict:
        r = self.session.post(f"{self._url(layer)}/query", data=data, timeout=self.timeout)
        r.raise_for_status()
        out = r.json()
        if "error" in out:
            raise RuntimeError(out["error"])
        return out

    def public_owner_buildings(self, owner: str = "Ville de Genève", chunk: int = 200) -> dict:
        """Above-ground buildings standing on parcels whose land-registry public owner is `owner`
        (CAD_PARCELLE_MENSU.PROPRI_PUBLIQUE -> CAD_BATIMENT_HORSOL.EGRID_CENTROIDE). Land ownership:
        a building on a DDP (building right) may belong to someone else."""
        owner = owner.replace("'", "''")
        egrids = [f["properties"]["EGRID"] for f in self.query(
            "CAD_PARCELLE_MENSU", where=f"PROPRI_PUBLIQUE='{owner}'", out_fields="EGRID", geometry=False)["features"]]
        feats = []
        for i in range(0, len(egrids), chunk):
            ids = ",".join(f"'{e}'" for e in egrids[i:i + chunk])
            feats += self.query("CAD_BATIMENT_HORSOL", where=f"EGRID_CENTROIDE IN ({ids})")["features"]
        return {"type": "FeatureCollection", "features": feats}

    def by_egid(self, layer: str, egids: list[int], chunk: int = 500, **kw) -> dict:
        feats = []
        for i in range(0, len(egids), chunk):
            ids = ",".join(str(int(e)) for e in egids[i:i + chunk])
            feats += self.query(layer, where=f"EGID IN ({ids})", **kw)["features"]
        return {"type": "FeatureCollection", "features": feats}


@dataclass
class QBuildingsClient:
    """EPFL QBuildings PostgreSQL. `env`: "QBUILDINGS" (Geneva DB) or "QBUILDINGS_CH" (Switzerland DB).
    Geneva rows are building blocks: `egid` lists several EGIDs joined by '/'."""
    schema: str = "Processed"
    env: str = "QBUILDINGS"

    def __post_init__(self):
        import psycopg
        load_dotenv()
        e = {k: os.environ[f"{self.env}_{k}"] for k in ("HOST", "PORT", "DB", "USER", "PASSWORD")}
        self.conn = psycopg.connect(host=e["HOST"], port=e["PORT"], dbname=e["DB"], user=e["USER"],
                                    password=e["PASSWORD"], connect_timeout=20)

    def ids_3d(self, egids: list[int]) -> dict[int, list[str]]:
        """swissBUILDINGS3D ids per EGID (Switzerland DB, Aggregated.roofs). Roof rows carry block-level id lists;
        the ids common to all roofs of an EGID are kept (falls back to the smallest list)."""
        import re
        with self.conn.cursor() as cur:
            cur.execute('SELECT egid, "id_building3D" FROM "Aggregated".roofs WHERE egid = ANY(%s)', ([float(e) for e in egids],))
            lists: dict[int, list[set]] = {}
            for egid, raw in cur.fetchall():
                if ids := set(re.findall(r"\{[0-9A-Fa-f-]{36}\}", raw or "")):
                    lists.setdefault(int(egid), []).append(ids)
        return {e: sorted(set.intersection(*ls) or min(ls, key=len)) for e, ls in lists.items()}

    def blocks_for(self, egids: list[int], columns: list[str]) -> list[dict]:
        """One row per requested EGID found, with its block's columns plus `n_egids` in the block."""
        cols = ", ".join(f'b."{c}"' for c in columns)
        sql = (f"SELECT e AS egid, array_length(string_to_array(b.egid, '/'), 1) AS n_egids, {cols} "
               f'FROM "{self.schema}".buildings b, unnest(string_to_array(b.egid, \'/\')) e '
               f"WHERE string_to_array(b.egid, '/') && %s::text[]")
        wanted = [str(e) for e in egids]
        with self.conn.cursor() as cur:
            cur.execute(sql, (wanted,))
            names = [d.name for d in cur.description]
            rows = [dict(zip(names, r)) for r in cur.fetchall()]
        keep = set(wanted)
        return [{**r, "egid": int(r["egid"])} for r in rows if r["egid"] in keep]


if __name__ == "__main__":
    client = QuantHomeClient()
    for b in client.filter("buildings", ["id", "official_egid", "official_address"], max_rows=3):
        print(b)
