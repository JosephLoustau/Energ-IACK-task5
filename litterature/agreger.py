"""Étape 7 : statistiques de la littérature par paramètre et par déclinaison (élément, agent, affectation…).

    python litterature/agreger.py

Entrée : sorties/observations_normalisees.csv (étape 6), lignes « ok » et « nominal » seulement.
Regroupement : paramètre × déclinaison × moment (avant / après) × unité normalisée × base de surface. Les valeurs d'un groupe sont d'abord
réduites à une valeur par source (médiane), la source étant la source primaire si le document reprend une autre
publication : une même valeur citée par plusieurs documents ne compte qu'une fois.

Sortie : sorties/agregats.csv.
"""
from __future__ import annotations

import statistics
import sys
from collections import defaultdict
from typing import Any

from commun import SORTIES, ecrire_csv
from normaliser import UTILISABLES, lire_csv, nombre
from schema import charger_parametres

# Champ de contexte qui décline un paramètre (le premier présent dans la liste `contexte` du paramètre et renseigné).
DECLINAISONS = ("element", "agent_energetique", "type_batiment", "materiau")
NON_PRECISE = {"", "non_precise", "None"}


def declinaison(obs: dict[str, str], parametre: dict[str, Any]) -> str:
    for champ in DECLINAISONS:
        if champ in parametre["contexte"]:
            candidats = [obs.get(f"ctx_{champ}", "")] + ([obs.get("element", "")] if champ == "element" else [])
            valeur = next((v for v in candidats if v not in NON_PRECISE), None)
            if valeur:
                return valeur
    return ""


def valeur_representative(obs: dict[str, str]) -> float | None:
    v = nombre(obs.get("valeur_n"))
    if v is not None:
        return v
    bornes = [b for b in (nombre(obs.get("valeur_min_n")), nombre(obs.get("valeur_max_n"))) if b is not None]
    return sum(bornes) / len(bornes) if bornes else None


def quantile(valeurs: list[float], q: float) -> float:
    if len(valeurs) == 1:
        return valeurs[0]
    return statistics.quantiles(valeurs, n=100, method="inclusive")[round(q * 100) - 1] if 0 < q < 1 else \
        (min(valeurs) if q == 0 else max(valeurs))


def resume(valeurs: set[str]) -> str:
    return ", ".join(sorted(v for v in valeurs if v not in NON_PRECISE))


def main() -> int:
    config = charger_parametres()
    parametres = {p["id"]: p for p in config["parametres"]}
    observations = [o for o in lire_csv(SORTIES / "observations_normalisees.csv") if o["normalisation"] in UTILISABLES]
    if not observations:
        print("Aucune observation utilisable dans sorties/observations_normalisees.csv (lancer normaliser.py)",
              file=sys.stderr)
        return 1

    groupes: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    for obs in observations:
        p = parametres.get(obs["parametre"])
        if p is None or valeur_representative(obs) is None:
            continue
        groupes[(obs["parametre"], declinaison(obs, p), obs.get("ctx_moment", ""), obs["unite_n"],
                  obs.get("ctx_base_surface", ""))].append(obs)

    lignes = []
    for (parametre, decl, moment, unite, base), obs_groupe in sorted(groupes.items()):
        par_source: dict[str, list[float]] = defaultdict(list)
        for obs in obs_groupe:
            source = obs.get("source_primaire") if obs.get("source_primaire") not in NON_PRECISE else obs["source_id"]
            par_source[source].append(valeur_representative(obs))
        valeurs = sorted(statistics.median(v) for v in par_source.values())
        lignes.append({
            "parametre": parametre, "declinaison": decl, "moment": moment, "unite_n": unite, "base_surface": base,
            "n_sources": len(valeurs), "n_valeurs": len(obs_groupe),
            "min": round(valeurs[0], 4), "q25": round(quantile(valeurs, 0.25), 4),
            "mediane": round(statistics.median(valeurs), 4), "q75": round(quantile(valeurs, 0.75), 4),
            "max": round(valeurs[-1], 4),
            "n_nominal": sum(o["normalisation"] == "nominal" for o in obs_groupe),
            "sources": " ; ".join(f"{s} ({len(v)})" for s, v in sorted(par_source.items())),
            "pays": resume({o.get("ctx_pays", "") for o in obs_groupe}),
            "nature": resume({o.get("ctx_nature", "") for o in obs_groupe}),
            "annees_prix": resume({o.get("ctx_annee_prix", "") for o in obs_groupe}),
            "type_batiment": resume({o.get("ctx_type_batiment", "") for o in obs_groupe}),
            "cas": resume({o.get("ctx_cas", "") for o in obs_groupe}),
        })
    ecrire_csv(SORTIES / "agregats.csv", lignes)
    print(f"{len(lignes)} groupe(s) sur {len({l['parametre'] for l in lignes})} paramètre(s) → {SORTIES / 'agregats.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
