"""Chemins, lecture / écriture et assemblage partagés par les étapes de la pipeline."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from schema import FICHIER_PARAMETRES, STATUTS_COUVERTURE

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent
CORPUS = ICI / "corpus"
PROMPTS = ICI / "prompts"
PROMPTS_MANUELS = ICI / "prompts_manuels"
SORTIES = ICI / "sorties"
MANUEL = SORTIES / "manuel"            # réponses collées à la main : manuel/<document>/<lot>__<étape>.json
EXTRACTION = SORTIES / "extraction"    # un JSON assemblé par document
CSV_REFERENCE = RACINE / "docs" / "renovation" / "parametres_renovation.csv"
SEUIL_INVENTAIRE = 0.8                 # en dessous de 80 % des valeurs annoncées, un élément est « partiel »


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
    def message(e: Any) -> str:
        texte = re.sub(r" is not one of .*", " : valeur non autorisée", e.message)
        return re.sub(r" is not valid under any of the given schemas",
                      ' : attendu un nombre, une plage {"min": …, "max": …} ou « non_precise »', texte)
    return [f"{'/'.join(map(str, e.absolute_path)) or '(racine)'} : {message(e)}"
            for e in sorted(validateur.iter_errors(reponse), key=lambda e: list(map(str, e.absolute_path)))]


ETAPES = ("1_inventaire", "2_extraction", "3_relecture")   # trois messages d'une même conversation, par lot
PRIORITE_STATUT = {statut: rang for rang, statut in enumerate(STATUTS_COUVERTURE)}


def resultat_vide() -> dict[str, Any]:
    return {"document": None, "inventaire": [], "couverture": [], "observations": [], "hors_cadre": []}


def ajouter_inventaire(base: dict[str, Any], ajout: dict[str, Any], passe: str, lot: str) -> None:
    if ajout.get("document"):
        base["document"] = base["document"] or ajout["document"]
    base["inventaire"].extend({**e, "passe": passe, "lot": lot} for e in ajout["inventaire"])


def fusionner(base: dict[str, Any], ajout: dict[str, Any], passe: str, lot: str) -> None:
    """Ajoute inventaire, observations et valeurs hors cadre ; statut retenu : trouve > hors_cadre > non_rapporte."""
    ajouter_inventaire(base, ajout, passe, lot)
    base["observations"].extend({**obs, "passe": passe, "lot": lot} for obs in ajout["observations"])
    base["hors_cadre"].extend({**v, "passe": passe, "lot": lot} for v in ajout["hors_cadre"])
    couverture = {c["parametre"]: c for c in base["couverture"]}
    for c in ajout["couverture"]:
        existant = couverture.get(c["parametre"])
        if existant is None:
            c = dict(c)
            base["couverture"].append(c)
            couverture[c["parametre"]] = c
            continue
        if PRIORITE_STATUT[c["statut"]] < PRIORITE_STATUT[existant["statut"]]:
            existant["statut"] = c["statut"]
        if c["remarque"] and c["remarque"] != existant["remarque"]:
            existant["remarque"] = f"{existant['remarque']} | {passe} : {c['remarque']}".strip(" |")


def verifier_couverture(resultat: dict[str, Any], ids: list[str]) -> list[str]:
    """Paramètres sans entrée de couverture : le modèle les a sautés (à signaler, pas à corriger en silence)."""
    vus = {c["parametre"] for c in resultat["couverture"]}
    return [i for i in ids if i not in vus]


def aplatir_contexte(contexte: dict[str, Any]) -> dict[str, Any]:
    """ctx_<champ> ; un champ nombre_ou_plage donne aussi ctx_<champ>_min et ctx_<champ>_max."""
    sortie: dict[str, Any] = {}
    for nom, v in contexte.items():
        if isinstance(v, dict):
            mini, maxi = v.get("min"), v.get("max")
            sortie[f"ctx_{nom}"] = f"{'' if mini is None else mini}-{'' if maxi is None else maxi}"
            sortie[f"ctx_{nom}_min"], sortie[f"ctx_{nom}_max"] = mini, maxi
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            sortie[f"ctx_{nom}"] = sortie[f"ctx_{nom}_min"] = sortie[f"ctx_{nom}_max"] = v
        else:
            sortie[f"ctx_{nom}"] = v
    return sortie


def observations_a_plat(ext: dict[str, Any]) -> list[dict[str, Any]]:
    """Une ligne par valeur : une observation `valeur` donne une ligne (obs = « 3 »), une série une ligne par point
    (obs = « 3.1 », « 3.2 »…, avec x et la variable). Le contexte est mis à plat (ctx_…)."""
    lignes = []
    for i, obs in enumerate(ext["observations"], 1):
        commun = {k: v for k, v in obs.items() if k not in ("contexte", "points", "variable")}
        commun.update(aplatir_contexte(obs["contexte"]))
        variable = obs.get("variable") or {}
        commun.update({"variable": variable.get("nom", ""), "variable_description": variable.get("description", ""),
                       "unite_x": variable.get("unite", "")})
        if obs.get("forme") == "serie":
            for j, point in enumerate(obs["points"], 1):
                lignes.append({**commun, "obs": f"{i}.{j}", "x": point["x"], "valeur": point["valeur"],
                               "valeur_min": point["valeur_min"], "valeur_max": point["valeur_max"]})
        else:
            lignes.append({**commun, "obs": str(i), "x": None})
    return lignes


def bilan_inventaire(resultat: dict[str, Any]) -> list[dict[str, Any]]:
    """Pour chaque élément de l'inventaire : nombre de valeurs relevées (point de série, observation `valeur` ou entrée
    hors cadre) contre `n_valeurs` annoncé. Garde-fou, pas preuve de complétude : un élément absent de l'inventaire
    n'est contrôlé par rien."""
    releves: dict[tuple[str, str], int] = {}
    for obs in resultat["observations"]:
        cle = (obs["lot"], obs["source_inventaire"])
        releves[cle] = releves.get(cle, 0) + (len(obs["points"]) if obs.get("forme") == "serie" else 1)
    for h in resultat["hors_cadre"]:
        cle = (h["lot"], h["source_inventaire"])
        releves[cle] = releves.get(cle, 0) + 1
    lignes = []
    for e in resultat["inventaire"]:
        n = releves.get((e["lot"], e["id"]), 0)
        attendu = e.get("n_valeurs")
        if n == 0:
            statut = "non_traite"
        elif attendu is None:
            statut = "n_inconnu"
        elif n < SEUIL_INVENTAIRE * attendu:
            statut = "partiel"
        else:
            statut = "complet"
        lignes.append({"lot": e["lot"], "id": e["id"], "type": e["type"], "emplacement": e["emplacement"],
                       "page": e["page"], "parametres": ", ".join(e["parametres"]), "n_valeurs": attendu,
                       "n_releves": n, "statut": statut, "dimensions": " ; ".join(e["dimensions"]),
                       "contenu": e["contenu"], "passe": e["passe"]})
    return lignes


def references_inconnues(resultat: dict[str, Any]) -> list[str]:
    """Observations et entrées hors cadre dont `source_inventaire` ne désigne aucun élément de l'inventaire du lot."""
    connus = {(e["lot"], e["id"]) for e in resultat["inventaire"]}
    return sorted({f"{x['lot']} : {x['source_inventaire'] or '(vide)'}"
                   for x in resultat["observations"] + resultat["hors_cadre"]
                   if (x["lot"], x["source_inventaire"]) not in connus})


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
