"""Chargement de parametres.yaml, schémas JSON imposés aux réponses de Claude et contrôles de cohérence."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ICI = Path(__file__).resolve().parent
FICHIER_PARAMETRES = ICI / "parametres.yaml"

NON_PRECISE = "non_precise"
NOMBRE_OU_PLAGE = "nombre_ou_plage"
HORS_LISTE = "hors_liste"
STATUTS_COUVERTURE = ["trouve", "hors_cadre", "non_rapporte"]   # par ordre de priorité à la fusion
FORMES = ["valeur", "serie"]
LECTURES = ["texte", "tableau", "figure"]
TYPES_DOCUMENT = ["article", "rapport", "these", "norme", "base_de_donnees", "autre"]
TYPES_INVENTAIRE = ["tableau", "figure", "formule", "texte"]
RAISONS_HORS_CADRE = {
    "dependance_non_prevue": "la valeur dépend d'une grandeur qu'aucun champ ne permet de noter (ex. longueur de "
                             "raccordement), ou de deux grandeurs à la fois",
    "definition_differente": "grandeur proche mais pas identique à la définition du paramètre",
    "valeur_composite": "plusieurs mesures ou postes confondus, non séparables",
    "loi": "formule, régression ou relation paramétrique : recopier dans `description` l'expression, les coefficients, "
           "le domaine de validité et la qualité de l'ajustement (R², n), sans l'évaluer",
    "forme_non_supportee": "distribution, histogramme, carte, tableau à plus de deux entrées…",
    "relation_qualitative": "le document décrit comment la valeur varie (dégressive avec la taille, croissante avec…), "
                            "sans la chiffrer ou en plus de la chiffrer",
    HORS_LISTE: "grandeur utile pour estimer le coût, l'économie d'énergie ou les émissions d'une rénovation, absente "
                "de la liste (parametre = null)",
    "autre": "à expliquer dans `description`",
}


def charger_parametres(chemin: Path = FICHIER_PARAMETRES) -> dict[str, Any]:
    with chemin.open(encoding="utf-8") as f:
        config = yaml.safe_load(f)
    ids = [p["id"] for p in config["parametres"]]
    doublons = {i for i in ids if ids.count(i) > 1}
    if doublons:
        raise ValueError(f"Identifiants de paramètres en double : {sorted(doublons)}")
    if HORS_LISTE in ids:
        raise ValueError(f"« {HORS_LISTE} » est réservé (inventaire) : ne pas l'utiliser comme identifiant de paramètre")
    inconnus = {c for p in config["parametres"] for c in p["contexte"]} - set(config["contextes"])
    if inconnus:
        raise ValueError(f"Champs de contexte utilisés mais non définis dans `contextes` : {sorted(inconnus)}")
    dans_lots = [f for lot in config["lots"].values() for f in lot["familles"]]
    if sorted(dans_lots) != familles(config):
        raise ValueError(f"Chaque famille doit être dans exactement un lot : lots {sorted(dans_lots)}, "
                         f"familles {familles(config)}")
    if "autre" not in config.get("variables_serie", {}):
        raise ValueError("`variables_serie` doit exister et contenir « autre »")
    return config


def familles(config: dict[str, Any]) -> list[str]:
    return sorted({p["famille"] for p in config["parametres"]})


def lots(config: dict[str, Any], decoupe: bool = True) -> list[tuple[str, list[str]]]:
    """Groupes de paramètres traités ensemble : [(nom, ids)]. Sans découpe, un seul lot « tout »."""
    if not decoupe:
        return [("tout", [p["id"] for p in config["parametres"]])]
    return [(nom, [p["id"] for p in config["parametres"] if p["famille"] in lot["familles"]])
            for nom, lot in config["lots"].items()]


def contextes_plage(config: dict[str, Any]) -> list[str]:
    return [nom for nom, spec in config["contextes"].items() if spec.get("valeurs") == NOMBRE_OU_PLAGE]


# --- Schémas JSON ---------------------------------------------------------------------------------------------------

def _nullable(type_: str) -> dict[str, Any]:
    return {"type": [type_, "null"]}


def _objet(proprietes: dict[str, Any], nullable: bool = False) -> dict[str, Any]:
    return {"type": ["object", "null"] if nullable else "object", "properties": proprietes,
            "required": list(proprietes), "additionalProperties": False}


PLAGE = {"anyOf": [{"type": "number"}, {"const": NON_PRECISE},
                   _objet({"min": _nullable("number"), "max": _nullable("number")})]}


def _schema_contexte(contextes: dict[str, Any]) -> dict[str, Any]:
    """Liste fermée -> enum (avec non_precise) ; nombre_ou_plage -> nombre, {min, max} ou non_precise ; sinon chaîne."""
    proprietes = {}
    for nom, spec in contextes.items():
        valeurs = spec.get("valeurs")
        if isinstance(valeurs, list):
            proprietes[nom] = {"type": "string", "enum": sorted(set(valeurs) | {NON_PRECISE})}
        elif valeurs == NOMBRE_OU_PLAGE:
            proprietes[nom] = PLAGE
        else:
            proprietes[nom] = {"type": "string", "description": spec.get("description", nom)}
    return _objet(proprietes)


def _schema_document() -> dict[str, Any]:
    return _objet({
        "titre": {"type": "string"},
        "auteurs": {"type": "string"},
        "annee_publication": _nullable("integer"),
        "langue": {"type": "string"},
        "type_document": {"type": "string", "enum": TYPES_DOCUMENT},
        "perimetre_etude": {"type": "string"},
    })


def _schema_element_inventaire(ids_parametres: list[str]) -> dict[str, Any]:
    return _objet({
        "id": {"type": "string", "minLength": 1},
        "type": {"type": "string", "enum": TYPES_INVENTAIRE},
        "emplacement": {"type": "string"},
        "page": _nullable("integer"),
        "contenu": {"type": "string"},
        "dimensions": {"type": "array", "items": {"type": "string"}},
        "n_valeurs": _nullable("integer"),
        "parametres": {"type": "array", "minItems": 1, "items": {"type": "string", "enum": ids_parametres + [HORS_LISTE]}},
    })


def schema_inventaire(config: dict[str, Any], ids_parametres: list[str]) -> dict[str, Any]:
    """Premier message d'un lot : métadonnées du document et inventaire des éléments chiffrés."""
    return _objet({
        "document": _schema_document(),
        "inventaire": {"type": "array", "items": _schema_element_inventaire(ids_parametres)},
    })


def schema_sortie(config: dict[str, Any], ids_parametres: list[str]) -> dict[str, Any]:
    """Extraction et relecture : éléments ajoutés à l'inventaire, couverture, observations, valeurs hors cadre."""
    id_parametre = {"type": "string", "enum": ids_parametres}
    point = _objet({"x": {"type": "number"}, "valeur": _nullable("number"),
                    "valeur_min": _nullable("number"), "valeur_max": _nullable("number")})
    observation = _objet({
        "forme": {"type": "string", "enum": FORMES},
        "parametre": id_parametre,
        "source_inventaire": {"type": "string"},
        "element": {"type": "string"},
        "valeur": _nullable("number"),
        "valeur_min": _nullable("number"),
        "valeur_max": _nullable("number"),
        "variable": _objet({"nom": {"type": "string", "enum": list(config["variables_serie"])},
                            "description": {"type": "string"}, "unite": {"type": "string"}}, nullable=True),
        "points": {"type": "array", "items": point},
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
        "inventaire": {"type": "array", "items": _schema_element_inventaire(ids_parametres)},
        "couverture": {"type": "array", "items": _objet({
            "parametre": id_parametre,
            "statut": {"type": "string", "enum": STATUTS_COUVERTURE},
            "remarque": {"type": "string"},
        })},
        "observations": {"type": "array", "items": observation},
        "hors_cadre": {"type": "array", "items": _objet({
            "parametre": {"enum": ids_parametres + [None]},
            "raison": {"type": "string", "enum": list(RAISONS_HORS_CADRE)},
            "description": {"type": "string", "minLength": 1},
            "source_inventaire": {"type": "string"},
            "valeur": _nullable("number"),
            "valeur_min": _nullable("number"),
            "valeur_max": _nullable("number"),
            "unite": {"type": "string"},
            "citation": {"type": "string"},
            "page": _nullable("integer"),
            "emplacement": {"type": "string"},
        })},
    })


def controler_coherence(reponse: dict[str, Any]) -> list[str]:
    """Règles qu'un schéma JSON exprime mal (dépendances entre champs), avec des messages lisibles."""
    erreurs = []
    for i, obs in enumerate(reponse.get("observations", [])):
        ou = f"observations/{i} ({obs.get('parametre')}, {obs.get('emplacement')})"
        scalaires = [obs.get(k) for k in ("valeur", "valeur_min", "valeur_max")]
        if obs.get("forme") == "valeur":
            if obs.get("points") or obs.get("variable") is not None:
                erreurs.append(f"{ou} : forme « valeur » avec `points` ou `variable` : utiliser la forme « serie »")
            if all(v is None for v in scalaires):
                erreurs.append(f"{ou} : forme « valeur » sans valeur ni plage")
        elif obs.get("forme") == "serie":
            if obs.get("variable") is None:
                erreurs.append(f"{ou} : forme « serie » sans `variable`")
            if len(obs.get("points") or []) < 2:
                erreurs.append(f"{ou} : forme « serie » avec moins de deux points : utiliser la forme « valeur »")
            if any(v is not None for v in scalaires):
                erreurs.append(f"{ou} : forme « serie » : `valeur`, `valeur_min` et `valeur_max` doivent être null "
                               "(les valeurs vont dans `points`)")
            for j, p in enumerate(obs.get("points") or []):
                if all(p.get(k) is None for k in ("valeur", "valeur_min", "valeur_max")):
                    erreurs.append(f"{ou} : point {j} (x = {p.get('x')}) sans valeur")
        for nom, v in obs.get("contexte", {}).items():
            if isinstance(v, dict) and v.get("min") is not None and v.get("max") is not None and v["min"] > v["max"]:
                erreurs.append(f"{ou} : contexte {nom} : min > max")
    for i, h in enumerate(reponse.get("hors_cadre", [])):
        if h.get("raison") == HORS_LISTE and h.get("parametre") is not None:
            erreurs.append(f"hors_cadre/{i} : raison « {HORS_LISTE} » mais parametre = {h['parametre']} "
                           "(mettre null, ou choisir une autre raison)")
    return erreurs


# --- Textes pour les prompts ----------------------------------------------------------------------------------------

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
        if isinstance(valeurs, list):
            valeurs = ", ".join(valeurs)
        elif valeurs == NOMBRE_OU_PLAGE:
            valeurs = 'nombre, plage {"min": …, "max": …} ou non_precise'
        description = f" {_ligne(spec['description'])}" if spec.get("description") else ""
        exemples = f" Exemples : {', '.join(spec['exemples'])}." if spec.get("exemples") else ""
        lignes.append(f"- {nom} :{description} Valeurs : {valeurs}.{exemples}")
    return "\n".join(lignes)


def texte_variables(config: dict[str, Any]) -> str:
    return "\n".join(f"- {nom} : {_ligne(desc)}" for nom, desc in config["variables_serie"].items())


def texte_raisons() -> str:
    lignes = [f"   - `{nom}` : {desc} ;" for nom, desc in RAISONS_HORS_CADRE.items()]
    lignes[-1] = lignes[-1][:-2] + "."
    return "\n".join(lignes)
