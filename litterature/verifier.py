"""Étape 4 : vérifie chaque observation contre le texte du PDF, puis aplatit tout en un tableau.

    python litterature/verifier.py

Pour chaque observation de sorties/extraction/*.json :
  - la citation est cherchée à la page indiquée, puis dans tout le document (similarité floue, 0-100) ;
  - les nombres de la citation sont comparés à valeur / valeur_min / valeur_max.
Statut : ok (citation retrouvée et valeur dans la citation), figure (valeur lue sur un graphique : à contrôler à l'œil),
a_revoir (citation introuvable ou valeur absente de la citation), sans_pdf.

Sorties : sorties/observations.csv (une ligne par observation, contexte à plat), sorties/autres_valeurs.csv,
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

from commun import SORTIES, charger_extractions, ecrire_csv, pdf_du_document, source_id

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
    """Nombres d'un texte, sous toutes les lectures plausibles (1'200 / 1 200 / 1,200 / 1.2 / 0,5)."""
    resultats = set()
    for brut in re.findall(r"\d[\d'’ .,]*\d|\d", texte):
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


def verifier_observation(obs: dict[str, Any], pages: tuple[str, ...] | None) -> dict[str, Any]:
    if pages is None:
        return {"verification": "sans_pdf", "score_citation": None, "page_trouvee": None, "valeur_dans_citation": None}
    citation = normaliser_texte(obs.get("citation") or "")
    score, page_trouvee = 0.0, None
    if citation:
        page = obs.get("page")
        ordre = ([page - 1] if isinstance(page, int) and 0 < page <= len(pages) else []) + list(range(len(pages)))
        for i in ordre:
            s = fuzz.partial_ratio(citation, pages[i]) if pages[i] else 0.0
            if s > score:
                score, page_trouvee = s, i + 1
            if score >= 98:
                break
    dans = nombres(obs.get("citation") or "")
    valeur_ok = all(valeur_presente(obs.get(k), dans) for k in ("valeur", "valeur_min", "valeur_max"))
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
    observations, autres, couverture = [], [], []
    for nom, ext in extractions.items():
        pdf = pdf_du_document(nom)
        pages = pages_pdf(pdf) if pdf else None
        base = {"document": nom, "source_id": source_id(nom)}
        for i, obs in enumerate(ext["observations"], 1):
            contexte = {f"ctx_{k}": v for k, v in obs["contexte"].items()}
            ligne = {**base, "obs": i, **{k: v for k, v in obs.items() if k != "contexte"}, **contexte}
            observations.append({**ligne, **verifier_observation(obs, pages)})
        for i, v in enumerate(ext["autres_valeurs"], 1):
            autres.append({**base, "n": i, **v, **verifier_observation({**v, "lecture": "texte"}, pages)})
        couverture.extend({**base, **c} for c in ext["couverture"])
        n_ok = sum(o["verification"] == "ok" for o in observations if o["document"] == nom)
        n_revoir = sum(o["verification"] == "a_revoir" for o in observations if o["document"] == nom)
        print(f"{nom} : {len(ext['observations'])} observation(s), {n_ok} ok, {n_revoir} à revoir"
              + ("" if pdf else " (PDF absent de corpus/ : non vérifié)"))

    premieres = ["document", "source_id", "obs", "parametre", "element", "valeur", "valeur_min", "valeur_max", "unite",
                 "verification", "score_citation", "valeur_dans_citation", "page", "page_trouvee", "emplacement",
                 "lecture", "passe", "lot", "source_primaire"]
    colonnes = premieres + sorted({k for o in observations for k in o} - set(premieres) - {"remarque", "citation"}) \
        + ["remarque", "citation"]
    ecrire_csv(SORTIES / "observations.csv", observations, colonnes)
    ecrire_csv(SORTIES / "autres_valeurs.csv", autres)
    ecrire_csv(SORTIES / "couverture.csv", couverture)
    nouvelles = preparer_decisions(observations)
    print(f"→ {SORTIES / 'observations.csv'} ({len(observations)} lignes), autres_valeurs.csv, couverture.csv")
    print(f"→ {FICHIER_DECISIONS} : {nouvelles} nouvelle(s) ligne(s) à contrôler dans le PDF "
          "(colonne decision : garder, exclure ou corriger + valeur_corrigee). Ce fichier n'est jamais écrasé.")
    return 0


FICHIER_DECISIONS = SORTIES / "decisions.csv"
COLONNES_DECISIONS = ["document", "obs", "parametre", "valeur", "unite", "verification", "page", "page_trouvee",
                      "decision", "valeur_corrigee", "commentaire", "citation"]


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
