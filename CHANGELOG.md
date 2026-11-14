# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Plus-value immobilière de la rénovation (`src/renovation.ts`, `BUILDING_VALUE`, hypothèses modèle) : part de la valeur du bâtiment regagnée, linéaire selon l'indice d'état de l'année des travaux, de 0,2 (état 1) à 0,6 (état ≤ 0,4). Valeur du bâtiment : loyers résidentiels capitalisés à 4 % s'ils sont renseignés, sinon 4 000 CHF/m² SRE. Appliquée au prorata du coût du paquet complet retenu, annualisée à 3 % sur 30 ans et tracée sous l'axe du graphique « Coûts annuels » comme recette (déduite du coût net). Montant, facteur et base affichés sous le graphique ; aide « Plus-value immobilière ».

### Corrigé
- Graphique « Coûts annuels » (onglet « Mesures de rénovation » et `BuildingCharts`) : le manque à gagner de loyers est un coût, tracé au-dessus de l'axe ; la hausse de loyer est une recette, tracée en dessous. Le total affiché est le coût net (coûts + manque à gagner − hausse de loyer) ; auparavant la hausse de loyer était ajoutée aux coûts et le manque à gagner ignoré.

### Modifié
- Part vitrée selon l'affectation (`src/renovation.ts`, `WINDOW_SHARE`) : façade brute (mur + fenêtres) de 1,0 m²/m² SRE (hypothèse modèle) ; fenêtres = part × façade brute, façade opaque = le reste. Logement 20 % et Administration 60 % (valeurs de l'utilisateur) ; Logement mixte et Santé & social 25 %, Éducation (École) et Commerce & ateliers 40 %, Culture & loisirs (Musée) et Sport 30 %, défaut 30 % (hypothèses modèle à valider). Quantités, coûts, économies et carbone gris de la façade et des fenêtres en découlent ; la part est affichée sur la ligne de mesure. Auparavant : 0,8 de façade opaque et 0,2 de fenêtres pour tous les usages.
- Profondeur de rénovation selon la raison de rénover (`src/model.ts`, `DEEP_RENOVATION_CONDITION = 0.7`) : rénovation complète si l'indice d'état de l'année des travaux est inférieur à 0,70 ; sinon rénovation énergétique (chauffage, photovoltaïque, toit et cave, sans façade ni fenêtres ; état inchangé), escaladée en complète si elle laisse un seuil en vigueur dépassé d'ici 2036 (tableau de bord) ou 2050 (rapport). `renovationFor(building, year, strategy, lastYear)` renvoie la profondeur, son motif et le paquet recommandé, utilisé par les KPI, le tri, la fiche bâtiment, l'export CSV, `BuildingCharts` et la feuille de route du rapport. L'onglet « Mesures de rénovation » part du paquet recommandé (bouton « Paquet recommandé », « Tout cocher » inchangé).
- Tableau de bord évalué jusqu'en 2050 : les bâtiments gris (aucun seuil dépassé d'ici 2036) affichent l'année et le critère d'un premier dépassement 2037–2050 (fiche, infobulles, liste, CSV), toujours sans travaux simulés (KPI, programme, export : test sur la catégorie au lieu de `dueYear !== null`). Libellé du gris : « Aucun seuil dépassé d'ici 2036 · surveillance ».
- « Encore hors seuil après travaux » (fiche bâtiment, rapport) : comparaison de l'IDC, du CO₂ et de l'état après travaux avec les seuils en vigueur chaque année, des travaux à 2036 (tableau de bord) ou 2050 (rapport), avec l'année et le critère ; auparavant, seuils de l'année d'échéance (fiche) ou du dernier palier du calendrier (rapport).
- Diagramme IDC × CO₂ : seuils tracés de la dernière année de la sélection (horizon ou catégorie isolée), année indiquée sur les lignes ; barres de la fiche bâtiment : année du seuil indiquée.
- CO₂ = scope 1 + 2, calculé pour chaque bâtiment à partir de l'IDC, du système de chauffage et du facteur d'émission de son agent (`src/carriers.json` : combustion directe pour le gaz et le mazout, facteur du réseau pour l'électricité et le CAD) dans `scripts/build-buildings.mjs`. Le champ scope 1 de QuantHome n'est plus utilisé : ses facteurs étaient incohérents (p. ex. facteur du mazout appliqué à une centaine de bâtiments au gaz). CO₂ signalé comme estimé seulement si l'IDC est imputé ou le chauffage inconnu.
- Exemplaire : objectifs jusqu'en 2050, zéro net compris — IDC 450 / CO₂ 25 en 2026, CO₂ 13 dès 2030, IDC 340 / CO₂ 6 dès 2040 (interpolation linéaire, absente des sources), IDC 230 / CO₂ 1 dès 2050 (LCl, Stratégie climat de la Ville ; résidu de l'électricité du réseau). Base légale inchangée. Facteurs d'émission constants : l'objectif de 1 kgCO₂e/m²·an n'est pas atteint par un raccordement au CAD (0,131 kg/kWh).
- Horizon : `TARGET_YEAR = 2050` (`src/model.ts`) ; changements de seuils possibles de 2027 à 2050 (validation et formulaire « Évolution des seuils »). `assessBuilding` / `assessPortfolio` prennent une dernière année facultative : le tableau de bord garde 10 ans et ses catégories ; le rapport HTML évalue jusqu'en 2050 et planifie les bâtiments dont le premier seuil est franchi entre 2037 et 2050 (catégorie « au-delà de 10 ans » sur la carte de synthèse).
- Calculs revus (`src/renovation.ts`, `src/carriers.json`) : IDC selon la méthode de l'OCEN (annexe « Calcul de l'IDC », rév. 1.0 du 25.08.2025 : énergie finale ; électricité de PAC × 11,7 MJ/kWh ; chaleur CAD × 3,89 MJ/kWh) ; chauffage fossile remplacé par un raccordement obligatoire au CAD s'il est dans la rue (coût LICS2022 Fig. 47, 20 ans), sinon par une PAC ; systèmes non fossiles conservés ; intensité carbone absente ou nulle déduite de l'IDC, du système de chauffage et du facteur d'émission de son agent (`scripts/build-buildings.mjs`) ; électricité 0,097 et CAD 0,131 kgCO₂e/kWh.
- Scénarios datés (`src/model.ts`, d'après `Data_legal/`) : Base légale = seuil IDC de travaux ordonnés de l'art. 14 REn (800, 650 dès 2027, 550 dès 2031), CO₂ = équivalent mazout (pas de limite légale) ; Exemplaire = Plan directeur de l'énergie (IDC 450 ; CO₂ 25, puis 13 dès 2030) ; état 0,5 dans les deux. Le scénario Modulable reprend le calendrier de sa base.

### Ajouté
- Onglet « Mesures de rénovation » : libellé du paquet recommandé (profondeur, motif, seuil encore dépassé) et bouton « Paquet recommandé » ; colonnes « Rénovation » et « Seuil encore dépassé après travaux » dans l'export CSV ; tests de la part vitrée, de la profondeur, des échéances après 2036 et de la vérification après travaux.
- Carbone gris des travaux (`src/renovation.ts`, KBOB 2022) : par mesure (isolant, fenêtres, PAC, raccordement CAD, photovoltaïque), total par bâtiment, amorti sur la durée de vie et comparé à la valeur limite RECMC de 5 kgCO₂e/m²·an ; affiché dans la fiche bâtiment et l'onglet « Mesures de rénovation », non déduit du CO₂ évité.
- Onglet « Mesures de rénovation » à côté de Carte et Diagramme (`src/RenovationTab.tsx`, remplace le panneau « Avant / après rénovation ») : liste de mesures à cocher avec coût estimé, graphique des coûts annuels à droite qui s'adapte à la sélection (PAC requise pour le photovoltaïque ; loyers appliqués seulement si une mesure d'enveloppe est retenue). Les graphiques IDC et intensité carbone sont supprimés.
- Feuille de route : pictogramme carte (voir sur la carte) et pictogramme clé (mesures de rénovation) en fin de ligne, à la place de la flèche.
- Fiche bâtiment : IDC et CO₂ en barres horizontales (actuel, rénové, repère du seuil) à la place des chiffres.
- Carte : synchronisation des symboles avant la mise à jour des points pour éviter une couleur manquante après une modification à chaud.
- Bouton « Réinitialiser les filtres » dans la légende : efface échéance, affectations et recherche sans modifier le scénario ni l'horizon ; aide sur la catégorie cinq à dix ans.
- Carte et diagramme : suppression de l'atténuation hors programme ; rouge, jaune et vert restent à pleine opacité même lorsque les seuils changent. Seuls les bâtiments au-delà de dix ans sont gris à 30 % d'opacité.
- Graphique des coûts : rénovation scindée en enveloppe thermique (vert foncé) et équipements techniques (vert clair) ; loyers intégrés au graphique des coûts annuels (manque à gagner sous l'axe : 1 an de loyers réparti sur 30 ans ; hausse de loyer de confort au-dessus, +10 % — hypothèse non sourcée).
- Photovoltaïque en toiture dans les équipements (2 400 CHF/kWc, 1 050 kWh/kWc, dimensionné sur l'électricité de chauffage) ; non installable sur les bâtiments protégés, avec mention dans la fiche.
- Mention que les subventions ne sont pas appliquées (feuille de route de la Ville de Genève elle-même).
- Hypothèses : coût social du carbone (200 CHF/tCO₂e), facteur d'émission de l'électricité (0,024 kgCO₂e/kWh), photovoltaïque et loyers.
- Données : `rentResidential` et `solarShare` ajoutés à `src/buildings.generated.json`.
- Fiche bâtiment : graphiques « actuel vs rénové » (IDC, intensité carbone, coût annuel empilé énergie / rénovation annualisée / carbone en grisé) au-dessus de la feuille de route, et menu déroulant du coût estimé des mesures (`src/BuildingCharts.tsx`).
- Modèle de rénovation par mesures (`src/renovation.ts`) calé sur `docs/renovation/` : isolation façade/toit/cave, fenêtres, PAC air/eau (coût interpolé sur LICS2022 Fig. 47, puissance LICS2022 Tab. 9), économies par ΔU × degrés-jours genevois réalisées à 50 %, annuité à 3 %.
- Coût social du carbone : 200 CHF/tCO₂.
- Rapport HTML autonome (`src/report/`), mis en page comme un document A4 : 1. synthèse (texte, chiffres clés, carte de la situation actuelle aux couleurs de l’app) ; 2. feuille de route du scénario retenu (carte des années de travaux, investissement annuel sous plafond, calendrier des lots) ; 3. comparaison et leviers (stratégies, thermostat, budget, meilleure combinaison) ; annexes (liste des bâtiments repliée par défaut, triable, export CSV, paramètres et hypothèses). Paramètres modifiables dans le rapport sur une ligne : thermostat (−1/−2 °C, −6 % de demande par °C), budget annuel, coût social du carbone (défaut 177 CHF/tCO₂e, coûts affichés avec et sans). Textes par défaut centralisés dans `src/report/texts.ts` ; textes aussi modifiables directement dans le rapport (« Modifier le texte »), conservés au téléchargement. Ouverture dans un nouvel onglet ; téléchargement HTML.
- Données réelles : 770 bâtiments de la Ville de Genève (`ville_geneve_core.geojson`, SITG + QuantHome) convertis par `scripts/build-buildings.mjs` (`npm run data`) en `src/buildings.generated.json`. Valeurs manquantes (IDC, CO₂, année) complétées et signalées dans la fiche ; indice d'état = proxy (âge + travaux énergétiques récents).
- Fond de carte vectoriel swisstopo (`ch.swisstopo.lightbasemap.vt`) via MapLibre GL.
- Carte : taille des symboles proportionnelle à la SRE, forme selon l'affectation, teinte rouge/jaune/gris selon l'échéance et le nombre de critères dépassés (1, 2 ou 3 : IDC, CO₂, vétusté).
- Légende interactive : clic sur une échéance = n'afficher que ces points ; sélection multiple des affectations ; échelle de tailles.
- Onglet « Diagramme IDC × CO₂ » (IDC en X, intensité carbone en Y, seuils du scénario, infobulle, sélection).
- Visite guidée (`src/tourSteps.ts` + `src/Tour.tsx`) : structure prête, étapes à enrichir.
- Fiche bâtiment : protection patrimoniale, statut IDC (OCEN), sources et valeurs estimées.

### Modifié
- Données : plus aucune donnée versionnée. Le pipeline Python (`pipeline/`, ex-branche `data-sourcing`) génère `data/ville_geneve_core.geojson` à partir des identifiants du `.env` (voir `.env.example`), puis `npm run data` produit `src/buildings.generated.json`. `npm run dev` et `npm run build` s'arrêtent avec un message explicite si les données manquent.
- Carte : l'avertissement « Fond de carte swisstopo partiellement indisponible » ne s'affiche plus quand seul le fichier des volumes 3D (`public/data/ville_geneve_3d.geojson`) manque ; un message distinct l'indique. Les erreurs de carte sont journalisées dans la console (`[carte]`).
- Mention « PROTOTYPE NON OFFICIEL » retirée de l'en-tête ; « CO₂ évitable chaque année » devient « CO₂ évité chaque année » dans la fiche.
- Application renommée « StratoRéno », y compris titre de page, en-tête, pied de page et préfixe des exports.
- Scénarios renommés « Base légale », « Exemplaire » et « Modulable », y compris dans la visite et les exports.
- Repères S1/S2 et valeurs de référence sur les trois plages du scénario modulable ; seuils séparés en blocs.
- Accents des scénarios repris sur les curseurs et KPI : Base légale rouge, Exemplaire vert, Modulable bleu.
- Widgets KPI agrandis ; nombre de bâtiments et m² dans un format plus compact.
- Échéances harmonisées : rouge immédiat, jaune cinq ans, vert dix ans et gris à 30 % pour la surveillance au-delà de dix ans sur la carte, le diagramme, la légende et les fiches. Symboles d'affectation et tailles de référence de la légende en bleu.
- Logo officiel de Genève téléchargé sans altération ; en-tête blanc, jaune numérique et typographie système, avec mention du caractère non officiel du prototype.
- Indice d'état : 1 si construction ou derniers travaux < 10 ans, puis −0,01/an (0,40 à 70 ans), puis −0,005/an (remplace la courbe en S).
- Les KPI et le classement utilisent le nouveau modèle de coûts et d'économies (remplace le coût générique 550 + 900 × (1 − état) CHF/m² et la baisse fixe de 45 % de l'IDC).
- Identité graphique : jaune, rouge, noir et blason stylisé de la Ville de Genève (`src/Blason.tsx`, à remplacer par le fichier officiel si disponible).
- Écran d'accueil centré sur la carte, les scénarios et les curseurs ; « Méthode & hypothèses » dans un tiroir ouvert à la demande.
- Remplacement de Leaflet par MapLibre GL.

### Technique
- Installation : MapLibre GL ajusté vers `^6.16.0` et verrou de dépendances régénéré, les versions précédemment verrouillées n'étant pas disponibles sur le registre configuré.
- Fins de ligne : les fichiers du dépôt sont en CRLF ; `core.whitespace=cr-at-eol` configuré localement pour que les CR ne soient pas signalés comme changements.
