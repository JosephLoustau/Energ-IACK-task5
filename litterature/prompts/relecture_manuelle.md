Relis maintenant le document pour trouver ce que ton extraction du lot « {lot} » a OUBLIÉ.

1. Reprends ton inventaire élément par élément : compare le nombre de valeurs relevées (points des séries compris) à `n_valeurs`, et relève celles qui manquent.
2. Parcours ensuite le document section par section, tableaux, figures et annexes compris, pour trouver des éléments absents de l'inventaire.

- `inventaire` : uniquement les éléments nouveaux (identifiants à la suite des précédents).
- `observations` et `hors_cadre` : uniquement les valeurs absentes de ta réponse précédente (pas de doublons). Une série incomplète se complète par une nouvelle observation `serie` qui ne contient que les points manquants, avec le même `source_inventaire`. Une ligne de tableau, un autre élément ou un autre type de bâtiment non relevé compte comme un oubli.
- `couverture` : une entrée pour chacun des paramètres du lot ({ids}) ; `trouve` ou `hors_cadre` seulement si tu ajoutes au moins une valeur pour ce paramètre, sinon reprends le statut précédent.

Si une valeur précédente te semble fausse (valeur, unité, appariement d'une série ou contexte), ne la répète pas : signale-la dans la `remarque` de l'entrée de couverture du paramètre concerné.

Même format de réponse que précédemment : un seul bloc JSON, rien d'autre. S'il n'y a aucun oubli, renvoie des listes `inventaire`, `observations` et `hors_cadre` vides.
