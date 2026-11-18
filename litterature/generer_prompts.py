"""Génère les prompts à copier-coller dans le chat (mode manuel), à partir de parametres.yaml et de prompts/.

    python litterature/generer_prompts.py

Écrit litterature/prompts_manuels/. À relancer après toute modification de parametres.yaml ou de prompts/ :
ne pas modifier les fichiers générés à la main.
"""
from __future__ import annotations

import json
import shutil
from typing import Any

from commun import PROMPTS_MANUELS, prompt
from schema import charger_parametres, lots, texte_contextes, texte_parametres


def exemple_json(config: dict[str, Any], ids: list[str]) -> str:
    contexte = {nom: "non_precise" for nom in config["contextes"]}
    contexte.update({"element": "facade", "base_surface": "m2_element", "annee_prix": "2019", "devise": "CHF",
                     "pays": "CH", "nature": "enquete_prix"})
    exemple = {
        "document": {"titre": "…", "auteurs": "…", "annee_publication": 2020, "langue": "de",
                     "type_document": "rapport", "perimetre_etude": "ex. 120 immeubles locatifs, Suisse, 2010-2018"},
        "couverture": [
            {"parametre": ids[0], "statut": "trouve", "remarque": ""},
            {"parametre": ids[1], "statut": "non_rapporte", "remarque": ""},
            "… une entrée pour CHAQUE paramètre de la liste …",
        ],
        "observations": [{
            "parametre": ids[0], "element": "facade", "valeur": 185.0, "valeur_min": None, "valeur_max": None,
            "unite": "CHF/m2", "citation": "copie exacte de la phrase ou de la ligne de tableau (avec son en-tête)",
            "page": 12, "emplacement": "Tab. 4", "lecture": "tableau", "source_primaire": None,
            "contexte": contexte, "remarque": "",
        }, "… une observation par valeur distincte …"],
        "autres_valeurs": [{
            "grandeur": "…", "valeur": None, "unite": "…", "citation": "…", "page": None, "emplacement": "…",
            "pertinence": "pourquoi cette valeur compte pour estimer une rénovation",
        }],
    }
    return json.dumps(exemple, ensure_ascii=False, indent=2)


def main() -> None:
    config = charger_parametres()
    systeme = prompt("systeme", contextes=texte_contextes(config))
    if PROMPTS_MANUELS.exists():
        shutil.rmtree(PROMPTS_MANUELS)
    PROMPTS_MANUELS.mkdir(parents=True)

    fichiers = []
    for nom, ids in lots(config, decoupe=False) + lots(config):
        extraction = "\n\n".join([
            systeme,
            prompt("format_manuel", exemple=exemple_json(config, ids)),
            prompt("extraction", parametres=texte_parametres(config, ids)),
        ])
        relecture = prompt("relecture_manuelle", lot=nom, ids=", ".join(ids))
        for etape, texte in (("1_extraction", extraction), ("2_relecture", relecture)):
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
