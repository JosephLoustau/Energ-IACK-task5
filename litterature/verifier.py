"""Étape 4 : vérifie chaque observation contre le texte du PDF, puis aplatit tout en un tableau.

    python litterature/verifier.py

Pour chaque valeur de sorties/extraction/*.json (une observation `valeur`, ou un point d'une série) :
  - la citation est cherchée à la page indiquée, puis dans tout le document (similarité floue, 0-100) ;
  - les nombres de la citation sont comparés à valeur / valeur_min / valeur_max (et à x pour un point de série).
Statut : ok (citation retrouvée et valeurs dans la citation), figure (valeur lue sur un graphique : à contrôler à
l'œil), a_revoir (citation introuvable ou valeur absente de la citation), sans_pdf.
Limite : pour une série tirée d'un tableau, « ok » dit que x et la valeur figurent dans la citation, pas qu'ils sont sur
la même ligne. Contrôler l'appariement d'un échantillon de séries à la main.

Sorties : sorties/observations.csv (une ligne par valeur, obs = « 3 » ou « 3.2 » pour le 2e point de la série 3,
contexte à plat), sorties/hors_cadre.csv, sorties/inventaire.csv (valeurs relevées par élément de l'inventaire),
sorties/couverture.csv (statut de chaque paramètre par document).
"""
from __future__ import annotations

import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

import pdfplumber
from rapidfuzz import fuzz

from commun import (SORTIES, bilan_inventaire, charger_extractions, ecrire_csv, observations_a_plat, pdf_du_document,
                    source_id)

SEUIL_CITATION = 85          # similarité minimale pour considérer la citation retrouvée
TOLERANCE_VALEUR = 0.005     # écart relatif accepté entre la valeur et un nombre de la citation


def normaliser_texte(texte: str) -> str:
    texte = unicodedata.normalize("NFKC", texte)          # ligatures (ﬁ), exposants, espaces insécables
    texte = re.sub(r"-\s*\n\s*", "", texte)                # césures de fin de ligne
    texte = texte.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("−", "-")
    return re.sub(r"\s+", " ", texte).strip().lower()


@lru_cache(maxsize=4)
def pages_pdf(chemin: Path) -> tuple[str, ...]:
    with pdfplumber.open(chemin) as pdf:
        return tuple(normaliser_texte(p.extract_text() or "") for p in pdf.pages)


def nombres(texte: str) -> set[float]:
    """Nombres d'un texte, sous toutes les lectures plausibles (1'200 / 1 200 / 1,200 / 1.2 / 0,5).
    L'espace est lu à la fois comme séparateur de milliers (« 1 200 ») et comme séparateur de nombres (« 5 10 20 »
    dans une ligne de tableau)."""
    resultats = set()
    for brut in re.findall(r"\d[\d'’ .,]*\d|\d", texte) + re.findall(r"\d[\d'’.,]*\d|\d", texte):
        brut = brut.strip(" .,")
        candidats = {brut.replace("'", "").replace("’", "").replace(" ", "")}
        for c in list(candidats):
            candidats |= {c.replace(",", ""), c.replace(",", "."), c.replace(".", "").replace(",", ".")}
        for c in candidats:
            try:
                resultats.add(float(c))
            except ValueError:
                pass
    return resultats


def valeur_presente(valeur: float | None, dans: set[float]) -> bool:
    if valeur is None:
        return True
    cibles = {valeur, valeur * 100, valeur / 100}  # 0.5 écrit « 50 % » et inversement
    return any(abs(n - c) <= TOLERANCE_VALEUR * max(abs(c), 1e-9) for n in dans for c in cibles)


@lru_cache(maxsize=256)
def chercher_citation(citation: str, page: int | None, pages: tuple[str, ...]) -> tuple[float, int | None]:
    """Meilleure similarité de la citation (déjà normalisée) avec une page, en commençant par la page indiquée.
    En cache : les points d'une même série partagent leur citation."""
    score, page_trouvee = 0.0, None
    if not citation:
        return score, page_trouvee
    ordre = ([page - 1] if isinstance(page, int) and 0 < page <= len(pages) else []) + list(range(len(pages)))
    for i in ordre:
        s = fuzz.partial_ratio(citation, pages[i]) if pages[i] else 0.0
        if s > score:
            score, page_trouvee = s, i + 1
        if score >= 98:
            break
    return score, page_trouvee


def verifier_observation(obs: dict[str, Any], pages: tuple[str, ...] | None) -> dict[str, Any]:
    if pages is None:
        return {"verification": "sans_pdf", "score_citation": None, "page_trouvee": None, "valeur_dans_citation": None}
    page = obs.get("page")
    score, page_trouvee = chercher_citation(normaliser_texte(obs.get("citation") or ""),
                                            page if isinstance(page, int) else None, pages)
    dans = nombres(obs.get("citation") or "")
    valeur_ok = all(valeur_presente(obs.get(k), dans) for k in ("valeur", "valeur_min", "valeur_max", "x"))
    if obs.get("lecture") == "figure":
        statut = "figure"
    elif score >= SEUIL_CITATION and valeur_ok:
        statut = "ok"
    else:
        statut = "a_revoir"
    return {"verification": statut, "score_citation": round(score), "page_trouvee": page_trouvee,
            "valeur_dans_citation": valeur_ok}


def main() -> int:
    extractions = charger_extractions()
    if not extractions:
        print("Aucune extraction dans sorties/extraction/ (lancer assembler.py)", file=sys.stderr)
        return 1
    observations, hors_cadre, inventaire, couverture = [], [], [], []
    for nom, ext in extractions.items():
        pdf = pdf_du_document(nom)
        pages = pages_pdf(pdf) if pdf else None
        base = {"document": nom, "source_id": source_id(nom)}
        lignes = [{**base, **ligne, **verifier_observation(ligne, pages)} for ligne in observations_a_plat(ext)]
        observations.extend(lignes)
        for i, v in enumerate(ext["hors_cadre"], 1):
            hors_cadre.append({**base, "n": i, **v, **verifier_observation({**v, "lecture": "texte"}, pages)})
        inventaire.extend({**base, **b} for b in bilan_inventaire(ext))
        couverture.extend({**base, **c} for c in ext["couverture"])
        n_ok = sum(o["verification"] == "ok" for o in lignes)
        n_revoir = sum(o["verification"] == "a_revoir" for o in lignes)
        print(f"{nom} : {len(lignes)} valeur(s) dont {sum(o['x'] is not None for o in lignes)} en série, "
              f"{n_ok} ok, {n_revoir} à revoir, {len(ext['hors_cadre'])} hors cadre"
              + ("" if pdf else " (PDF absent de corpus/ : non vérifié)"))

    premieres = ["document", "source_id", "obs", "parametre", "forme", "element", "variable", "unite_x", "x", "valeur",
                 "valeur_min", "valeur_max", "unite", "verification", "score_citation", "valeur_dans_citation", "page",
                 "page_trouvee", "emplacement", "lecture", "source_inventaire", "passe", "lot", "source_primaire"]
    colonnes = premieres + sorted({k for o in observations for k in o} - set(premieres) - {"remarque", "citation"}) \
        + ["remarque", "citation"]
    ecrire_csv(SORTIES / "observations.csv", observations, colonnes)
    ecrire_csv(SORTIES / "hors_cadre.csv", hors_cadre)
    ecrire_csv(SORTIES / "inventaire.csv", inventaire)
    ecrire_csv(SORTIES / "couverture.csv", couverture)
    nouvelles = preparer_decisions(observations)
    print(f"→ {SORTIES / 'observations.csv'} ({len(observations)} lignes), hors_cadre.csv, inventaire.csv, "
          "couverture.csv")
    print(f"→ {FICHIER_DECISIONS} : {nouvelles} nouvelle(s) ligne(s) à contrôler dans le PDF "
          "(colonne decision : garder, exclure ou corriger + valeur_corrigee). Ce fichier n'est jamais écrasé.")
    return 0


FICHIER_DECISIONS = SORTIES / "decisions.csv"
COLONNES_DECISIONS = ["document", "obs", "parametre", "x", "unite_x", "valeur", "unite", "verification", "page",
                      "page_trouvee", "decision", "valeur_corrigee", "commentaire", "citation"]


def preparer_decisions(observations: list[dict[str, Any]]) -> int:
    """Ajoute à decisions.csv les observations à contrôler qui n'y sont pas encore ; garde les décisions déjà prises."""
    import csv
    existantes = []
    if FICHIER_DECISIONS.exists():
        with FICHIER_DECISIONS.open(encoding="utf-8", newline="") as f:
            existantes = list(csv.DictReader(f))
    connues = {(d["document"], str(d["obs"]), d["parametre"]) for d in existantes}
    nouvelles = [{**{k: o.get(k) for k in COLONNES_DECISIONS}, "decision": "", "valeur_corrigee": "", "commentaire": ""}
                 for o in observations
                 if o["verification"] in ("a_revoir", "figure")
                 and (o["document"], str(o["obs"]), o["parametre"]) not in connues]
    ecrire_csv(FICHIER_DECISIONS, existantes + nouvelles, COLONNES_DECISIONS)
    return len(nouvelles)


if __name__ == "__main__":
    sys.exit(main())
