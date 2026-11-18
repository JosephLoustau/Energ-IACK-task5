"""Étapes 2-3 (mode manuel) : assemble les réponses collées depuis le chat en un JSON par document.

    python litterature/assembler.py                 # tous les documents de sorties/manuel/
    python litterature/assembler.py GRANDJEAN2021   # un document

Rangement attendu des réponses (une réponse = un fichier, contenu collé tel quel, bloc ```json compris) :
    sorties/manuel/<DOCUMENT>/<lot>__1_inventaire.json
    sorties/manuel/<DOCUMENT>/<lot>__2_extraction.json
    sorties/manuel/<DOCUMENT>/<lot>__3_relecture.json
avec <DOCUMENT> = nom du PDF dans corpus/ sans .pdf, et <lot> = tout, A_enveloppe, B_systemes ou C_performance_economie
(le même préfixe que le prompt utilisé). Réponse en plusieurs messages (« SUITE ») : suffixes __2_extraction_2.json,
__2_extraction_3.json…

Chaque réponse est vérifiée contre le format attendu et contre les règles de cohérence (forme valeur / série) ; un
document avec une réponse non conforme n'est pas assemblé (corriger le fichier, ou redemander la réponse dans le chat,
puis relancer). Sont signalés sans bloquer : paramètres sans couverture, éléments de l'inventaire non traités ou
partiels, références à un élément absent de l'inventaire.
Sortie : sorties/extraction/<DOCUMENT>.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import re
import sys
from pathlib import Path
from typing import Any

from commun import (ETAPES, EXTRACTION, MANUEL, ajouter_inventaire, bilan_inventaire, ecrire_json,
                    empreinte_parametres, fusionner, lire_reponse, pdf_du_document, references_inconnues,
                    resultat_vide, valider, verifier_couverture)
from schema import charger_parametres, controler_coherence, lots, schema_inventaire, schema_sortie

MAX_ERREURS_AFFICHEES = 8
MOTIF = re.compile(rf"^(?P<lot>.+?)__(?P<etape>{'|'.join(ETAPES)})(?:_(?P<partie>\d+))?\.(json|txt|md)$")


def fichiers_du_document(dossier: Path) -> tuple[dict[tuple[str, str], list[Path]], list[str]]:
    """{(lot, étape): [parties dans l'ordre]} et noms de fichiers non reconnus."""
    trouves: dict[tuple[str, str], list[tuple[int, Path]]] = {}
    inconnus = []
    for f in sorted(dossier.iterdir()):
        m = MOTIF.match(f.name)
        if not m:
            inconnus.append(f.name)
            continue
        trouves.setdefault((m["lot"], m["etape"]), []).append((int(m["partie"] or 1), f))
    return {cle: [f for _, f in sorted(parties)] for cle, parties in trouves.items()}, inconnus


def assembler(dossier: Path, config: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    ids_par_lot = dict(lots(config, decoupe=False) + lots(config))
    fichiers, inconnus = fichiers_du_document(dossier)
    problemes = [f"fichier ignoré (nom non reconnu) : {nom}" for nom in inconnus]
    lots_presents = sorted({lot for lot, _ in fichiers})
    for lot in lots_presents:
        if lot not in ids_par_lot:
            return None, problemes + [f"lot inconnu « {lot} » (attendu : {', '.join(ids_par_lot)})"]
        if (lot, "1_inventaire") not in fichiers:
            return None, problemes + [f"lot {lot} : pas d'inventaire ({lot}__1_inventaire.json)"]
        if (lot, "2_extraction") not in fichiers:
            return None, problemes + [f"lot {lot} : pas d'extraction ({lot}__2_extraction.json)"]
        if (lot, "3_relecture") not in fichiers:
            problemes.append(f"lot {lot} : pas de relecture (assemblé quand même)")
    if not lots_presents:
        return None, problemes + ["aucune réponse"]
    if "tout" in lots_presents and len(lots_presents) > 1:
        return None, problemes + ["mélange du lot « tout » et de lots séparés : garder l'un ou l'autre"]

    resultat = resultat_vide()
    erreurs = []
    for lot in lots_presents:
        schemas = {"1_inventaire": schema_inventaire(config, ids_par_lot[lot]),
                   "2_extraction": schema_sortie(config, ids_par_lot[lot]),
                   "3_relecture": schema_sortie(config, ids_par_lot[lot])}
        for etape in ETAPES:
            for f in fichiers.get((lot, etape), []):
                try:
                    reponse = lire_reponse(f.read_text(encoding="utf-8"))
                except ValueError as e:  # json.JSONDecodeError en hérite
                    erreurs.append(f"{f.name} : JSON illisible ({e})")
                    continue
                fautes = valider(reponse, schemas[etape])
                if not fautes and etape != "1_inventaire":
                    fautes = controler_coherence(reponse)
                erreurs.extend(f"{f.name} : {e}" for e in fautes[:MAX_ERREURS_AFFICHEES])
                if len(fautes) > MAX_ERREURS_AFFICHEES:
                    erreurs.append(f"{f.name} : … et {len(fautes) - MAX_ERREURS_AFFICHEES} autre(s) erreur(s) de format")
                if erreurs:
                    continue
                passe = etape.split("_", 1)[1]
                if etape == "1_inventaire":
                    ajouter_inventaire(resultat, reponse, passe, lot)
                else:
                    fusionner(resultat, reponse, passe, lot)
    if erreurs:
        return None, problemes + erreurs

    ids_attendus = [i for lot in lots_presents for i in ids_par_lot[lot]]
    sans = verifier_couverture(resultat, ids_attendus)
    if sans:
        problemes.append(f"paramètres sans couverture (sautés par le modèle) : {', '.join(sans)}")
    inconnues = references_inconnues(resultat)
    if inconnues:
        problemes.append(f"source_inventaire absente de l'inventaire : {', '.join(inconnues)}")
    bilan = bilan_inventaire(resultat)
    for statut in ("non_traite", "partiel"):
        elements = [f"{b['lot']}/{b['id']} {b['emplacement']} ({b['n_releves']}/{b['n_valeurs']})"
                    for b in bilan if b["statut"] == statut]
        if elements:
            problemes.append(f"inventaire, {statut.replace('_', ' ')} : {', '.join(elements)}")
    lots_manquants = [lot for lot in ids_par_lot if lot != "tout" and lot not in lots_presents]
    if "tout" not in lots_presents and lots_manquants:
        problemes.append(f"lots non traités : {', '.join(lots_manquants)}")

    pdf = pdf_du_document(dossier.name)
    resultat["meta"] = {
        "fichier": pdf.name if pdf else None,
        "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest() if pdf else None,
        "mode": "manuel",
        "lots": lots_presents,
        "reponses": [f.name for parties in fichiers.values() for f in parties],
        "date_assemblage": dt.datetime.now().isoformat(timespec="seconds"),
        "version_parametres": config.get("version"),
        "sha256_parametres": empreinte_parametres(),
        "parametres_sans_couverture": sans,
        "references_inventaire_inconnues": inconnues,
    }
    if pdf is None:
        problemes.append(f"pas de corpus/{dossier.name}.pdf : la vérification des citations (étape 4) sera impossible")
    return resultat, problemes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("documents", nargs="*", help="noms de documents (défaut : tous ceux de sorties/manuel/)")
    args = parser.parse_args()
    config = charger_parametres()
    dossiers = [MANUEL / d for d in args.documents] if args.documents else sorted(p for p in MANUEL.glob("*") if p.is_dir())
    if not dossiers:
        print(f"Aucune réponse : les ranger dans {MANUEL}/<DOCUMENT>/ (voir prompts_manuels/LISEZMOI.md)", file=sys.stderr)
        return 1

    echecs = 0
    for dossier in dossiers:
        if not dossier.is_dir():
            print(f"! {dossier.name} : dossier {dossier} introuvable", file=sys.stderr)
            echecs += 1
            continue
        resultat, problemes = assembler(dossier, config)
        if resultat is None:
            echecs += 1
            print(f"! {dossier.name} : non assemblé")
        else:
            ecrire_json(EXTRACTION / f"{dossier.name}.json", resultat)
            trouves = sum(c["statut"] == "trouve" for c in resultat["couverture"])
            series = [o for o in resultat["observations"] if o["forme"] == "serie"]
            print(f"✓ {dossier.name} : {len(resultat['inventaire'])} élément(s) inventorié(s), "
                  f"{len(resultat['observations'])} observation(s) dont {len(series)} série(s) "
                  f"({sum(len(o['points']) for o in series)} points), "
                  f"{trouves}/{len(resultat['couverture'])} paramètre(s) trouvé(s), "
                  f"{len(resultat['hors_cadre'])} valeur(s) hors cadre")
        for p in problemes:
            print(f"    {p}")
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
