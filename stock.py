"""Building stock owned by a public body (default: Ville de Genève).

Reference list = SITG land registry: buildings on parcels owned by `owner`, excluding buildings under a
third-party DDP and unheated buildings. Enriched with SITG, QuantHome and QBuildings. QuantHome ownership is never used.
"""
import json
import re
import time
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

from shapely.geometry import shape
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree

from data_loader import QBuildingsClient, QuantHomeClient, SitgClient


class Provenance(StrEnum):
    """Data provider."""
    SITG = "SITG"
    QUANTHOME = "QuantHome"
    QBUILDINGS = "QBuildings"
    COMPUTED = "Computed"    # derived in this code from other attributes


class Method(StrEnum):
    """How the value was obtained."""
    MEASURED = "measured"    # metered (e.g. IDC from consumption)
    DECLARED = "declared"    # official register / declaration
    ESTIMATED = "estimated"  # model or computed

    @property
    def rank(self) -> int:   # higher = more reliable
        return {"measured": 3, "declared": 2, "estimated": 1}[self.value]


class Category(StrEnum):
    BASIC = "basic info"
    ENERGY = "energy"
    VALUE = "value"
    CONSTRUCTION = "construction"
    GEOMETRY_3D = "3d (optional)"


@dataclass(frozen=True)
class AttributeSpec:
    label: str
    unit: str | None
    category: Category


B, E, V, C, G = Category.BASIC, Category.ENERGY, Category.VALUE, Category.CONSTRUCTION, Category.GEOMETRY_3D
ATTRIBUTES: dict[str, AttributeSpec] = {
    "owner": AttributeSpec("Owner", None, B),
    "address": AttributeSpec("Official address", None, B),
    "usage": AttributeSpec("Usage group", None, B),
    "destination": AttributeSpec("Usage (SITG destination)", None, B),
    "construction_period": AttributeSpec("Construction period", None, B),
    "construction_year": AttributeSpec("Construction year", None, B),
    "protection": AttributeSpec("Heritage protection", None, B),
    "sre": AttributeSpec("Energy reference area (SRE)", "m2", E),
    "idc": AttributeSpec("IDC (heating + hot water)", "MJ/m2/y", E),
    "idc_status": AttributeSpec("IDC declaration status", None, E),
    "co2_scope1": AttributeSpec("CO₂ scope 1", "kgCO2/m2/y", E),
    "heating": AttributeSpec("Heating system", None, E),
    "hot_water": AttributeSpec("Hot-water system", None, E),
    "cad_connected": AttributeSpec("Connected to district heating", None, E),
    "cad_in_street": AttributeSpec("District heating in street", None, E),
    "solar_profile": AttributeSpec("Roof irradiation profile", None, E),
    "solar_share_above_1000": AttributeSpec("Roof share > 1000 kWh/m²·yr", None, E),
    "pv_area": AttributeSpec("PV potential, module area", "m2", E),
    "pv_power": AttributeSpec("PV potential, peak power", "kWp", E),
    "pv_yield": AttributeSpec("PV potential, yearly production", "kWh/y", E),
    "pv_co2_avoided": AttributeSpec("PV potential, CO2 avoided", "kgCO2/y", E),
    "rent_residential": AttributeSpec("Residential net rent", "CHF/y", V),
    "rent_commercial": AttributeSpec("Commercial net rent", "CHF/y", V),
    "market_value": AttributeSpec("Market value", "CHF", V),
    "retrofit_cost_ratio": AttributeSpec("Retrofit cost / market value", None, V),
    "value_uplift": AttributeSpec("Value increase after renovation", None, V),
    "pv_investment": AttributeSpec("PV investment", "CHF", V),
    "pv_subsidy": AttributeSpec("PV subsidy", "CHF", V),
    "pv_annual_gain": AttributeSpec("PV yearly gain", "CHF/y", V),
    "pv_irr": AttributeSpec("PV internal rate of return", "%", V),
    "permits": AttributeSpec("Building permits", None, C),
    "last_energy_permit": AttributeSpec("Last energy-related permit", None, C),
    "height": AttributeSpec("Height (ground to roof top)", "m", G),
}


@dataclass
class Attribute:
    name: str
    value: Any
    provenance: Provenance      # data provider
    method: Method              # measured / declared / estimated
    comment: str | None = None  # dataset/field and how it was derived

    @property
    def spec(self) -> AttributeSpec:
        return ATTRIBUTES[self.name]

    @property
    def unit(self) -> str | None:
        return self.spec.unit

    @property
    def category(self) -> Category:
        return self.spec.category


@dataclass
class SolarProfile:
    roof_share_by_band: dict[str, float]      # share of roof area per irradiation band (kWh/m²·yr)
    irradiation_by_band: dict[str, float]     # mean irradiation of each band (kWh/m²·yr)
    monthly_share: list[float]                # Jan..Dec share of yearly irradiation

    @property
    def share_above_1000(self) -> float:
        return sum(v or 0 for k, v in self.roof_share_by_band.items() if int(k.split("_")[0]) >= 10)


@dataclass
class Permit:
    id: str
    date: str | None
    status: str
    kind: str
    description: str
    tags: list[str]
    url: str

    @property
    def is_energy(self) -> bool:
        return bool({"envelope", "heating", "solar"} & set(self.tags))


@dataclass
class Building:
    egid: int
    parcel_egrid: str
    geometry: dict = field(repr=False)
    qh_id: int | None = None
    attrs: dict[str, Attribute] = field(default_factory=dict)

    def set(self, name: str, value, method: Method, source: str, comment: str | None = None) -> None:
        """`source` = "<provider> <dataset/field>", e.g. "SITG OCEN_ETAT_IDC_PUBLIC"."""
        assert name in ATTRIBUTES, name
        provider, _, dataset = source.partition(" ")
        self.attrs[name] = Attribute(name, value, Provenance(provider), method,
                                     "; ".join(x for x in (dataset, comment) if x) or None)

    def fill(self, name: str, value, method: Method, source: str, comment: str | None = None) -> None:
        """Set if missing, or if `method` outranks the current one (measured > declared > estimated).
        On equal rank the first value is kept, so call order = source preference."""
        cur = self.attrs.get(name)
        if value not in (None, "", []) and (cur is None or cur.value in (None, "", []) or method.rank > cur.method.rank):
            self.set(name, value, method, source, comment)

    def get(self, name: str) -> Attribute | None:
        return self.attrs.get(name)

    def value(self, name: str):
        a = self.attrs.get(name)
        return a.value if a else None

    @property
    def energy_permits(self) -> list[Permit]:
        return [p for p in self.value("permits") or [] if p.is_energy]

    def to_record(self) -> dict:
        """Flat dict per attribute: <name>, <name>_provenance, <name>_method, <name>_comment."""
        rec = {"egid": self.egid, "qh_id": self.qh_id, "parcel_egrid": self.parcel_egrid}
        for name in ATTRIBUTES:
            a = self.attrs.get(name)
            v = a.value if a else None
            if name == "permits":
                v = [p.__dict__ for p in v] if v else []
            elif name == "solar_profile" and v:
                v = v.__dict__
            rec |= {name: v, f"{name}_provenance": str(a.provenance) if a else None,
                    f"{name}_method": str(a.method) if a else None, f"{name}_comment": a.comment if a else None}
        return rec


class CityStock:
    UNHEATED = {"Serre", "Dépôt", "Hangar", "WC public", "Poulailler", "Déchetterie", "Silo", "Garage", "Réservoir",
                "Station-service", "Installation de climatisation", "Instal. tech. élec. SIG", "Instal. tech. eau SIG",
                "Instal. tech. gaz SIG", "Instal. tech. eau", "Bât. électricité SIG", "Bâtiment gaz SIG",
                "Bâtiment eau", "Bâtiment électricité"}
    USAGE = {
        "Residential": ["Hab plusieurs logements", "Habitation un logement", "Hab. deux logements",
                        "Résidence meublée", "Foyer", "Autre héberg. collectif"],
        "Mixed residential": ["Hab. - rez activités", "Habitation - activités"],
        "Education": ["Ecole primaire", "Autre école", "Ecole privée", "Jardin d'enfants", "Université"],
        "Culture & leisure": ["Musée", "Salle de spectacle", "Théâtre", "Bibliothèque", "Chapelle",
                              "Autre lieu de culte", "Salle communale", "Centre de loisirs", "Autre bât. de loisirs"],
        "Sport": ["Salle de sport", "Centre sportif", "Piscine", "Patinoire", "Stade", "Stand de tir"],
        "Administration & services": ["Bureaux", "Administrations publiques", "Sécurité civile", "Service du feu",
                                      "Voirie-entretien", "Bureaux des OIG", "Mission permanente", "Consulat",
                                      "Douane", "Autre équipement collectif"],
        "Commercial": ["Commerce", "Restaurant", "Atelier", "Hôtel", "Autre bât. d'activités"],
        "Health & social": ["EMS", "Etablissement de soins"],
    }
    EF_SCOPE1 = {"gaz": 0.198, "mazout": 0.265}  # kgCO2/kWh final energy, direct combustion
    PERMIT_TAGS = {
        "envelope": r"isol|assainissement|enveloppe|fa[cç]ade|toiture|fen[eê]tre|menuiserie|vitrage",
        "heating": r"chauff|chaudi[eè]re|pompe [àa] chaleur|\bpac\b|\bcad\b|distance|g[ée]othermi",
        "solar": r"solaire|photovolta|panneaux",
        "renovation": r"r[ée]nov|transform|r[ée]habilit",
    }
    QH_FIELDS = ["official_address", "official_construction_date", "official_construction_period",
                 "official_heated_area", "computed_heated_area", "official_co2_scope_1_per_m2",
                 "official_energy_source_heating_1", "official_energy_generator_heating_1",
                 "official_energy_source_water_1", "official_energy_generator_water_1",
                 "computed_cad_is_in_street", "estimated_residential_net_rent", "estimated_commercial_net_rent",
                 "estimated_market_value", "estimated_eco_retrofit_ratio",
                 "official_energy_intensity", "estimated_energy_intensity"]
    QB_COLUMNS = ["energy_heating_signature_kWh_y", "energy_hotwater_signature_kWh_y", "area_era_m2"]

    def __init__(self, owner: str = "Ville de Genève", cache_dir: str = "data/cache", permits_since: int = 2010,
                 with_3d: bool = False):
        self.owner, self.permits_since, self.with_3d = owner, permits_since, with_3d
        self.cache = Path(cache_dir)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.sitg = SitgClient()
        self._qh: QuantHomeClient | None = None
        self.buildings: dict[int, Building] = {}
        self.log: dict[str, int] = {}

    @property
    def qh(self) -> QuantHomeClient:
        self._qh = self._qh or QuantHomeClient(timeout=180, max_retries=6)
        return self._qh

    def _cached(self, name: str, fn, refresh: bool):
        path = self.cache / f"{re.sub(r'\W+', '_', self.owner)}_{name}.json"
        if path.exists() and not refresh:
            return json.loads(path.read_text())
        data = fn()
        path.write_text(json.dumps(data, ensure_ascii=False))
        return data

    def _cached_optional(self, name: str, fn, refresh: bool, env: str, default):
        """Like `_cached` for QBuildings: skipped (default returned, nothing cached) when its
        credentials are missing from .env or the database is unreachable."""
        path = self.cache / f"{re.sub(r'\W+', '_', self.owner)}_{name}.json"
        if path.exists() and not refresh:
            return json.loads(path.read_text())
        if not QBuildingsClient.configured(env):
            print(f"[data] {env}_* credentials not in .env: skipping QBuildings ({name})")
            return default
        try:
            return self._cached(name, fn, refresh=True)
        except Exception as exc:  # unreachable DB, auth error…
            print(f"[data] QBuildings unavailable ({type(exc).__name__}): skipping {name}")
            return default

    # ------------------------------------------------------------------ build
    def build(self, refresh: bool = False) -> list[Building]:
        self._core(refresh)
        self._enrich_sitg(refresh)
        self._enrich_permits(refresh)
        self._enrich_quanthome(refresh)
        self._enrich_qbuildings(refresh)
        if self.with_3d:
            self._enrich_3d(refresh)
        self._derive()
        return list(self.buildings.values())

    def _core(self, refresh):
        owner = self.owner.replace("'", "''")
        parcels = self._cached("parcels", lambda: self.sitg.query(
            "CAD_PARCELLE_MENSU", where=f"PROPRI_PUBLIQUE='{owner}'", out_fields="EGRID")["features"], refresh)
        self._parcels = {p["properties"]["EGRID"]: shape(p["geometry"]) for p in parcels}
        ddp = self._cached("ddp", lambda: self.sitg.query("CAD_DDP", out_fields="EGRID")["features"], refresh)
        ddp_tree = STRtree([shape(d["geometry"]) for d in ddp if d["geometry"]])

        def fetch_buildings():
            egrids, out = list(self._parcels), []
            for i in range(0, len(egrids), 200):
                ids = ",".join(f"'{e}'" for e in egrids[i:i + 200])
                out += self.sitg.query("CAD_BATIMENT_HORSOL", where=f"EGRID_CENTROIDE IN ({ids})",
                                       out_fields="EGID,EGRID_CENTROIDE,DESTINATION,NOMEN_CLASSE,EPOQUE_CONSTRUCTION")["features"]
            return out
        feats = self._cached("buildings", fetch_buildings, refresh)
        self.log = {"on_owner_land": len(feats), "dropped_ddp": 0, "dropped_unheated": 0}
        D, src = Method.DECLARED, "SITG CAD_BATIMENT_HORSOL"
        for f in feats:
            p, geom = f["properties"], shape(f["geometry"])
            if ddp_tree.query(geom.centroid, predicate="within").size:
                self.log["dropped_ddp"] += 1
                continue
            if p["NOMEN_CLASSE"] == "Autre bâtiment" or p["DESTINATION"] in self.UNHEATED:
                self.log["dropped_unheated"] += 1
                continue
            if not p["EGID"]:
                continue
            b = Building(egid=int(p["EGID"]), parcel_egrid=p["EGRID_CENTROIDE"], geometry=f["geometry"])
            b.set("owner", self.owner, D, "SITG CAD_PARCELLE_MENSU", "PROPRI_PUBLIQUE of parcel under building centroid")
            b.fill("destination", p["DESTINATION"], D, src)
            if p["DESTINATION"]:
                b.set("usage", self._usage_group(p["DESTINATION"]), D, src, "destination grouped (CityStock.USAGE)")
            b.fill("construction_period", (p["EPOQUE_CONSTRUCTION"] or "").replace("Période ", ""), D, src)
            self.buildings[b.egid] = b
        self.log["core"] = len(self.buildings)

    def _usage_group(self, dest: str) -> str:
        return next((g for g, ds in self.USAGE.items() if dest in ds), "Other")

    def _enrich_sitg(self, refresh):
        egids, M, D, E = list(self.buildings), Method.MEASURED, Method.DECLARED, Method.ESTIMATED
        src = "SITG OCEN_ETAT_IDC_PUBLIC"
        for f in self._cached("idc", lambda: self.sitg.by_egid("idc", egids, geometry=False)["features"], refresh):
            p = f["properties"]
            if not (b := self.buildings.get(int(p["EGID"]))):
                continue
            b.fill("idc_status", p["ETAT_IDC_GEN"], D, src)
            if p["MOYENNE_3ANS"]:
                b.fill("idc", p["MOYENNE_3ANS"], M, src, "3-year mean of metered heating + hot water")
            else:
                b.fill("idc", p["DERNIER_IDC"], M, src, f"metered heating + hot water, {p['ANNEE_DERNIER_IDC']}")
            b.fill("sre", p["SRE_M2"], D, src)

        hist = self._cached("idc_history", lambda: self.sitg.by_egid(
            "idc_history", egids, geometry=False, out_fields="EGID,ANNEE,INDICE,INDICE_MOY3")["features"], refresh)
        latest: dict[int, dict] = {}
        for f in hist:
            p = f["properties"]
            if (p["INDICE_MOY3"] or p["INDICE"]) and p["ANNEE"] >= latest.get(int(p["EGID"]), {}).get("ANNEE", 0):
                latest[int(p["EGID"])] = p
        for egid, p in latest.items():
            if b := self.buildings.get(egid):
                b.fill("idc", p["INDICE_MOY3"] or p["INDICE"], D, "SITG SCANE_INDICE_MOYENNES_3_ANS",
                      f"latest yearly declaration ({p['ANNEE']})")

        bands = ["0_8", "8_9", "9_10", "10_11", "11_12", "12_13", "13_14", "14_20"]
        src = "SITG OCEN_SOLAIRE_BASE_BATIMENT"
        for f in self._cached("solar", lambda: self.sitg.by_egid("solar", egids, geometry=False)["features"], refresh):
            p = f["properties"]
            if not (b := self.buildings.get(int(p["EGID"]))):
                continue
            prof = SolarProfile({k: p[f"FIELD_{k}"] for k in bands}, {k: p[f"I_{k}"] for k in bands},
                                [p[f"IR_{m}"] for m in range(1, 13)])
            b.set("solar_profile", prof, E, src, "cantonal roof irradiation model")
            b.set("solar_share_above_1000", round(prof.share_above_1000, 3), E, src, "sum of bands ≥ 1000 kWh/m²·yr")
            b.fill("sre", round(p["SRE"], 1) if p["SRE"] else None, E, src, "cantonal model")

        heat = self._cached("heat", lambda: self.sitg.by_egid("OCEN_INSTAL_PROD_CHALEUR_PUB", egids,
                                                                geometry=False)["features"], refresh)
        inst: dict[int, list[dict]] = {}
        for f in heat:
            inst.setdefault(int(f["properties"]["EGID"]), []).append(f["properties"])
        src = "SITG OCEN_INSTAL_PROD_CHALEUR_PUB"
        for egid, rows in inst.items():
            if not (b := self.buildings.get(egid)):
                continue
            def pick(use):
                sel = [r for r in rows if use in r["USAGE"]] or [r for r in rows if "N.P." in r["USAGE"]]
                return " + ".join(sorted({f"{r['TYPE_INSTALLATION']} ({r['SOURCE_ENERGIE']})" for r in sel})) or None
            b.fill("heating", pick("Chauffage"), D, src)
            b.fill("hot_water", pick("ECS"), D, src)
            b.set("cad_connected", any("CAD" in r["TYPE_INSTALLATION"] for r in rows), D, src,
                  "installation type = CAD heat exchanger")

        pv = self._cached("pv", lambda: self.sitg.by_egid("OCEN_SOLAIRE_PV_BATIMENT", egids, geometry=False)["features"],
                          refresh)
        src, cm = "SITG OCEN_SOLAIRE_PV_BATIMENT", "cantonal PV model, economically sized installation"
        for f in pv:
            p = f["properties"]
            if not (b := self.buildings.get(int(p["EGID"]))):
                continue
            for attr, k in (("pv_area", "M2_PV"), ("pv_power", "P_KWC"), ("pv_yield", "PV_AN_KWH"),
                            ("pv_co2_avoided", "CO2"), ("pv_investment", "INVEST"), ("pv_subsidy", "SUB_AC"),
                            ("pv_annual_gain", "GAINS_AN"), ("pv_irr", "TRI")):
                b.fill(attr, round(p[k], 2) if isinstance(p[k], float) else p[k], E, src, f"{k}; {cm}")

        for layer, level in (("DPS_CLASSEMENT", "classé"), ("DPS_INVENTAIRE", "inventaire")):
            polys = self._cached(layer.lower(), lambda l=layer: self.sitg.query(l, out_fields="NOM")["features"], refresh)
            tree = STRtree([shape(p["geometry"]) for p in polys if p["geometry"]])
            for b in self.buildings.values():
                if not b.get("protection") and tree.query(shape(b.geometry).centroid, predicate="within").size:
                    b.set("protection", level, D, f"SITG {layer}", "building centroid within protected object")
        for b in self.buildings.values():
            if not b.get("protection"):
                b.set("protection", "none", D, "SITG DPS_CLASSEMENT/DPS_INVENTAIRE", "not within a protected object")

    def _enrich_permits(self, refresh):
        parcels = {b.parcel_egrid for b in self.buildings.values()}
        geoms = {e: g for e, g in self._parcels.items() if e in parcels}

        def fetch():
            keys, out = list(geoms), []
            for i in range(0, len(keys), 80):
                rings = []
                for g in (geoms[k] for k in keys[i:i + 80]):
                    for poly in getattr(g, "geoms", [g]):  # Esri: clockwise = outer ring
                        rings.append([list(c) for c in orient(poly, sign=-1.0).exterior.coords])
                out += self.sitg.query("SIT_AUTOR_DOSSIER", where=f"DATE_DEPOT >= DATE '{self.permits_since}-01-01'",
                                       extra={"geometry": json.dumps({"rings": rings, "spatialReference": {"wkid": 4326}}),
                                              "geometryType": "esriGeometryPolygon", "inSR": 4326,
                                              "spatialRel": "esriSpatialRelIntersects"})["features"]
            return out
        feats = self._cached(f"permits_{self.permits_since}", fetch, refresh)
        keys = list(geoms)
        tree = STRtree([geoms[k] for k in keys])
        by_parcel: dict[str, list[Permit]] = {}
        for f in feats:
            if not f["geometry"]:
                continue
            p = f["properties"]
            desc = p["DESCRIPTION"] or ""
            tags = [t for t, rx in self.PERMIT_TAGS.items() if re.search(rx, desc, re.I)]
            date = time.strftime("%Y-%m-%d", time.gmtime(p["DATE_DEPOT"] / 1000)) if p["DATE_DEPOT"] else None
            permit = Permit(p["ID_DOSSIER"], date, p["STATUT"], p["NOM_DOSSIER"], desc, tags, p["LIEN_SAD"])
            for i in tree.query(shape(f["geometry"]), predicate="intersects"):
                by_parcel.setdefault(keys[i], []).append(permit)
        src, method = "SITG SIT_AUTOR_DOSSIER", f"permits filed since {self.permits_since} on the building's parcel"
        for b in self.buildings.values():
            permits = sorted(by_parcel.get(b.parcel_egrid, []), key=lambda p: p.date or "")
            b.set("permits", permits, Method.DECLARED, src, method + "; tags by keywords in description")
            b.fill("last_energy_permit", max((p.date for p in b.energy_permits if p.date), default=None),
                   Method.DECLARED, src, "latest permit tagged envelope / heating / solar")

    def _enrich_quanthome(self, refresh):
        egids = list(self.buildings)

        def fetch():
            idmap = []
            for i in range(0, len(egids), 300):
                idmap += self.qh.filter("buildings", ["id", "official_egid"],
                                        [{"field": "official_egid", "type": "list", "value": egids[i:i + 300]}],
                                        max_rows=None)
                time.sleep(2)
            ids, vals = [r["id"] for r in idmap], []
            for i in range(0, len(ids), 50):
                vals += self.qh.query("buildings/values", {"ids": ids[i:i + 50], "fields": self.QH_FIELDS,
                                                           None: None, "lang": "fr", "as_dict": False})
                time.sleep(3)
            egid_of = {r["id"]: r["official_egid"] for r in idmap}
            return [{**v, "official_egid": egid_of[v["id"]]} for v in vals]
        rows = self._cached("quanthome", fetch, refresh)

        def val(r, k):
            cell = r.get(k)
            return cell[1] if isinstance(cell, list) and cell[1] not in (None, "", []) else None
        D, E = Method.DECLARED, Method.ESTIMATED
        q = lambda k: f"QuantHome {k}"
        for r in rows:
            if not (b := self.buildings.get(r["official_egid"])):
                continue
            b.qh_id = r["id"]
            b.fill("address", val(r, "official_address"), D, q("official_address"))
            if (v := val(r, "official_construction_date")):
                b.fill("construction_year", int(str(v)[:4]), D, q("official_construction_date"))
            b.fill("construction_period", val(r, "official_construction_period"), D, q("official_construction_period"))
            b.fill("sre", val(r, "official_heated_area"), D, q("official_heated_area"))
            b.fill("sre", val(r, "computed_heated_area"), E, q("computed_heated_area"), "ground area × floors")
            if (v := val(r, "official_energy_intensity")):
                b.fill("idc", round(v * 3.6, 1), D, q("official_energy_intensity"), "older SITG IDC, kWh→MJ")
            if (v := val(r, "estimated_energy_intensity")):
                b.fill("idc", round(v * 3.6, 1), E, q("estimated_energy_intensity"),
                       "QuantHome ML model, kWh→MJ (median +16% vs measured)")
            b.fill("co2_scope1", val(r, "official_co2_scope_1_per_m2"), D, q("official_co2_scope_1_per_m2"))
            for attr, src_f, gen_f in (("heating", "official_energy_source_heating_1", "official_energy_generator_heating_1"),
                                       ("hot_water", "official_energy_source_water_1", "official_energy_generator_water_1")):
                if (s := val(r, src_f)):
                    g = val(r, gen_f)
                    b.fill(attr, f"{g} ({s})" if g else s, D, q(src_f), "federal building register (RegBL)")
            if (s := val(r, "official_energy_source_heating_1")) and not b.get("cad_connected"):
                b.set("cad_connected", "distance" in s.lower(), D, q("official_energy_source_heating_1"),
                      "heating source = district heating")
            b.fill("cad_in_street", val(r, "computed_cad_is_in_street"), E, q("computed_cad_is_in_street"),
                   "a building in the same street is connected")
            for attr, k in (("rent_residential", "estimated_residential_net_rent"),
                            ("rent_commercial", "estimated_commercial_net_rent"),
                            ("market_value", "estimated_market_value"),
                            ("retrofit_cost_ratio", "estimated_eco_retrofit_ratio")):
                b.fill(attr, val(r, k), E, q(k), "QuantHome model")

    def _enrich_qbuildings(self, refresh):
        egids = list(self.buildings)
        rows = self._cached_optional("qbuildings", lambda: QBuildingsClient().blocks_for(egids, self.QB_COLUMNS),
                                     refresh, "QBUILDINGS", [])
        for r in rows:
            h, w, era = (r[c] for c in self.QB_COLUMNS)
            if (b := self.buildings.get(r["egid"])) and h is not None and era:
                b.fill("idc", round((h + (w or 0)) / era * 3.6, 1), Method.ESTIMATED,
                       "QBuildings Processed.buildings",
                       f"(heating + hot-water signature) / ERA of block of {r['n_egids']} EGID(s), kWh→MJ "
                       "(median −11% vs measured)")

    def _enrich_3d(self, refresh):
        """Building height for the map extrusion (SITG 3D model, then cadastral fallbacks)."""
        egids = list(self.buildings)
        base = self._cached("bati3d_base", lambda: self.sitg.by_egid(
            "CAD_BATI3D_BASE", egids, geometry=False, out_fields="EGID,ALTITUDE_REF")["features"], refresh)
        roof = self._cached("bati3d_roof", lambda: self.sitg.by_egid(
            "CAD_BATI3D_BASIC_TOIT", egids, geometry=False, out_fields="EGID,ALTITUDE_MAX")["features"], refresh)
        ref = {int(f["properties"]["EGID"]): f["properties"]["ALTITUDE_REF"] for f in base}
        top: dict[int, float] = {}
        for f in roof:
            e, z = int(f["properties"]["EGID"]), f["properties"]["ALTITUDE_MAX"]
            top[e] = max(top.get(e, z), z)
        D = Method.DECLARED
        for egid, b in self.buildings.items():
            if (z0 := ref.get(egid)) is not None and (z1 := top.get(egid)) is not None:
                b.set("height", round(z1 - z0, 2), D, "SITG CAD_BATI3D_BASIC_TOIT",
                      "ALTITUDE_MAX − ALTITUDE_REF of CAD_BATI3D_BASE")
        # Height fallback: cadastral height > storeys × 2.8 m > one storey
        cad = self._cached("heights_cad", lambda: self.sitg.by_egid(
            "CAD_BATIMENT_HORSOL", egids, geometry=False, out_fields="EGID,HAUTEUR,NIVEAUX_HORSOL")["features"], refresh)
        cad_by = {int(f["properties"]["EGID"]): f["properties"] for f in cad}
        for egid, b in self.buildings.items():
            p = cad_by.get(egid, {})
            b.fill("height", p.get("HAUTEUR"), D, "SITG CAD_BATIMENT_HORSOL", "HAUTEUR (cadastral height)")
            if p.get("NIVEAUX_HORSOL"):
                b.fill("height", round(p["NIVEAUX_HORSOL"] * 2.8, 2), Method.ESTIMATED, "SITG CAD_BATIMENT_HORSOL",
                       f"NIVEAUX_HORSOL ({p['NIVEAUX_HORSOL']}) × 2.8 m")
            b.fill("height", 2.8, Method.ESTIMATED, "Computed", "default: one storey × 2.8 m")

    def _derive(self):
        """CO2 scope 1 fallback: IDC × direct emission factor of the main fuel."""
        for b in self.buildings.values():
            if b.get("co2_scope1") or not b.get("idc") or not b.get("heating"):
                continue
            fuel = next((k for k in self.EF_SCOPE1 if k in b.value("heating").lower()), None)
            ef = self.EF_SCOPE1.get(fuel, 0.0)
            idc = b.get("idc")
            b.set("co2_scope1", round(b.value("idc") / 3.6 * ef, 1), Method.ESTIMATED, "Computed",
                  f"IDC ({idc.provenance}, {idc.method}) / 3.6 × direct emission factor "
                  f"{fuel or 'non-fossil'} = {ef} kgCO2/kWh")

    # ------------------------------------------------------------------ outputs
    @staticmethod
    def schema() -> list[dict]:
        return [{"name": n, "label": s.label, "unit": s.unit, "category": str(s.category)} for n, s in ATTRIBUTES.items()]

    def coverage(self) -> dict[str, dict[str, int]]:
        """Per attribute: count of buildings by provenance/method (and missing)."""
        out = {}
        for name in ATTRIBUTES:
            c: dict[str, int] = {}
            for b in self.buildings.values():
                a = b.get(name)
                k = "missing" if a is None or a.value in (None, "", []) else f"{a.provenance}/{a.method}"
                c[k] = c.get(k, 0) + 1
            out[name] = c
        return out

    def to_geojson(self, path: str) -> None:
        feats = [{"type": "Feature", "geometry": b.geometry, "properties": b.to_record()}
                 for b in self.buildings.values()]
        Path(path).write_text(json.dumps({"type": "FeatureCollection", "schema": self.schema(), "features": feats},
                                         ensure_ascii=False))


    def to_geojson_3d(self, path: str, precision: int = 6) -> None:
        """Light layer for the map extrusion (MapLibre fill-extrusion): footprint + height."""
        def rnd(c):
            return [rnd(x) for x in c] if isinstance(c[0], list) else [round(x, precision) for x in c]
        feats = [{"type": "Feature", "geometry": {"type": b.geometry["type"], "coordinates": rnd(b.geometry["coordinates"])},
                  "properties": {"egid": b.egid, "height": b.value("height")}}
                 for b in self.buildings.values() if b.value("height") is not None]
        Path(path).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))


def main() -> None:
    """Build the stock and write the app's data files. Run before the web app starts (npm predev/prebuild)."""
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="public/data", help="output directory served by the web app")
    ap.add_argument("--refresh", action="store_true", help="refetch all providers instead of using data/cache")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    stock = CityStock(with_3d=True)
    stock.build(refresh=args.refresh)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stock.to_geojson(str(out / "ville_geneve_core.geojson"))
    stock.to_geojson_3d(str(out / "ville_geneve_3d.geojson"))
    print(f"[data] {len(stock.buildings)} buildings -> {out}/")
    if not args.quiet:
        print(stock.log)
        for cat in Category:
            print(f"## {cat}")
            for name, spec in ATTRIBUTES.items():
                if spec.category == cat:
                    print(f"  {name:24s} [{spec.unit or '-':12s}] {stock.coverage()[name]}")


if __name__ == "__main__":
    main()
