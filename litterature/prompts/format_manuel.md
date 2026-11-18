Format de la réponse :

Réponds UNIQUEMENT par un bloc de code JSON (```json … ```), sans texte avant ni après, avec exactement cette structure. Tous les champs sont obligatoires ; `null` est permis seulement pour `valeur`, `valeur_min`, `valeur_max`, `page`, `source_primaire` et `annee_publication`. Les champs de contexte à liste fermée ne prennent que les valeurs listées plus haut.

```json
{exemple}
```

`parametre` ne prend que les identifiants de la liste ci-dessous. `lecture` vaut texte, tableau ou figure. `statut` vaut trouve, non_rapporte ou incertain. `type_document` vaut article, rapport, these, norme, base_de_donnees ou autre.

Si la réponse est trop longue pour un seul message, arrête-toi à la fin d'une observation complète et écris seulement « SUITE » après le bloc ; je te demanderai la suite, que tu donneras comme un second bloc JSON complet (même structure, sans répéter ce qui précède).
