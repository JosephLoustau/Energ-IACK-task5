"""Étape 5 : compare les extractions au relevé manuel docs/renovation/parametres_renovation.csv.

    python litterature/evaluer.py

Le relevé manuel et la liste de paramètres n'ont pas le même vocabulaire : la comparaison se fait sur les NOMBRES.
Une ligne du relevé est « retrouvée » si l'une de ses valeurs (valeur, min, max) figure parmi les nombres extraits du
même document (observations et autres valeurs, écart relatif ≤ 1 %).

Le relevé n'est pas exhaustif et peut contenir des valeurs converties : le rappel mesuré est une borne basse.
Les valeurs extraites absentes du relevé ne sont pas des erreurs a priori : en contrôler un échantillon à la main.

Sorties : sorties/evaluation.csv (une ligne par ligne du relevé, retrouvée ou non),
          sorties/evaluation_en_plus.csv (observations extraites absentes du relevé).
"""
from __future__ import annotations

import csv
import sys
from typing import Any

from commun import CSV_REFERENCE, SORTIES, charger_extractions, ecrire_csv, source_id

TOLERANCE = 0.01


def nombre(x: Any) -> float | None:
    try:
        return float(str(x).replace("'", "").replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return None


def proche(a: float, b: float) -> bool:
    return abs(a - b) <= TOLERANCE * max(abs(a), abs(b), 1e-9)


def valeurs_extraites(ext: dict[str, Any]) -> list[tuple[float, str]]:
    """(nombre, origine) pour toutes les valeurs extraites d'un document."""
    sortie = []
    for obs in ext["observations"]:
        for cle in ("valeur", "valeur_min", "valeur_max"):
            if obs.get(cle) is not None:
                sortie.append((float(obs[cle]), obs["parametre"]))
    for v in ext["autres_valeurs"]:
        if v.get("valeur") is not None:
            sortie.append((float(v["valeur"]), f"autres_valeurs : {v['grandeur']}"))
    return sortie


def main() -> int:
    extractions = charger_extractions()
    if not extractions:
        print("Aucune extraction dans sorties/extraction/", file=sys.stderr)
        return 1
    with CSV_REFERENCE.open(encoding="utf-8", newline="") as f:
        reference = list(csv.DictReader(f))

    lignes, en_plus = [], []
    print(f"{'document':28} {'relevé':>7} {'retrouvé':>9} {'rappel':>7} {'extrait hors relevé':>20}")
    for nom, ext in extractions.items():
        sid = source_id(nom)
        releve = [r for r in reference if r["source_id"] == sid]
        extraits = valeurs_extraites(ext)
        nombres_releve = []
        n_retrouve = 0
        for r in releve:
            cibles = [v for v in (nombre(r["valeur"]), nombre(r["valeur_min"]), nombre(r["valeur_max"])) if v is not None]
            nombres_releve.extend(cibles)
            correspondances = sorted({origine for c in cibles for v, origine in extraits if proche(v, c)})
            n_retrouve += bool(correspondances)
            lignes.append({"document": nom, "source_id": sid, "id_releve": r["id"], "parametre_releve": r["parametre"],
                           "mesure": r["mesure"], "valeur": r["valeur"], "valeur_min": r["valeur_min"],
                           "valeur_max": r["valeur_max"], "unite": r["unite"], "localisation": r["localisation"],
                           "retrouvee": bool(correspondances), "parametres_extraits": " ; ".join(correspondances)})
        for i, obs in enumerate(ext["observations"], 1):
            vals = [obs[k] for k in ("valeur", "valeur_min", "valeur_max") if obs.get(k) is not None]
            if vals and not any(proche(float(v), c) for v in vals for c in nombres_releve):
                en_plus.append({"document": nom, "obs": i, "parametre": obs["parametre"], "element": obs["element"],
                                "valeur": obs["valeur"], "valeur_min": obs["valeur_min"], "valeur_max": obs["valeur_max"],
                                "unite": obs["unite"], "page": obs["page"], "citation": obs["citation"],
                                "controle": ""})
        n_plus = sum(e["document"] == nom for e in en_plus)
        rappel = f"{n_retrouve / len(releve):.0%}" if releve else "—"
        print(f"{nom:28} {len(releve):>7} {n_retrouve:>9} {rappel:>7} {n_plus:>20}"
              + ("" if releve else f"   (aucune ligne « {sid} » dans le relevé)"))

    ecrire_csv(SORTIES / "evaluation.csv", lignes)
    # Les contrôles déjà saisis à la main dans evaluation_en_plus.csv sont conservés d'une exécution à l'autre.
    chemin_plus = SORTIES / "evaluation_en_plus.csv"
    if chemin_plus.exists():
        with chemin_plus.open(encoding="utf-8", newline="") as f:
            faits = {(r["document"], r["obs"], r["parametre"]): r["controle"] for r in csv.DictReader(f)}
        for e in en_plus:
            e["controle"] = faits.get((e["document"], str(e["obs"]), e["parametre"]), "")
    ecrire_csv(chemin_plus, en_plus)
    controles = [e["controle"].strip().lower() for e in en_plus if e["controle"].strip()]
    if controles:
        print(f"Précision sur l'échantillon contrôlé : {controles.count('juste')}/{len(controles)} justes")
    print(f"\n→ {SORTIES / 'evaluation.csv'} : lignes du relevé non retrouvées = oublis possibles (vérifier dans le PDF ;"
          " un oubli récurrent appelle une correction du prompt ou de parametres.yaml).")
    print(f"→ {SORTIES / 'evaluation_en_plus.csv'} : contrôler un échantillon (colonne `controle` : juste / faux) "
          "pour estimer la précision.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
