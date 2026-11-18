"""Étape 8 : place chaque valeur du modèle (parametres.yaml, `valeur_modele`) dans la distribution de la littérature.

    python litterature/comparer.py

Entrée : sorties/agregats.csv (étape 7). Une valeur du modèle déclinée (ex. {facade: 200, toit: 250}) est rapprochée
des groupes de même déclinaison ; le rapprochement des noms est approximatif (préfixe commun : « cave_sol » ↔ « cave »,
« Électrique » ↔ « electricite ») et la déclinaison retenue est affichée dans `declinaison_litterature` : à contrôler.

Alertes : aucune_valeur, peu_de_sources (< 3), hors_plage, extreme (percentile < 10 ou > 90), unite_differente,
comparaison_manuelle (courbe ou table : à comparer à la main), sortie_du_modele (paramètre calculé : à comparer aux
résultats du modèle pour des cas similaires).

Sorties : sorties/comparaison.csv et sorties/prompt_commentaire.md (prompt prêt à coller dans le chat pour commenter
les écarts).
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from typing import Any

from commun import SORTIES, ecrire_csv, prompt
from normaliser import cle_unite, lire_csv
from schema import charger_parametres

PEU_DE_SOURCES = 3


def nom_simple(texte: str) -> str:
    texte = unicodedata.normalize("NFKD", str(texte)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", texte)


def correspond(cle_modele: str, declinaison: str) -> bool:
    a, b = nom_simple(cle_modele), nom_simple(declinaison)
    if not a or not b:
        return a == b
    commun = len(next((a[:i] for i in range(min(len(a), len(b)), 0, -1) if a[:i] == b[:i]), ""))
    return commun >= min(5, len(a), len(b))


def unite_comparable(unite_parametre: str, unite_n: str) -> bool:
    """`CHF/m2_element` ↔ `CHF/m2` : on retire les précisions de base (_element, _SRE…) avant de comparer."""
    if "unite_reference" in unite_parametre:
        return unite_n.split("/")[0] == unite_parametre.split("/")[0]
    simplifiee = re.sub(r"_[A-Za-z_]+", "", unite_parametre).replace("CHF/installation", "CHF")
    return cle_unite(simplifiee) == cle_unite(unite_n)


def valeurs_modele(p: dict[str, Any]) -> list[tuple[str, Any]]:
    v = p.get("valeur_modele")
    if v is None:
        return [("", None)]
    if p.get("comparaison") == "manuelle":
        return [("", json.dumps(v, ensure_ascii=False))]  # toute la courbe, comparée à la main à tous les groupes
    if isinstance(v, dict):
        return [(str(k), x) for k, x in v.items()]
    return [("", v)]


def comparer(p: dict[str, Any], cle: str, valeur: Any, groupes: list[dict[str, str]]) -> list[dict[str, Any]]:
    base = {"parametre": p["id"], "famille": p["famille"], "priorite": p["priorite"], "statut_modele": p["statut_modele"],
            "declinaison_modele": cle, "valeur_modele": valeur, "unite_modele": p["unite"],
            "source_modele": p["source_modele"]}
    candidats = [g for g in groupes if not cle or not g["declinaison"] or correspond(cle, g["declinaison"])]
    if not candidats:
        return [{**base, "alerte": "aucune_valeur"}]
    lignes = []
    for g in candidats:
        alertes = []
        ligne = {**base, "declinaison_litterature": g["declinaison"], "moment": g["moment"], "unite_litterature": g["unite_n"],
                 "base_surface": g["base_surface"], "n_sources": g["n_sources"], "n_valeurs": g["n_valeurs"],
                 "min": g["min"], "q25": g["q25"], "mediane": g["mediane"], "q75": g["q75"], "max": g["max"],
                 "n_nominal": g["n_nominal"], "pays": g["pays"], "nature": g["nature"],
                 "annees_prix": g["annees_prix"], "sources": g["sources"]}
        if int(g["n_sources"]) < PEU_DE_SOURCES:
            alertes.append("peu_de_sources")
        if not unite_comparable(p["unite"], g["unite_n"]):
            alertes.append("unite_differente")
        if p["statut_modele"] == "calcule":
            alertes.append("sortie_du_modele")
        elif p.get("comparaison") == "manuelle" or isinstance(valeur, (dict, list)):
            alertes.append("comparaison_manuelle")
        elif isinstance(valeur, (int, float)) and "unite_differente" not in alertes:
            # Percentile approché à partir des quartiles (les valeurs par source sont dans agregats.csv).
            mini, maxi = float(g["min"]), float(g["max"])
            if valeur < mini or valeur > maxi:
                alertes.append("hors_plage")
            points = [(mini, 0), (float(g["q25"]), 25), (float(g["mediane"]), 50), (float(g["q75"]), 75), (maxi, 100)]
            pct = 0 if valeur <= mini else 100 if valeur >= maxi else next(
                p0 + (p1 - p0) * (valeur - v0) / (v1 - v0) if v1 > v0 else p1
                for (v0, p0), (v1, p1) in zip(points, points[1:]) if v0 <= valeur <= v1)
            ligne["percentile_modele"] = round(pct)
            ligne["ecart_mediane_pct"] = round(100 * (valeur - float(g["mediane"])) / float(g["mediane"])) \
                if float(g["mediane"]) else None
            if "hors_plage" not in alertes and (pct < 10 or pct > 90):
                alertes.append("extreme")
        lignes.append({**ligne, "alerte": ", ".join(alertes)})
    return lignes


def main() -> int:
    config = charger_parametres()
    agregats = lire_csv(SORTIES / "agregats.csv")
    if not agregats:
        print("sorties/agregats.csv absent ou vide : lancer agreger.py", file=sys.stderr)
        return 1
    par_parametre: dict[str, list[dict[str, str]]] = defaultdict(list)
    for g in agregats:
        par_parametre[g["parametre"]].append(g)

    lignes = []
    for p in config["parametres"]:
        for cle, valeur in valeurs_modele(p):
            lignes.extend(comparer(p, cle, valeur, par_parametre.get(p["id"], [])))
    ordre = {"haute": 0, "moyenne": 1, "basse": 2}
    lignes.sort(key=lambda l: (ordre.get(l["priorite"], 3), l["parametre"], l["declinaison_modele"]))
    colonnes = ["parametre", "declinaison_modele", "valeur_modele", "unite_modele", "declinaison_litterature",
                "moment", "unite_litterature", "base_surface", "n_sources", "n_valeurs", "min", "q25", "mediane", "q75", "max",
                "percentile_modele", "ecart_mediane_pct", "alerte", "priorite", "statut_modele", "famille", "n_nominal",
                "pays", "nature", "annees_prix", "source_modele", "sources"]
    ecrire_csv(SORTIES / "comparaison.csv", lignes, colonnes)

    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=colonnes, extrasaction="ignore")
    w.writeheader()
    w.writerows(lignes)
    (SORTIES / "prompt_commentaire.md").write_text(prompt("commentaire", comparaison=tampon.getvalue()), encoding="utf-8")

    alertes = defaultdict(int)
    for l in lignes:
        for a in filter(None, (l.get("alerte") or "").split(", ")):
            alertes[a] += 1
    print(f"{len(lignes)} ligne(s) → {SORTIES / 'comparaison.csv'}")
    print("Alertes : " + ", ".join(f"{a} {n}" for a, n in sorted(alertes.items(), key=lambda x: -x[1])))
    print(f"→ {SORTIES / 'prompt_commentaire.md'} : à coller dans le chat pour commenter les écarts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
