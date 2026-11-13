# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Carte : synchronisation des symboles avant la mise à jour des points pour éviter une couleur manquante après une modification à chaud.
- Bouton « Réinitialiser les filtres » dans la légende : efface échéance, affectations et recherche sans modifier le scénario ni l'horizon ; aide sur la catégorie cinq à dix ans.
- Carte et diagramme : suppression de l'atténuation hors programme ; rouge, jaune et vert restent à pleine opacité même lorsque les seuils changent. Seuls les bâtiments au-delà de dix ans sont gris à 30 % d'opacité.
- Données réelles : 770 bâtiments de la Ville de Genève (`ville_geneve_core.geojson`, SITG + QuantHome) convertis par `scripts/build-buildings.mjs` (`npm run data`) en `src/buildings.generated.json`. Valeurs manquantes (IDC, CO₂, année) complétées et signalées dans la fiche ; indice d'état = proxy (âge + travaux énergétiques récents).
- Fond de carte vectoriel swisstopo (`ch.swisstopo.lightbasemap.vt`) via MapLibre GL.
- Carte : taille des symboles proportionnelle à la SRE, forme selon l'affectation, teinte rouge/jaune/gris selon l'échéance et le nombre de critères dépassés (1, 2 ou 3 : IDC, CO₂, vétusté).
- Légende interactive : clic sur une échéance = n'afficher que ces points ; sélection multiple des affectations ; échelle de tailles.
- Onglet « Diagramme IDC × CO₂ » (IDC en X, intensité carbone en Y, seuils du scénario, infobulle, sélection).
- Visite guidée (`src/tourSteps.ts` + `src/Tour.tsx`) : structure prête, étapes à enrichir.
- Fiche bâtiment : protection patrimoniale, statut IDC (OCEN), sources et valeurs estimées.

### Modifié
- Application renommée « StratoRéno », y compris titre de page, en-tête, pied de page et préfixe des exports.
- Scénarios renommés « Base légale », « Exemplaire » et « Modulable », y compris dans la visite et les exports.
- Repères S1/S2 et valeurs de référence sur les trois plages du scénario modulable ; seuils séparés en blocs.
- Accents des scénarios repris sur les curseurs et KPI : Base légale rouge, Exemplaire vert, Modulable bleu.
- Widgets KPI agrandis ; nombre de bâtiments et m² dans un format plus compact.
- Échéances harmonisées : rouge immédiat, jaune cinq ans, vert dix ans et gris à 30 % pour la surveillance au-delà de dix ans sur la carte, le diagramme, la légende et les fiches. Symboles d'affectation et tailles de référence de la légende en bleu.
- Logo officiel de Genève téléchargé sans altération ; en-tête blanc, jaune numérique et typographie système, avec mention du caractère non officiel du prototype.
- Identité graphique : jaune, rouge, noir et blason stylisé de la Ville de Genève (`src/Blason.tsx`, à remplacer par le fichier officiel si disponible).
- Écran d'accueil centré sur la carte, les scénarios et les curseurs ; « Méthode & hypothèses » dans un tiroir ouvert à la demande.
- Remplacement de Leaflet par MapLibre GL.

### Technique
- Installation : MapLibre GL ajusté vers `^6.16.0` et verrou de dépendances régénéré, les versions précédemment verrouillées n'étant pas disponibles sur le registre configuré.
- Fins de ligne : les fichiers du dépôt sont en CRLF ; `core.whitespace=cr-at-eol` configuré localement pour que les CR ne soient pas signalés comme changements.
