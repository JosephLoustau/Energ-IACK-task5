Paramètres à chercher dans le document joint :

<parametres>
{parametres}
</parametres>

Premier message : l'INVENTAIRE. N'extrais encore aucune valeur.

Lis tout le document, annexes comprises, et liste chaque élément qui contient des valeurs chiffrées liées à ces paramètres, ou utiles pour estimer une rénovation (`hors_liste`) : tableau, figure, formule, ou passage de texte (section ou paragraphe qui donne des valeurs hors tableau).

Pour chaque élément :
- `id` : identifiant court et unique (I1, I2…) ;
- `type` : tableau, figure, formule ou texte ;
- `emplacement` et `page` (page du PDF, 1 = première page du fichier) ;
- `contenu` : ce que donne l'élément, en une phrase ;
- `dimensions` : grandeurs selon lesquelles les valeurs varient dans l'élément (lignes, colonnes, axe des x, courbes), avec leur unité ; liste vide pour une valeur isolée ;
- `n_valeurs` : nombre de valeurs pertinentes à relever (cellules utiles du tableau, points des courbes aux graduations de l'axe des x, valeurs du passage) ; null si tu ne peux pas l'estimer ;
- `parametres` : identifiants des paramètres concernés, ou `hors_liste`.

Réponds UNIQUEMENT par un bloc de code JSON (```json … ```), sans texte avant ni après, avec exactement cette structure (tous les champs obligatoires ; `null` permis seulement pour `annee_publication`, `page` et `n_valeurs`) :

```json
{exemple}
```

`type_document` vaut article, rapport, these, norme, base_de_donnees ou autre.
