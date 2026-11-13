# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Rapport HTML autonome (`src/report/`), mis en page comme un document A4 : 1. synthèse (texte, chiffres clés, carte de la situation actuelle aux couleurs de l’app) ; 2. feuille de route du scénario retenu (carte des années de travaux, investissement annuel sous plafond, calendrier des lots) ; 3. comparaison et leviers (stratégies, thermostat, budget, meilleure combinaison) ; annexes (liste des bâtiments repliée par défaut, triable, export CSV, paramètres et hypothèses). Paramètres modifiables dans le rapport sur une ligne : thermostat (−1/−2 °C, −6 % de demande par °C), budget annuel, coût social du carbone (défaut 177 CHF/tCO₂e, coûts affichés avec et sans). Textes par défaut centralisés dans `src/report/texts.ts` ; textes aussi modifiables directement dans le rapport (« Modifier le texte »), conservés au téléchargement. Ouverture dans un nouvel onglet ; téléchargement HTML.
- Données réelles : 770 bâtiments de la Ville de Genève (`ville_geneve_core.geojson`, SITG + QuantHome) convertis par `scripts/build-buildings.mjs` (`npm run data`) en `src/buildings.generated.json`. Valeurs manquantes (IDC, CO₂, année) complétées et signalées dans la fiche ; indice d'état = proxy (âge + travaux énergétiques récents).
- Fond de carte vectoriel swisstopo (`ch.swisstopo.lightbasemap.vt`) via MapLibre GL.
- Carte : taille des symboles proportionnelle à la SRE, forme selon l'affectation, teinte rouge/jaune/gris selon l'échéance et le nombre de critères dépassés (1, 2 ou 3 : IDC, CO₂, vétusté).
- Légende interactive : clic sur une échéance = n'afficher que ces points ; sélection multiple des affectations ; échelle de tailles.
- Onglet « Diagramme IDC × CO₂ » (IDC en X, intensité carbone en Y, seuils du scénario, infobulle, sélection).
- Visite guidée (`src/tourSteps.ts` + `src/Tour.tsx`) : structure prête, étapes à enrichir.
- Fiche bâtiment : protection patrimoniale, statut IDC (OCEN), sources et valeurs estimées.

### Modifié
- Identité graphique : jaune, rouge, noir et blason stylisé de la Ville de Genève (`src/Blason.tsx`, à remplacer par le fichier officiel si disponible).
- Écran d'accueil centré sur la carte, les scénarios et les curseurs ; « Méthode & hypothèses » dans un tiroir ouvert à la demande.
- Remplacement de Leaflet par MapLibre GL.

### Technique
- Fins de ligne : les fichiers du dépôt sont en CRLF ; `core.whitespace=cr-at-eol` configuré localement pour que les CR ne soient pas signalés comme changements.
