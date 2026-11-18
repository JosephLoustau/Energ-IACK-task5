"""Chargement de parametres.yaml et construction du schéma JSON imposé à la sortie de Claude."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ICI = Path(__file__).resolve().parent
FICHIER_PARAMETRES = ICI / "parametres.yaml"

NON_PRECISE = "non_precise"
STATUTS_COUVERTURE = ["trouve", "non_rapporte", "incertain"]
LECTURES = ["texte", "tableau", "figure"]
TYPES_DOCUMENT = ["article", "rapport", "these", "norme", "base_de_donnees", "autre"]


def charger_parametres(chemin: Path = FICHIER_PARAMETRES) -> dict[str, Any]:
    with chemin.open(encoding="utf-8") as f:
        config = yaml.safe_load(f)
    ids = [p["id"] for p in config["parametres"]]
    doublons = {i for i in ids if ids.count(i) > 1}
    if doublons:
        raise ValueError(f"Identifiants de paramètres en double : {sorted(doublons)}")
    inconnus = {c for p in config["parametres"] for c in p["contexte"]} - set(config["contextes"])
    if inconnus:
        raise ValueError(f"Champs de contexte utilisés mais non définis dans `contextes` : {sorted(inconnus)}")
    dans_lots = [f for lot in config["lots"].values() for f in lot["familles"]]
    if sorted(dans_lots) != familles(config):
        raise ValueError(f"Chaque famille doit être dans exactement un lot : lots {sorted(dans_lots)}, "
                         f"familles {familles(config)}")
    return config


def familles(config: dict[str, Any]) -> list[str]:
    return sorted({p["famille"] for p in config["parametres"]})


def lots(config: dict[str, Any], decoupe: bool = True) -> list[tuple[str, list[str]]]:
    """Groupes de paramètres traités ensemble : [(nom, ids)]. Sans découpe, un seul lot « tout »."""
    if not decoupe:
        return [("tout", [p["id"] for p in config["parametres"]])]
    return [(nom, [p["id"] for p in config["parametres"] if p["famille"] in lot["familles"]])
            for nom, lot in config["lots"].items()]


def _nullable(type_: str) -> dict[str, Any]:
    return {"type": [type_, "null"]}


def _objet(proprietes: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": proprietes, "required": list(proprietes), "additionalProperties": False}


def _schema_contexte(contextes: dict[str, Any]) -> dict[str, Any]:
    """Liste fermée -> enum (avec non_precise) ; sinon chaîne libre (« non_precise » si absent du document)."""
    proprietes = {}
    for nom, spec in contextes.items():
        valeurs = spec.get("valeurs")
        if isinstance(valeurs, list):
            proprietes[nom] = {"type": "string", "enum": sorted(set(valeurs) | {NON_PRECISE})}
        else:
            proprietes[nom] = {"type": "string", "description": spec.get("description", nom)}
    return _objet(proprietes)


def schema_sortie(config: dict[str, Any], ids_parametres: list[str]) -> dict[str, Any]:
    """Schéma JSON de la réponse : document, couverture de chaque paramètre, observations, autres valeurs."""
    id_parametre = {"type": "string", "enum": ids_parametres}
    observation = _objet({
        "parametre": id_parametre,
        "element": {"type": "string"},
        "valeur": _nullable("number"),
        "valeur_min": _nullable("number"),
        "valeur_max": _nullable("number"),
        "unite": {"type": "string"},
        "citation": {"type": "string"},
        "page": _nullable("integer"),
        "emplacement": {"type": "string"},
        "lecture": {"type": "string", "enum": LECTURES},
        "source_primaire": _nullable("string"),
        "contexte": _schema_contexte(config["contextes"]),
        "remarque": {"type": "string"},
    })
    return _objet({
        "document": _objet({
            "titre": {"type": "string"},
            "auteurs": {"type": "string"},
            "annee_publication": _nullable("integer"),
            "langue": {"type": "string"},
            "type_document": {"type": "string", "enum": TYPES_DOCUMENT},
            "perimetre_etude": {"type": "string"},
        }),
        "couverture": {"type": "array", "items": _objet({
            "parametre": id_parametre,
            "statut": {"type": "string", "enum": STATUTS_COUVERTURE},
            "remarque": {"type": "string"},
        })},
        "observations": {"type": "array", "items": observation},
        "autres_valeurs": {"type": "array", "items": _objet({
            "grandeur": {"type": "string"},
            "valeur": _nullable("number"),
            "unite": {"type": "string"},
            "citation": {"type": "string"},
            "page": _nullable("integer"),
            "emplacement": {"type": "string"},
            "pertinence": {"type": "string"},
        })},
    })


def _ligne(texte: str) -> str:
    return " ".join(str(texte).split())


def texte_parametres(config: dict[str, Any], ids_parametres: list[str]) -> str:
    """Liste des paramètres pour le prompt. `valeur_modele` est volontairement omise pour ne pas orienter la lecture."""
    blocs = []
    for p in config["parametres"]:
        if p["id"] not in ids_parametres:
            continue
        lignes = [
            f"## {p['id']} ({p['famille']})",
            f"Définition : {_ligne(p['definition'])}",
            f"Unité de référence : {p['unite']} (relever l'unité d'origine, sans convertir)",
            f"Contexte à chercher : {', '.join(p['contexte'])}",
        ]
        if p.get("mots_cles"):
            lignes.append("Mots-clés : " + " ; ".join(f"{langue} : {', '.join(mots)}" for langue, mots in p["mots_cles"].items()))
        if p.get("remarque"):
            lignes.append(f"Remarque : {_ligne(p['remarque'])}")
        blocs.append("\n".join(lignes))
    return "\n\n".join(blocs)


def texte_contextes(config: dict[str, Any]) -> str:
    lignes = []
    for nom, spec in config["contextes"].items():
        valeurs = spec.get("valeurs")
        valeurs = ", ".join(valeurs) if isinstance(valeurs, list) else valeurs
        description = f" {_ligne(spec['description'])}" if spec.get("description") else ""
        exemples = f" Exemples : {', '.join(spec['exemples'])}." if spec.get("exemples") else ""
        lignes.append(f"- {nom} :{description} Valeurs : {valeurs}.{exemples}")
    return "\n".join(lignes)
