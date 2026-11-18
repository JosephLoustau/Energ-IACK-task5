# Confrontation du modèle de rénovation à la littérature

Extraction des valeurs de la littérature correspondant aux paramètres du modèle
([src/renovation.ts](../src/renovation.ts), [src/model.ts](../src/model.ts)), puis comparaison avec les valeurs du modèle.
Claude lit les documents (étapes 2-3, à la main dans le chat) ; tout le reste est du code, sans LLM.

| Étape | Mode manuel | Sortie (dans `sorties/`) |
|---|---|---|
| 1. Liste de paramètres | éditer [parametres.yaml](parametres.yaml), puis `generer_prompts.py` | `prompts_manuels/` |
| 2a. Inventaire | prompt `…__1_inventaire.md` dans le chat | réponse collée dans `manuel/<DOC>/` |
| 2b. Extraction | prompt `…__2_extraction.md`, même conversation | réponse collée dans `manuel/<DOC>/` |
| 3. Relecture | prompt `…__3_relecture.md`, même conversation | réponse collée dans `manuel/<DOC>/` |
| 2-3. Assemblage | `assembler.py` | `extraction/<DOC>.json` |
| 4. Vérification des citations | `verifier.py`, puis contrôle à la main | `observations.csv`, `hors_cadre.csv`, `inventaire.csv`, `decisions.csv` |
| 5. Évaluation contre le relevé manuel | `evaluer.py` | `evaluation.csv`, `evaluation_en_plus.csv` |
| 6. Normalisation | `normaliser.py` ([conversions.yaml](conversions.yaml)) | `observations_normalisees.csv` |
| 7. Agrégation | `agreger.py` | `agregats.csv` (valeurs isolées), `courbes.csv` (séries) |
| 8. Comparaison | `comparer.py`, puis `prompt_commentaire.md` dans le chat | `comparaison.csv` |

`corpus/` (PDF) et `sorties/` ne sont pas versionnés.

## Ce que l'extraction relève

- **Inventaire d'abord** : avant toute extraction, Claude liste les tableaux, figures, formules et passages chiffrés
  pertinents, avec les grandeurs selon lesquelles leurs valeurs varient (`dimensions`) et le nombre de valeurs à relever
  (`n_valeurs`). Chaque valeur extraite renvoie à un élément de l'inventaire (`source_inventaire`).
- **Deux formes d'observation** :
  - `valeur` : une valeur isolée ou une plage ; un contexte numérique (puissance, température) peut être une plage
    `{"min": 10, "max": 100}` ;
  - `serie` : les couples (x, valeur) d'une ligne de tableau ou d'une courbe, avec la grandeur en abscisse (`variable` :
    puissance, épaisseur, surface, consommation…, liste dans `variables_serie` de [parametres.yaml](parametres.yaml)).
    Une dépendance (coût selon la puissance, etc.) est ainsi gardée telle quelle, sans réduction à une moyenne.
- **Hors cadre** : ce qui ne rentre dans aucune forme n'est pas forcé mais rangé dans `hors_cadre`, avec une raison
  (`dependance_non_prevue`, `definition_differente`, `valeur_composite`, `loi`, `forme_non_supportee`,
  `relation_qualitative`, `hors_liste`, `autre`). Les formules et régressions vont là (raison `loi`), recopiées et non
  évaluées : elles se comparent à la main. Les raisons `dependance_non_prevue` et `relation_qualitative`, regroupées
  sur le corpus, montrent les paramètres que le modèle traite à tort comme constants ou linéaires.

## Installation

```bash
cd litterature
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Toutes les commandes ci-dessous se lancent depuis `litterature/` avec `.venv/bin/python` (Windows :
`.venv/Scripts/python.exe` ; si l'affichage plante sur un caractère, définir `PYTHONIOENCODING=utf-8`).

## Mode manuel, document par document

### Préparer
- Déposer le PDF dans `corpus/`, nommé d'après son identifiant de source dans
  [docs/renovation/sources.csv](../docs/renovation/sources.csv) (ex. `GRANDJEAN2021.pdf`). Un morceau d'une étude
  découpée prend un suffixe après deux tirets bas (`STREICHER2020__paperIII.pdf`) : tous les morceaux d'une même
  étude partagent le préfixe et ne comptent que pour une source. Ce nom `<DOC>` relie toutes les étapes.
- Choisir les prompts :
  - document court (moins de ~30 pages) : le lot `tout` ;
  - document long : les trois lots `A_enveloppe`, `B_systemes`, `C_performance_economie`, chacun dans sa propre
    conversation. Une conversation par lot donne de meilleurs résultats qu'une seule longue conversation, et les
    séries rendent les réponses plus longues : préférer les lots dès qu'un document a beaucoup de tableaux.

### Dans le chat (claude.ai), une conversation par lot
1. Nouvelle conversation, joindre le PDF, coller tout le contenu de `<lot>__1_inventaire.md`.
   Ranger la réponse (le bloc JSON) dans `sorties/manuel/<DOC>/<lot>__1_inventaire.json`.
2. Coller `<lot>__2_extraction.md` ; ranger la réponse dans `<lot>__2_extraction.json`.
   Si la réponse se termine par « SUITE », écrire « Continue » et ranger la suite dans `…__2_extraction_2.json`
   (puis `_3`…).
3. Coller `<lot>__3_relecture.md` ; ranger la réponse dans `<lot>__3_relecture.json`.

Exemple pour un document court :
```
sorties/manuel/GRANDJEAN2021/tout__1_inventaire.json
sorties/manuel/GRANDJEAN2021/tout__2_extraction.json
sorties/manuel/GRANDJEAN2021/tout__3_relecture.json
```

### Assembler et vérifier
```bash
.venv/bin/python assembler.py GRANDJEAN2021
```
Chaque réponse est contrôlée : JSON lisible, champs obligatoires, valeurs autorisées, et cohérence des formes (une série
a une variable et au moins deux points, une valeur isolée n'a pas de points…). En cas d'erreur, le document n'est pas
assemblé et le message indique le fichier et le champ : corriger le fichier à la main, ou demander dans la
conversation « Ta réponse n'est pas conforme : <message>. Renvoie le bloc JSON complet corrigé. »

Sont signalés sans bloquer :
- les paramètres sans entrée de couverture : redemander « Tu n'as pas donné de statut pour : <liste>. Complète au même
  format. » et ranger la réponse comme une partie supplémentaire de la relecture (`…__3_relecture_2.json`) ;
- les éléments de l'inventaire **non traités** ou **partiels** (moins de 80 % des `n_valeurs` annoncées) : redemander
  « Pour <élément>, tu as relevé <n> valeurs sur <n_valeurs>. Relève les valeurs manquantes au même format. » ;
- les `source_inventaire` qui ne désignent aucun élément de l'inventaire.

Le bilan de l'inventaire est un garde-fou, pas une preuve de complétude : un tableau oublié à l'inventaire n'est
contrôlé par rien, et `n_valeurs` est une estimation de Claude.

## Étapes suivantes (sur tous les documents assemblés)

```bash
.venv/bin/python verifier.py      # 4
.venv/bin/python evaluer.py       # 5
.venv/bin/python normaliser.py    # 6
.venv/bin/python agreger.py       # 7
.venv/bin/python comparer.py      # 8
```

- **4** : une ligne par valeur dans `observations.csv` ; un point de série est une ligne (`obs` = `3.2` pour le 2e point
  de la 3e observation), avec `x` et `variable`. Pour un point de série, x et la valeur doivent figurer dans la
  citation. **Contrôle manuel** : `decisions.csv` liste les valeurs dont la citation n'a pas été retrouvée dans le PDF
  ou ne contient pas la valeur (`a_revoir`), et celles lues sur une figure (`figure`). Pour chacune, ouvrir le PDF à la
  page indiquée et remplir `decision` : `garder`, `exclure` ou `corriger` (avec `valeur_corrigee`). Ce fichier n'est
  jamais écrasé ; les lignes `a_revoir` sans décision sont écartées à l'étape 6.
  **Appariement des séries** : `ok` dit que x et la valeur sont dans la citation, pas qu'ils sont sur la même ligne du
  tableau. Contrôler à la main quelques séries par document (un décalage de ligne ou de colonne est l'erreur typique).
  Pour une courbe importante, numériser la figure (ex. WebPlotDigitizer) plutôt que se fier à la lecture de Claude.
  `hors_cadre.csv` : à relire, en particulier les raisons `loi`, `dependance_non_prevue` et `relation_qualitative`.
  `inventaire.csv` : valeurs relevées par élément de l'inventaire.
- **5** : le rappel est mesuré sur les nombres du relevé manuel (qui n'est pas exhaustif : c'est une borne basse).
  Contrôler un échantillon de `evaluation_en_plus.csv` (colonne `controle` : `juste` / `faux`) pour estimer la précision.
- **6** : compléter [conversions.yaml](conversions.yaml) au fil de l'eau : unités listées dans
  `unites_inconnues.csv` (unités des valeurs dans `unites`, unités de x dans `unites_variable`), indices de prix OFS et
  taux de change BNS (vides au départ : les montants restent alors nominaux, et les montants en devise étrangère sont
  écartés).
- **7** : `agregats.csv` résume les valeurs isolées (une voix par source ; la colonne `puissances_kw` montre si un
  groupe mélange des tailles). `courbes.csv` garde chaque point de série, sans réduction : à lire source par source,
  pour ne pas confondre l'effet de x avec un effet de contexte (pays, année des prix, type de bâtiment).
- **8** : `comparaison.csv` place chaque valeur du modèle dans la distribution de la littérature, avec des alertes
  (`voir_courbes` / `seulement_courbes` quand la littérature donne des séries). `prompt_commentaire.md` est prêt à
  coller dans le chat pour une lecture commentée des écarts.

## Enrichir la liste de paramètres

1. Passe « découverte » : sur 10 à 15 documents variés, coller `prompts_manuels/decouverte.md` avec le PDF. Le modèle
   liste toutes les grandeurs chiffrées et celles qui manquent à la liste.
2. Regrouper les grandeurs récurrentes de `sorties/hors_cadre.csv` (raison `hors_liste`), et les dépendances
   récurrentes (raison `dependance_non_prevue`) : une grandeur souvent citée appelle un champ de contexte ou une
   `variables_serie` de plus.
3. Test de dispersion : deux valeurs d'un même paramètre qui diffèrent de plus d'un facteur 2 sans qu'aucun champ de
   contexte ne l'explique signalent un champ de contexte manquant.

Après toute modification de `parametres.yaml` ou de `prompts/` : relancer `generer_prompts.py`. Les extractions faites
avec l'ancienne liste restent utilisables si on n'a fait qu'ajouter des paramètres ; ré-extraire si des définitions ont
changé.

## Choix

- **La liste de paramètres pilote tout** : prompts et format de sortie sont générés depuis `parametres.yaml`.
- **Les valeurs du modèle ne sont pas montrées à Claude**, pour ne pas orienter la lecture.
- **Couverture explicite** : pour chaque paramètre, `trouve`, `hors_cadre` ou `non_rapporte` ; un oubli se voit.
- **Inventaire avant extraction**, pour que l'extraction puisse être confrontée à une liste d'éléments.
- **Dépendances gardées telles quelles** : séries (x, valeur) plutôt que moyennes ou plages ; rien n'est calculé à
  l'extraction (ni moyenne, ni coût unitaire, ni évaluation de formule).
- **Rien n'est forcé dans une case** : ce qui ne rentre pas va dans `hors_cadre`, avec sa raison.
- **Valeurs brutes à l'extraction** (unité, devise, année des prix d'origine) ; toute conversion est faite en code, à
  partir de tables explicites.
- **Citation et page obligatoires**, vérifiées automatiquement contre le texte du PDF.
- **Une source = une voix** dans les statistiques des valeurs isolées : les valeurs reprises d'une même source primaire
  ne comptent qu'une fois. Les séries ne sont pas résumées.
