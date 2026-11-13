# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Graphique des coûts : rénovation scindée en enveloppe thermique (vert foncé) et équipements techniques (vert clair) ; nouveau graphique « Loyers » (manque à gagner négatif : 1 an de loyers réparti sur 30 ans ; hausse de loyer de confort positive, +10 % — hypothèse non sourcée).
- Photovoltaïque en toiture dans les équipements (2 400 CHF/kWc, 1 050 kWh/kWc, dimensionné sur l'électricité de chauffage) ; non installable sur les bâtiments protégés, avec mention dans la fiche.
- Mention que les subventions ne sont pas appliquées (feuille de route de la Ville de Genève elle-même).
- Hypothèses : coût social du carbone (200 CHF/tCO₂e), facteur d'émission de l'électricité (0,024 kgCO₂e/kWh), photovoltaïque et loyers.
- Données : `rentResidential` et `solarShare` ajoutés à `src/buildings.generated.json`.
- Fiche bâtiment : graphiques « actuel vs rénové » (IDC, intensité carbone, coût annuel empilé énergie / rénovation annualisée / carbone en grisé) au-dessus de la feuille de route, et menu déroulant du coût estimé des mesures (`src/BuildingCharts.tsx`).
- Modèle de rénovation par mesures (`src/renovation.ts`) calé sur `docs/renovation/` : isolation façade/toit/cave, fenêtres, PAC air/eau (coût interpolé sur LICS2022 Fig. 47, puissance LICS2022 Tab. 9), économies par ΔU × degrés-jours genevois réalisées à 50 %, annuité à 3 %.
- Coût social du carbone : 200 CHF/tCO₂.
- Données réelles : 770 bâtiments de la Ville de Genève (`ville_geneve_core.geojson`, SITG + QuantHome) convertis par `scripts/build-buildings.mjs` (`npm run data`) en `src/buildings.generated.json`. Valeurs manquantes (IDC, CO₂, année) complétées et signalées dans la fiche ; indice d'état = proxy (âge + travaux énergétiques récents).
- Fond de carte vectoriel swisstopo (`ch.swisstopo.lightbasemap.vt`) via MapLibre GL.
- Carte : taille des symboles proportionnelle à la SRE, forme selon l'affectation, teinte rouge/jaune/gris selon l'échéance et le nombre de critères dépassés (1, 2 ou 3 : IDC, CO₂, vétusté).
- Légende interactive : clic sur une échéance = n'afficher que ces points ; sélection multiple des affectations ; échelle de tailles.
- Onglet « Diagramme IDC × CO₂ » (IDC en X, intensité carbone en Y, seuils du scénario, infobulle, sélection).
- Visite guidée (`src/tourSteps.ts` + `src/Tour.tsx`) : structure prête, étapes à enrichir.
- Fiche bâtiment : protection patrimoniale, statut IDC (OCEN), sources et valeurs estimées.

### Modifié
- Indice d'état : 1 si construction ou derniers travaux < 10 ans, puis −0,01/an (0,40 à 70 ans), puis −0,005/an (remplace la courbe en S).
- Les KPI et le classement utilisent le nouveau modèle de coûts et d'économies (remplace le coût générique 550 + 900 × (1 − état) CHF/m² et la baisse fixe de 45 % de l'IDC).
- Identité graphique : jaune, rouge, noir et blason stylisé de la Ville de Genève (`src/Blason.tsx`, à remplacer par le fichier officiel si disponible).
- Écran d'accueil centré sur la carte, les scénarios et les curseurs ; « Méthode & hypothèses » dans un tiroir ouvert à la demande.
- Remplacement de Leaflet par MapLibre GL.

### Technique
- Fins de ligne : les fichiers du dépôt sont en CRLF ; `core.whitespace=cr-at-eol` configuré localement pour que les CR ne soient pas signalés comme changements.
