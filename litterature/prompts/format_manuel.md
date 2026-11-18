Format de la réponse :

Réponds UNIQUEMENT par un bloc de code JSON (```json … ```), sans texte avant ni après, avec exactement cette structure. Tous les champs sont obligatoires ; `null` est permis seulement là où l'exemple le montre et pour `page` et `source_primaire`. Les champs de contexte à liste fermée ne prennent que les valeurs listées dans le premier message.

```json
{exemple}
```

- `inventaire` : uniquement les éléments absents de ton inventaire (identifiants à la suite des précédents) ; liste vide sinon.
- `forme` vaut valeur ou serie. Forme `valeur` : `variable` = null et `points` = []. Forme `serie` : `valeur`, `valeur_min` et `valeur_max` = null, `variable` renseignée, au moins deux `points`.
- `variable.nom` vaut {variables} ; avec `autre`, décrire la grandeur dans `variable.description`.
- `parametre` ne prend que les identifiants de la liste : {ids}. Dans `hors_cadre`, `parametre` vaut null pour la raison `hors_liste`.
- `raison` vaut {raisons}.
- `statut` vaut trouve, hors_cadre ou non_rapporte. `lecture` vaut texte, tableau ou figure.

Si la réponse est trop longue pour un seul message, arrête-toi à la fin d'une observation complète et écris seulement « SUITE » après le bloc ; je te demanderai la suite, que tu donneras comme un second bloc JSON complet (même structure, sans répéter ce qui précède).
