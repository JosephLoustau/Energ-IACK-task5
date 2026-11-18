"""Chemins, lecture / écriture et assemblage partagés par les étapes de la pipeline."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from schema import FICHIER_PARAMETRES

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent
CORPUS = ICI / "corpus"
PROMPTS = ICI / "prompts"
PROMPTS_MANUELS = ICI / "prompts_manuels"
SORTIES = ICI / "sorties"
MANUEL = SORTIES / "manuel"            # réponses collées à la main : manuel/<document>/<passe>__<lot>.json
EXTRACTION = SORTIES / "extraction"    # un JSON assemblé par document
CSV_REFERENCE = RACINE / "docs" / "renovation" / "parametres_renovation.csv"


def empreinte_parametres() -> str:
    return hashlib.sha256(FICHIER_PARAMETRES.read_bytes()).hexdigest()


def ecrire_json(chemin: Path, donnees: Any) -> None:
    """Écriture atomique : un arrêt pendant l'écriture ne laisse jamais de fichier tronqué."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_suffix(chemin.suffix + ".tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(chemin)


def ecrire_csv(chemin: Path, lignes: list[dict[str, Any]], colonnes: list[str] | None = None) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    colonnes = colonnes or list(dict.fromkeys(k for ligne in lignes for k in ligne))
    with chemin.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colonnes, extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)


def prompt(nom: str, **valeurs: str) -> str:
    texte = (PROMPTS / f"{nom}.md").read_text(encoding="utf-8")
    for cle, valeur in valeurs.items():
        texte = texte.replace("{" + cle + "}", valeur)
    return texte


def lire_reponse(texte: str) -> dict[str, Any]:
    """JSON d'une réponse collée depuis le chat : tolère le texte autour et les blocs ```json."""
    bloc = re.search(r"```(?:json)?\s*(.*?)```", texte, re.DOTALL)
    if bloc:
        texte = bloc.group(1)
    debut, fin = texte.find("{"), texte.rfind("}")
    if debut < 0 or fin < 0:
        raise ValueError("aucun objet JSON trouvé")
    return json.loads(texte[debut:fin + 1])


def valider(reponse: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    """Erreurs de format par rapport au schéma (liste vide si conforme)."""
    import jsonschema
    validateur = jsonschema.Draft202012Validator(schema)
    return [f"{'/'.join(map(str, e.absolute_path)) or '(racine)'} : {re.sub(r' is not one of .*', ' : valeur non autorisée', e.message)}"
            for e in sorted(validateur.iter_errors(reponse), key=lambda e: list(map(str, e.absolute_path)))]


def fusionner(base: dict[str, Any], ajout: dict[str, Any], passe: str, lot: str) -> None:
    """Ajoute les observations et autres valeurs de `ajout` ; un statut `trouve` l'emporte sur les autres."""
    base["document"] = base["document"] or ajout["document"]
    base["observations"].extend({**obs, "passe": passe, "lot": lot} for obs in ajout["observations"])
    base["autres_valeurs"].extend({**v, "passe": passe, "lot": lot} for v in ajout["autres_valeurs"])
    couverture = {c["parametre"]: c for c in base["couverture"]}
    for c in ajout["couverture"]:
        existant = couverture.get(c["parametre"])
        if existant is None:
            c = dict(c)
            base["couverture"].append(c)
            couverture[c["parametre"]] = c
        elif c["statut"] == "trouve" and existant["statut"] != "trouve":
            existant.update(statut="trouve", remarque=f"{existant['remarque']} | {passe} : {c['remarque']}".strip(" |"))
        elif c["remarque"] and c["remarque"] != existant["remarque"]:
            existant["remarque"] = f"{existant['remarque']} | {passe} : {c['remarque']}".strip(" |")


def resultat_vide() -> dict[str, Any]:
    return {"document": None, "couverture": [], "observations": [], "autres_valeurs": []}


def verifier_couverture(resultat: dict[str, Any], ids: list[str]) -> list[str]:
    """Paramètres sans entrée de couverture : le modèle les a sautés (à signaler, pas à corriger en silence)."""
    vus = {c["parametre"] for c in resultat["couverture"]}
    return [i for i in ids if i not in vus]


def pdf_du_document(nom: str) -> Path | None:
    chemin = CORPUS / f"{nom}.pdf"
    return chemin if chemin.exists() else None


def source_id(nom_document: str) -> str:
    """Identifiant de source : nom du PDF avant « __ » (STREICHER2020__paperIII → STREICHER2020).

    Deux tirets bas, car certains identifiants de docs/renovation/sources.csv contiennent déjà « _ » (SE_PAC_FICHE).
    Tous les morceaux d'une même étude partagent ce préfixe et ne comptent que pour une source à l'agrégation."""
    return nom_document.split("__")[0]


def charger_extractions() -> dict[str, dict[str, Any]]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(EXTRACTION.glob("*.json"))}
