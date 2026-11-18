# Confrontation du modèle de rénovation à la littérature

Extraction des valeurs de la littérature correspondant aux paramètres du modèle
([src/renovation.ts](../src/renovation.ts), [src/model.ts](../src/model.ts)), puis comparaison avec les valeurs du modèle.
Claude lit les documents (étapes 2-3, à la main dans le chat) ; tout le reste est du code, sans LLM.

| Étape | Mode manuel | Sortie (dans `sorties/`) |
|---|---|---|
| 1. Liste de paramètres | éditer [parametres.yaml](parametres.yaml), puis `generer_prompts.py` | `prompts_manuels/` |
| 2. Extraction | prompt `…__1_extraction.md` dans le chat | réponse collée dans `manuel/<DOC>/` |
| 3. Relecture | prompt `…__2_relecture.md`, même conversation | réponse collée dans `manuel/<DOC>/` |
| 2-3. Assemblage | `assembler.py` | `extraction/<DOC>.json` |
| 4. Vérification des citations | `verifier.py`, puis contrôle à la main | `observations.csv`, `decisions.csv` |
| 5. Évaluation contre le relevé manuel | `evaluer.py` | `evaluation.csv`, `evaluation_en_plus.csv` |
| 6. Normalisation | `normaliser.py` ([conversions.yaml](conversions.yaml)) | `observations_normalisees.csv` |
| 7. Agrégation | `agreger.py` | `agregats.csv` |
| 8. Comparaison | `comparer.py`, puis `prompt_commentaire.md` dans le chat | `comparaison.csv` |

`corpus/` (PDF) et `sorties/` ne sont pas versionnés.

## Installation

```bash
cd litterature
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Toutes les commandes ci-dessous se lancent depuis `litterature/` avec `.venv/bin/python`.

## Mode manuel, document par document

### Préparer
- Déposer le PDF dans `corpus/`, nommé d'après son identifiant de source dans
  [docs/renovation/sources.csv](../docs/renovation/sources.csv) (ex. `GRANDJEAN2021.pdf`). Un morceau d'une étude
  découpée prend un suffixe après deux tirets bas (`STREICHER2020__paperIII.pdf`) : tous les morceaux d'une même
  étude partagent le préfixe et ne comptent que pour une source. Ce nom `<DOC>` relie toutes les étapes.
- Choisir les prompts :
  - document court (moins de ~30 pages) : `tout__1_extraction.md` puis `tout__2_relecture.md` ;
  - document long : les trois lots `A_enveloppe`, `B_systemes`, `C_performance_economie`, chacun avec son extraction
    puis sa relecture. Une conversation par lot donne de meilleurs résultats qu'une seule longue conversation.

### Dans le chat (claude.ai)
1. Nouvelle conversation, joindre le PDF, coller tout le contenu du prompt `…__1_extraction.md`.
2. Copier la réponse (le bloc JSON) dans `sorties/manuel/<DOC>/<lot>__1_extraction.json`.
   Si la réponse se termine par « SUITE », écrire « Continue » et ranger la suite dans `…__1_extraction_2.json`
   (puis `_3`…).
3. Dans la même conversation, coller `…__2_relecture.md` ; ranger la réponse dans `<lot>__2_relecture.json`.

Exemple pour un document court :
```
sorties/manuel/GRANDJEAN2021/tout__1_extraction.json
sorties/manuel/GRANDJEAN2021/tout__2_relecture.json
```

### Assembler et vérifier
```bash
.venv/bin/python assembler.py GRANDJEAN2021
```
Chaque réponse est contrôlée (JSON lisible, champs obligatoires, valeurs autorisées). En cas d'erreur, le document
n'est pas assemblé et le message indique le fichier et le champ : corriger le fichier à la main, ou demander dans la
conversation « Ta réponse n'est pas conforme : <message>. Renvoie le bloc JSON complet corrigé. »

Les paramètres sans entrée de couverture (sautés par le modèle) sont signalés : on peut redemander dans la conversation
« Tu n'as pas donné de statut pour : <liste>. Complète au même format. » et ranger la réponse comme une partie
supplémentaire de la relecture (`…__2_relecture_2.json`).

## Étapes suivantes (sur tous les documents assemblés)

```bash
.venv/bin/python verifier.py      # 4
.venv/bin/python evaluer.py       # 5
.venv/bin/python normaliser.py    # 6
.venv/bin/python agreger.py       # 7
.venv/bin/python comparer.py      # 8
```

- **4, contrôle manuel** : `decisions.csv` liste les observations dont la citation n'a pas été retrouvée dans le PDF ou
  ne contient pas la valeur (`a_revoir`), et celles lues sur une figure (`figure`). Pour chacune, ouvrir le PDF à la
  page indiquée et remplir `decision` : `garder`, `exclure` ou `corriger` (avec `valeur_corrigee`). Ce fichier n'est
  jamais écrasé ; les lignes `a_revoir` sans décision sont écartées à l'étape 6.
- **5** : le rappel est mesuré sur les nombres du relevé manuel (qui n'est pas exhaustif : c'est une borne basse).
  Contrôler un échantillon de `evaluation_en_plus.csv` (colonne `controle` : `juste` / `faux`) pour estimer la précision.
- **6** : compléter [conversions.yaml](conversions.yaml) au fil de l'eau : unités listées dans
  `unites_inconnues.csv`, indices de prix OFS et taux de change BNS (vides au départ : les montants restent alors
  nominaux, et les montants en devise étrangère sont écartés).
- **8** : `comparaison.csv` place chaque valeur du modèle dans la distribution de la littérature, avec des alertes.
  `prompt_commentaire.md` est prêt à coller dans le chat pour une lecture commentée des écarts.

## Enrichir la liste de paramètres

1. Passe « découverte » : sur 10 à 15 documents variés, coller `prompts_manuels/decouverte.md` avec le PDF. Le modèle
   liste toutes les grandeurs chiffrées et celles qui manquent à la liste.
2. Regrouper les grandeurs récurrentes de `sorties/autres_valeurs.csv`.
3. Test de dispersion : deux valeurs d'un même paramètre qui diffèrent de plus d'un facteur 2 sans qu'aucun champ de
   contexte ne l'explique signalent un champ de contexte manquant.

Après toute modification de `parametres.yaml` ou de `prompts/` : relancer `generer_prompts.py`. Les extractions faites
avec l'ancienne liste restent utilisables si on n'a fait qu'ajouter des paramètres ; ré-extraire si des définitions ont
changé.

## Choix

- **La liste de paramètres pilote tout** : prompts et format de sortie sont générés depuis `parametres.yaml`.
- **Les valeurs du modèle ne sont pas montrées à Claude**, pour ne pas orienter la lecture.
- **Couverture explicite** : pour chaque paramètre, `trouve`, `non_rapporte` ou `incertain` ; un oubli se voit.
- **Valeurs brutes à l'extraction** (unité, devise, année des prix d'origine) ; toute conversion est faite en code, à
  partir de tables explicites.
- **Citation et page obligatoires**, vérifiées automatiquement contre le texte du PDF.
- **Une source = une voix** dans les statistiques : les valeurs reprises d'une même source primaire ne comptent qu'une fois.
