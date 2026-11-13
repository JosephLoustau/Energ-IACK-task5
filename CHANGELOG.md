# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
<<<<<<< HEAD
=======
- Onglet « Mesures de rénovation » à côté de Carte et Diagramme (`src/RenovationTab.tsx`, remplace le panneau « Avant / après rénovation ») : liste de mesures à cocher avec coût estimé, graphique des coûts annuels à droite qui s'adapte à la sélection (PAC requise pour le photovoltaïque ; loyers appliqués seulement si une mesure d'enveloppe est retenue). Les graphiques IDC et intensité carbone sont supprimés.
- Feuille de route : pictogramme carte (voir sur la carte) et pictogramme clé (mesures de rénovation) en fin de ligne, à la place de la flèche.
- Fiche bâtiment : IDC et CO₂ en barres horizontales (actuel, rénové, repère du seuil) à la place des chiffres.
- Carte : synchronisation des symboles avant la mise à jour des points pour éviter une couleur manquante après une modification à chaud.
- Bouton « Réinitialiser les filtres » dans la légende : efface échéance, affectations et recherche sans modifier le scénario ni l'horizon ; aide sur la catégorie cinq à dix ans.
- Carte et diagramme : suppression de l'atténuation hors programme ; rouge, jaune et vert restent à pleine opacité même lorsque les seuils changent. Seuls les bâtiments au-delà de dix ans sont gris à 30 % d'opacité.
>>>>>>> origin/3d-view
- Graphique des coûts : rénovation scindée en enveloppe thermique (vert foncé) et équipements techniques (vert clair) ; loyers intégrés au graphique des coûts annuels (manque à gagner sous l'axe : 1 an de loyers réparti sur 30 ans ; hausse de loyer de confort au-dessus, +10 % — hypothèse non sourcée).
- Photovoltaïque en toiture dans les équipements (2 400 CHF/kWc, 1 050 kWh/kWc, dimensionné sur l'électricité de chauffage) ; non installable sur les bâtiments protégés, avec mention dans la fiche.
- Mention que les subventions ne sont pas appliquées (feuille de route de la Ville de Genève elle-même).
- Hypothèses : coût social du carbone (200 CHF/tCO₂e), facteur d'émission de l'électricité (0,024 kgCO₂e/kWh), photovoltaïque et loyers.
- Données : `rentResidential` et `solarShare` ajoutés à `src/buildings.generated.json`.
- Fiche bâtiment : graphiques « actuel vs rénové » (IDC, intensité carbone, coût annuel empilé énergie / rénovation annualisée / carbone en grisé) au-dessus de la feuille de route, et menu déroulant du coût estimé des mesures (`src/BuildingCharts.tsx`).
- Modèle de rénovation par mesures (`src/renovation.ts`) calé sur `docs/renovation/` : isolation façade/toit/cave, fenêtres, PAC air/eau (coût interpolé sur LICS2022 Fig. 47, puissance LICS2022 Tab. 9), économies par ΔU × degrés-jours genevois réalisées à 50 %, annuité à 3 %.
- Coût social du carbone : 200 CHF/tCO₂.
<<<<<<< HEAD
- Rapport HTML autonome (`src/report/`), mis en page comme un document A4 : 1. synthèse (texte, chiffres clés, carte de la situation actuelle aux couleurs de l’app) ; 2. feuille de route du scénario retenu (carte des années de travaux, investissement annuel sous plafond, calendrier des lots) ; 3. comparaison et leviers (stratégies, thermostat, budget, meilleure combinaison) ; annexes (liste des bâtiments repliée par défaut, triable, export CSV, paramètres et hypothèses). Paramètres modifiables dans le rapport sur une ligne : thermostat (−1/−2 °C, −6 % de demande par °C), budget annuel, coût social du carbone (défaut 177 CHF/tCO₂e, coûts affichés avec et sans). Textes par défaut centralisés dans `src/report/texts.ts` ; textes aussi modifiables directement dans le rapport (« Modifier le texte »), conservés au téléchargement. Ouverture dans un nouvel onglet ; téléchargement HTML.
=======
>>>>>>> origin/3d-view
- Données réelles : 770 bâtiments de la Ville de Genève (`ville_geneve_core.geojson`, SITG + QuantHome) convertis par `scripts/build-buildings.mjs` (`npm run data`) en `src/buildings.generated.json`. Valeurs manquantes (IDC, CO₂, année) complétées et signalées dans la fiche ; indice d'état = proxy (âge + travaux énergétiques récents).
- Fond de carte vectoriel swisstopo (`ch.swisstopo.lightbasemap.vt`) via MapLibre GL.
- Carte : taille des symboles proportionnelle à la SRE, forme selon l'affectation, teinte rouge/jaune/gris selon l'échéance et le nombre de critères dépassés (1, 2 ou 3 : IDC, CO₂, vétusté).
- Légende interactive : clic sur une échéance = n'afficher que ces points ; sélection multiple des affectations ; échelle de tailles.
- Onglet « Diagramme IDC × CO₂ » (IDC en X, intensité carbone en Y, seuils du scénario, infobulle, sélection).
- Visite guidée (`src/tourSteps.ts` + `src/Tour.tsx`) : structure prête, étapes à enrichir.
- Fiche bâtiment : protection patrimoniale, statut IDC (OCEN), sources et valeurs estimées.

### Modifié
<<<<<<< HEAD
=======
- Carte : l'avertissement « Fond de carte swisstopo partiellement indisponible » ne s'affiche plus quand seul le fichier des volumes 3D (`public/data/ville_geneve_3d.geojson`) manque ; un message distinct l'indique. Les erreurs de carte sont journalisées dans la console (`[carte]`).
- Mention « PROTOTYPE NON OFFICIEL » retirée de l'en-tête ; « CO₂ évitable chaque année » devient « CO₂ évité chaque année » dans la fiche.
- Application renommée « StratoRéno », y compris titre de page, en-tête, pied de page et préfixe des exports.
- Scénarios renommés « Base légale », « Exemplaire » et « Modulable », y compris dans la visite et les exports.
- Repères S1/S2 et valeurs de référence sur les trois plages du scénario modulable ; seuils séparés en blocs.
- Accents des scénarios repris sur les curseurs et KPI : Base légale rouge, Exemplaire vert, Modulable bleu.
- Widgets KPI agrandis ; nombre de bâtiments et m² dans un format plus compact.
- Échéances harmonisées : rouge immédiat, jaune cinq ans, vert dix ans et gris à 30 % pour la surveillance au-delà de dix ans sur la carte, le diagramme, la légende et les fiches. Symboles d'affectation et tailles de référence de la légende en bleu.
- Logo officiel de Genève téléchargé sans altération ; en-tête blanc, jaune numérique et typographie système, avec mention du caractère non officiel du prototype.
>>>>>>> origin/3d-view
- Indice d'état : 1 si construction ou derniers travaux < 10 ans, puis −0,01/an (0,40 à 70 ans), puis −0,005/an (remplace la courbe en S).
- Les KPI et le classement utilisent le nouveau modèle de coûts et d'économies (remplace le coût générique 550 + 900 × (1 − état) CHF/m² et la baisse fixe de 45 % de l'IDC).
- Identité graphique : jaune, rouge, noir et blason stylisé de la Ville de Genève (`src/Blason.tsx`, à remplacer par le fichier officiel si disponible).
- Écran d'accueil centré sur la carte, les scénarios et les curseurs ; « Méthode & hypothèses » dans un tiroir ouvert à la demande.
- Remplacement de Leaflet par MapLibre GL.

### Technique
<<<<<<< HEAD
=======
- Installation : MapLibre GL ajusté vers `^6.16.0` et verrou de dépendances régénéré, les versions précédemment verrouillées n'étant pas disponibles sur le registre configuré.
>>>>>>> origin/3d-view
- Fins de ligne : les fichiers du dépôt sont en CRLF ; `core.whitespace=cr-at-eol` configuré localement pour que les CR ne soient pas signalés comme changements.
