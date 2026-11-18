"""Génère les prompts à copier-coller dans le chat (mode manuel), à partir de parametres.yaml et de prompts/.

    python litterature/generer_prompts.py

Écrit litterature/prompts_manuels/ : pour chaque lot, trois messages à envoyer dans la même conversation
(<lot>__1_inventaire.md, <lot>__2_extraction.md, <lot>__3_relecture.md). À relancer après toute modification de
parametres.yaml ou de prompts/ : ne pas modifier les fichiers générés à la main.
"""
from __future__ import annotations

import json
import shutil
from typing import Any

from commun import ETAPES, PROMPTS_MANUELS, prompt
from schema import (NON_PRECISE, RAISONS_HORS_CADRE, charger_parametres, lots, texte_contextes, texte_parametres,
                    texte_raisons, texte_variables)

DOCUMENT_EXEMPLE = {"titre": "…", "auteurs": "…", "annee_publication": 2020, "langue": "de", "type_document": "rapport",
                    "perimetre_etude": "ex. 120 immeubles locatifs, Suisse, 2010-2018"}


def _json(donnees: Any) -> str:
    return json.dumps(donnees, ensure_ascii=False, indent=2)


def exemples(ids: list[str]) -> dict[str, Any]:
    """Exemples cohérents avec le lot (valeur isolée, série, loi) : un exemple hors sujet induirait le modèle en erreur."""
    if "cout_investissement_production_chaleur" in ids and "cout_investissement_pv" in ids:
        return {
            "valeur": {"parametre": "cout_investissement_pv", "element": "pv", "valeur": 1450.0, "unite": "CHF/kWp",
                       "contexte": {"element": "pv", "base_surface": "kWc", "puissance_kw": {"min": 10, "max": 30}},
                       "contenu": "prix des installations PV par classe de puissance",
                       "dimensions": ["classe de puissance (3 lignes)"]},
            "serie": {"parametre": "cout_investissement_production_chaleur", "element": "pac_air_eau", "unite": "kCHF",
                      "variable": {"nom": "puissance", "description": "puissance thermique installée", "unite": "kW"},
                      "points": [(5, 48.0), (10, 53.0)], "lecture": "figure", "emplacement": "Fig. 7",
                      "citation": "Fig. 7 : courbe « PAC air/eau », axe x puissance [kW], axe y coût [kCHF]",
                      "contexte": {"element": "pac_air_eau", "base_surface": "installation"},
                      "contenu": "coût d'investissement selon la puissance installée", "dimensions": ["puissance (kW)"]},
            "loi": {"parametre": "cout_investissement_production_chaleur", "unite": "EUR",
                    "description": "C = 2100 · P^0.72 (C en EUR, P en kW), valable de 10 à 400 kW, R² = 0.81, n = 54"},
        }
    if "cout_investissement_enveloppe" in ids:
        return {
            "valeur": {"parametre": "cout_investissement_enveloppe", "element": "fenetres", "valeur": 1000.0,
                       "unite": "CHF/m2", "contexte": {"element": "fenetres", "base_surface": "m2_fenetre"},
                       "contenu": "coûts de remplacement des fenêtres", "dimensions": []},
            "serie": {"parametre": "cout_investissement_enveloppe", "element": "facade", "unite": "CHF/m2",
                      "variable": {"nom": "epaisseur", "description": "épaisseur d'isolant", "unite": "cm"},
                      "points": [(12, 175.0), (16, 196.0)], "lecture": "tableau", "emplacement": "Tab. 5",
                      "citation": "Épaisseur [cm] 12 16 20 Façade [CHF/m²] 175 196 214",
                      "contexte": {"element": "facade", "base_surface": "m2_element"},
                      "contenu": "coût d'isolation de façade selon l'épaisseur", "dimensions": ["épaisseur (cm)"]},
            "loi": {"parametre": "cout_investissement_enveloppe", "unite": "CHF/m2",
                    "description": "C = 91.1 + 2.6 · e (C en CHF/m², e en cm), valable de 8 à 24 cm"},
        }
    return {
        "valeur": {"parametre": ids[0], "element": "paquet_complet", "valeur": 0.65, "unite": "-",
                   "contexte": {"element": "paquet_complet", "nature": "mesure_terrain"},
                   "contenu": "résultats mesurés après rénovation", "dimensions": []},
        "serie": {"parametre": ids[0], "element": "paquet_complet", "unite": "-",
                  "variable": {"nom": "consommation", "description": "consommation avant rénovation", "unite": "kWh/m2a"},
                  "points": [(150, 0.55), (250, 0.70)], "lecture": "tableau", "emplacement": "Tab. 5",
                  "citation": "Consommation avant [kWh/m²a] 150 250 350 Part réalisée 0.55 0.70 0.78",
                  "contexte": {"element": "paquet_complet", "nature": "mesure_terrain"},
                  "contenu": "résultat selon la consommation avant rénovation",
                  "dimensions": ["consommation (kWh/m²a)"]},
        "loi": {"parametre": ids[0], "unite": "-",
                "description": "r = 0.30 + 0.0016 · E (E en kWh/m²a), valable de 100 à 350 kWh/m²a, R² = 0.6, n = 40"},
    }


def exemple_inventaire(ids: list[str]) -> str:
    ex = exemples(ids)
    return _json({
        "document": DOCUMENT_EXEMPLE,
        "inventaire": [
            {"id": "I1", "type": "tableau", "emplacement": "Tab. 4", "page": 12, "contenu": ex["valeur"]["contenu"],
             "dimensions": ex["valeur"]["dimensions"], "n_valeurs": 3, "parametres": [ex["valeur"]["parametre"]]},
            {"id": "I2", "type": ex["serie"]["lecture"], "emplacement": ex["serie"]["emplacement"], "page": 31,
             "contenu": ex["serie"]["contenu"], "dimensions": ex["serie"]["dimensions"], "n_valeurs": 6,
             "parametres": [ex["serie"]["parametre"]]},
            {"id": "I3", "type": "formule", "emplacement": "Éq. 3", "page": 45, "contenu": "relation ajustée",
             "dimensions": [], "n_valeurs": 1, "parametres": [ex["loi"]["parametre"]]},
            "… un élément par tableau, figure, formule ou passage chiffré pertinent …",
        ],
    })


def exemple_sortie(config: dict[str, Any], ids: list[str]) -> str:
    ex = exemples(ids)
    contexte = {nom: NON_PRECISE for nom in config["contextes"]}
    contexte.update({"annee_prix": "2019", "devise": "CHF", "pays": "CH", "nature": "enquete_prix"})
    commun = {"valeur_min": None, "valeur_max": None, "source_primaire": None, "remarque": ""}
    v, s = ex["valeur"], ex["serie"]
    return _json({
        "inventaire": [],
        "couverture": [
            {"parametre": ids[0], "statut": "trouve", "remarque": ""},
            {"parametre": ids[1 % len(ids)], "statut": "non_rapporte", "remarque": ""},
            "… une entrée pour CHAQUE paramètre de la liste …",
        ],
        "observations": [
            {"forme": "valeur", "parametre": v["parametre"], "source_inventaire": "I1", "element": v["element"],
             "valeur": v["valeur"], **commun, "variable": None, "points": [], "unite": v["unite"],
             "citation": "copie exacte de la phrase ou de la ligne de tableau (avec son en-tête)", "page": 12,
             "emplacement": "Tab. 4", "lecture": "tableau", "contexte": {**contexte, **v["contexte"]}},
            {"forme": "serie", "parametre": s["parametre"], "source_inventaire": "I2", "element": s["element"],
             "valeur": None, **commun, "variable": s["variable"],
             "points": [{"x": x, "valeur": y, "valeur_min": None, "valeur_max": None} for x, y in s["points"]]
             + ["… tous les points, dans l'ordre …"],
             "unite": s["unite"], "citation": s["citation"], "page": 31, "emplacement": s["emplacement"],
             "lecture": s["lecture"], "contexte": {**contexte, **s["contexte"]}},
            "… une observation par valeur isolée, une série par ligne de tableau ou par courbe …",
        ],
        "hors_cadre": [
            {"parametre": ex["loi"]["parametre"], "raison": "loi", "source_inventaire": "I3",
             "description": ex["loi"]["description"], "valeur": None, "valeur_min": None, "valeur_max": None,
             "unite": ex["loi"]["unite"], "citation": "…", "page": 45, "emplacement": "Éq. 3"},
            {"parametre": None, "raison": "hors_liste", "source_inventaire": "I4",
             "description": "grandeur et pourquoi elle compte pour estimer une rénovation",
             "valeur": 0.8, "valeur_min": None, "valeur_max": None, "unite": "…", "citation": "…", "page": 20,
             "emplacement": "§3.2"},
        ],
    })


def main() -> None:
    config = charger_parametres()
    systeme = prompt("systeme", contextes=texte_contextes(config), variables=texte_variables(config),
                     raisons=texte_raisons())
    if PROMPTS_MANUELS.exists():
        shutil.rmtree(PROMPTS_MANUELS)
    PROMPTS_MANUELS.mkdir(parents=True)

    fichiers = []
    for nom, ids in lots(config, decoupe=False) + lots(config):
        textes = {
            "1_inventaire": "\n\n".join([
                systeme,
                prompt("inventaire", parametres=texte_parametres(config, ids), exemple=exemple_inventaire(ids)),
            ]),
            "2_extraction": "\n\n".join([
                prompt("extraction", lot=nom),
                prompt("format_manuel", exemple=exemple_sortie(config, ids), ids=", ".join(ids),
                       variables=", ".join(config["variables_serie"]), raisons=", ".join(RAISONS_HORS_CADRE)),
            ]),
            "3_relecture": prompt("relecture_manuelle", lot=nom, ids=", ".join(ids)),
        }
        assert tuple(textes) == ETAPES
        for etape, texte in textes.items():
            chemin = PROMPTS_MANUELS / f"{nom}__{etape}.md"
            chemin.write_text(texte, encoding="utf-8")
            fichiers.append(chemin)

    tous = "\n".join(f"- {p['id']} : {' '.join(p['definition'].split())}" for p in config["parametres"])
    chemin = PROMPTS_MANUELS / "decouverte.md"
    chemin.write_text(prompt("decouverte", ids=tous), encoding="utf-8")
    fichiers.append(chemin)

    for chemin in fichiers:
        print(f"{chemin.relative_to(PROMPTS_MANUELS.parent)}  ({len(chemin.read_text(encoding='utf-8')):,} car.)")


if __name__ == "__main__":
    main()
