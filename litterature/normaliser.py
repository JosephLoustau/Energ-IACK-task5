"""Étape 6 : ramène les observations vérifiées à des unités, une devise, une année de prix et une TVA communes.

    python litterature/normaliser.py [--inclure-a-revoir]

Entrées : sorties/observations.csv (étape 4), sorties/decisions.csv (contrôles manuels), conversions.yaml.
Les observations « a_revoir » sans décision sont écartées (sauf --inclure-a-revoir) ; « exclure » écarte une ligne,
« corriger » remplace la valeur par valeur_corrigee.

Colonne `normalisation` :
  ok                   unité, devise, année des prix et TVA ramenées à la référence
  nominal              montant non corrigé de l'inflation (indice manquant ou année des prix inconnue)
  unite_inconnue       unité absente de conversions.yaml (voir sorties/unites_inconnues.csv) : écartée
  change_manquant      devise étrangère sans taux de change : écartée
  exclue / a_revoir    écartée par décision ou faute de contrôle
Colonne `notes` : précisions (TVA inconnue, devise supposée CHF, etc.).

Sortie : sorties/observations_normalisees.csv.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

from commun import ICI, SORTIES, ecrire_csv

FICHIER_CONVERSIONS = ICI / "conversions.yaml"
UTILISABLES = {"ok", "nominal"}


def cle_unite(unite: str) -> str:
    u = unicodedata.normalize("NFKC", unite or "").lower().replace("€", "eur")
    return re.sub(r"[\s·⋅*().]", "", u)


def charger_conversions() -> tuple[dict[str, Any], dict[str, tuple[str, float, str | None]]]:
    conv = yaml.safe_load(FICHIER_CONVERSIONS.read_text(encoding="utf-8"))
    table: dict[str, tuple[str, float, str | None]] = {}
    for canonique, regles in conv["unites"].items():
        for regle in regles:
            for alias in regle["alias"]:
                cle = cle_unite(str(alias))
                if cle in table and table[cle][0] != canonique:
                    raise ValueError(f"alias « {alias} » attribué à deux unités : {table[cle][0]} et {canonique}")
                table[cle] = (canonique, float(regle["facteur"]), regle.get("devise"))
    return conv, table


def lire_csv(chemin: Path) -> list[dict[str, str]]:
    if not chemin.exists():
        return []
    with chemin.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def nombre(x: Any) -> float | None:
    try:
        return float(x) if x not in (None, "") else None
    except ValueError:
        return None


def annee(texte: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", texte or "")
    return int(m.group(0)) if m else None


def taux_tva(conv: dict[str, Any], pays: str, an: int | None) -> float | None:
    code = (pays or "").upper().split("-")[0]
    if an is None or code not in conv["tva"]:
        return None
    return next((p["taux"] for p in conv["tva"][code] if p["de"] <= an <= p["a"]), None)


def normaliser(obs: dict[str, str], conv: dict[str, Any], table: dict[str, tuple[str, float, str | None]]) -> dict[str, Any]:
    notes = []
    regle = table.get(cle_unite(obs["unite"]))
    if regle is None:
        return {"normalisation": "unite_inconnue", "notes": f"unité « {obs['unite']} »"}
    canonique, facteur, devise_unite = regle
    multiplicateur = facteur
    statut = "ok"

    if canonique.startswith("CHF"):
        devise = devise_unite or obs.get("ctx_devise") or "non_precise"
        an = annee(obs.get("ctx_annee_prix", ""))
        if devise == "non_precise":
            devise = "CHF"
            notes.append("devise non précisée, supposée CHF")
        if devise != "CHF":
            taux = conv["taux_change"].get(devise, {}).get(an) if an else None
            if taux is None:
                return {"normalisation": "change_manquant",
                        "notes": f"{devise} {an or 'année inconnue'} : compléter taux_change dans conversions.yaml"}
            multiplicateur *= float(taux)
        serie = conv["indices"].get(conv["indice_par_parametre"].get(obs["parametre"], "construction"), {})
        ref = serie.get(conv["annee_reference"])
        if an is None or an not in serie or ref is None:
            statut = "nominal"
            notes.append(f"prix {an or 'année inconnue'} non corrigés de l'inflation")
        else:
            multiplicateur *= float(ref) / float(serie[an])
        tva = obs.get("ctx_tva", "non_precise")
        if tva == "non_precise":
            notes.append("TVA non précisée")
        elif tva != conv["tva_reference"]:
            taux = taux_tva(conv, obs.get("ctx_pays", ""), an)
            if taux is None:
                notes.append(f"TVA {tva} non convertie (taux inconnu pour {obs.get('ctx_pays')} {an})")
            else:
                multiplicateur *= 1 / (1 + taux) if tva == "incluse" else (1 + taux)

    sortie = {"unite_n": canonique, "normalisation": statut, "notes": " ; ".join(notes)}
    for cle in ("valeur", "valeur_min", "valeur_max"):
        v = nombre(obs.get(cle))
        sortie[f"{cle}_n"] = round(v * multiplicateur, 6) if v is not None else None
    return sortie


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inclure-a-revoir", action="store_true", help="garder les observations non contrôlées")
    args = parser.parse_args()

    observations = lire_csv(SORTIES / "observations.csv")
    if not observations:
        print("sorties/observations.csv absent ou vide : lancer verifier.py", file=sys.stderr)
        return 1
    decisions = {(d["document"], d["obs"]): d for d in lire_csv(SORTIES / "decisions.csv")}
    conv, table = charger_conversions()

    lignes, inconnues = [], Counter()
    for obs in observations:
        obs = dict(obs)
        decision = decisions.get((obs["document"], obs["obs"]), {})
        choix = (decision.get("decision") or "").strip().lower()
        if decision and decision["parametre"] != obs["parametre"]:
            print(f"! decisions.csv : {obs['document']} obs {obs['obs']} ne correspond plus au même paramètre "
                  "(extraction refaite ?) ; décision ignorée", file=sys.stderr)
            choix = ""
        if choix == "exclure":
            lignes.append({**obs, "normalisation": "exclue", "notes": decision.get("commentaire", "")})
            continue
        if choix == "corriger":
            obs["valeur"] = decision["valeur_corrigee"]
        if obs["verification"] == "a_revoir" and choix not in ("garder", "corriger") and not args.inclure_a_revoir:
            lignes.append({**obs, "normalisation": "a_revoir", "notes": "non contrôlée (decisions.csv)"})
            continue
        resultat = normaliser(obs, conv, table)
        if resultat["normalisation"] == "unite_inconnue":
            inconnues[(obs["parametre"], obs["unite"])] += 1
        lignes.append({**obs, **resultat})

    ecrire_csv(SORTIES / "observations_normalisees.csv", lignes)
    ecrire_csv(SORTIES / "unites_inconnues.csv",
               [{"parametre": p, "unite": u, "occurrences": n} for (p, u), n in inconnues.most_common()])
    bilan = Counter(l["normalisation"] for l in lignes)
    print("Normalisation : " + ", ".join(f"{k} {v}" for k, v in bilan.most_common()))
    if inconnues:
        print(f"  {len(inconnues)} unité(s) inconnue(s) → sorties/unites_inconnues.csv (à ajouter dans conversions.yaml)")
    if bilan["nominal"]:
        print("  montants nominaux : compléter `indices` dans conversions.yaml pour corriger l'inflation")
    print(f"→ {SORTIES / 'observations_normalisees.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
