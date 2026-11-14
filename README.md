# Energ-IACK-task5

## DeCathlon Genève — 10 ans pour décarboner le parc bâti

Application web d'aide à la décision pour prioriser la rénovation et la
décarbonation d'un parc municipal. Première version fonctionnelle avec
les **770 bâtiments de la Ville de Genève** (SITG / QuantHome / QBuildings). Les données
ne sont pas versionnées : chacun les génère localement avec ses propres identifiants
(voir [Données](#données)).

### Données

Aucun jeu de données API n'est versionné (`data/`, `public/data/`, `*.geojson`
et `**/buildings.generated.json` sont ignorés par Git). Chaque nouveau clone
doit préparer ses données avec ses propres identifiants :

1. `npm run data` exécute [pipeline/stock.py](./pipeline/stock.py), qui interroge
   SITG, QuantHome et, si configuré, QBuildings. Les réponses brutes restent
   dans `data/cache/`, hors du dossier public.
2. Le pipeline écrit `public/data/ville_geneve_3d.geojson`, puis
   [scripts/build-buildings.mjs](./scripts/build-buildings.mjs) convertit les
   bâtiments en `public/data/buildings.generated.json`.
3. Le navigateur charge ce JSON à l'exécution : aucun jeu de bâtiments n'est
   importé depuis `src/` ni incorporé au bundle JavaScript.

`npm run dev`, `npm run build` et `npm test` vérifient les deux fichiers locaux
et échouent explicitement s'ils sont absents, vides ou invalides. Les données
locales valides sont réutilisables sans nouvel appel API à chaque démarrage.
`npm run data` réutilise le cache des fournisseurs ; `npm run data -- --refresh`
force de nouveaux appels API. Tout échec de préparation est une erreur :
aucun repli silencieux sur des données anciennes ou fictives.
Prérequis :

- Python 3.11+ ;
- un fichier `.env` à la racine, copié depuis [.env.example](./.env.example), avec
  votre clé QuantHome (`API_KEY`, obligatoire). Les accès QBuildings
  (`QBUILDINGS_*`) sont optionnels : ils ne servent qu'à estimer l'IDC d'une
  dizaine de bâtiments sans autre source ; sans eux, l'étape est sautée.
  Le `.env` est ignoré par Git : ne jamais le commiter ni le partager.

```powershell
copy .env.example .env        # puis renseigner les identifiants
python -m venv .venv
.venv\Scripts\activate        # Linux/macOS : source .venv/bin/activate
pip install -r pipeline/requirements.txt
npm run data
```

Pour vérifier les données sans les régénérer : `npm run data:check`.
Un GeoJSON déjà acquis peut être converti avec
`node scripts/build-buildings.mjs chemin\vers\fichier.geojson`.
Les JSON de configuration (`package.json`, `package-lock.json`,
`tsconfig.json`, `src/carriers.json`) restent versionnés : ils ne contiennent
pas de données API. Le nettoyage concerne la version actuelle et les futurs
commits ; l'historique Git publié n'est pas réécrit.

Le modèle de données et la provenance des attributs sont décrits dans
[docs/data_model.html](./docs/data_model.html).

### Lancer l'application

Prérequis : Node.js 22.12+ ou une version LTS ultérieure compatible avec Vite,
et les données générées (voir ci-dessus).

```powershell
npm ci
npm run data   # obligatoire avant le premier démarrage ; -- --refresh pour forcer les API
npm run dev
```

Ouvrir l'adresse locale affichée dans le terminal (par défaut
http://127.0.0.1:5173). Le fond swisstopo nécessite Internet. La liste et
les calculs restent accessibles si le fond de carte échoue ; un
avertissement est affiché. Le logo est servi localement et les polices
utilisent celles du système.

```powershell
npm test
npm run build
npm run preview
```

### Parcours de démonstration

Le bouton jaune **Visite guidée** accompagne ce parcours en neuf étapes :

1. **Choisissez un scénario** : découvrir **Base légale**, **Exemplaire** et
   **Modulable**. Chaque scénario fixe les seuils qui déclenchent une rénovation.
2. **Ajustez les curseurs** : explorer les seuils d'IDC, d'état et d'intensité
   carbone. Un seul seuil dépassé suffit à rendre un bâtiment prioritaire.
   Dans **Modulable**, les curseurs sont libres et les repères S1/S2 permettent
   de comparer les valeurs de référence.
3. **Lisez la carte** : la taille des symboles représente la surface énergétique
   et leur forme indique l'affectation. Rouge : immédiat ; jaune : cinq ans ;
   vert : dix ans ; gris à 30 % d'opacité : surveillance au-delà de dix ans.
   Une teinte plus foncée indique davantage de critères dépassés.
4. **Filtrez avec la légende** : sélectionner une échéance ou une affectation
   pour isoler les bâtiments concernés.
5. **Passez au diagramme** : croiser l'IDC en abscisse et l'intensité carbone
   en ordonnée pour repérer les bâtiments hors seuils.
6. **Mesurez l'impact** : lire l'investissement requis et le CO₂ évitable des
   travaux sélectionnés. Les moyennes d'IDC et d'état sont pondérées par surface
   sur tout le parc, y compris les bâtiments sans travaux. La couleur des KPI
   suit le scénario : rouge pour **Base légale**, vert pour **Exemplaire**,
   bleu pour **Modulable**.
7. **Consultez la feuille de route** : parcourir les bâtiments classés par
   échéance et critères. Les pictogrammes ouvrent le bâtiment sur la carte
   ou dans ses mesures de rénovation.
8. **Mesures de rénovation** : pour un bâtiment, cocher ou décocher les mesures
   (isolation, fenêtres, pompe à chaleur, photovoltaïque) et observer le recalcul
   du coût et du graphique des coûts annuels : énergie, investissement,
   carbone et loyers.
9. **Exportez la stratégie** : retrouver dans le rapport interactif la stratégie
   de tout le parc, ses seuils, ses scénarios et ses hypothèses. Certains paramètres
   de rénovation peuvent y être modifiés directement, sans retourner dans
   l'application.

Les filtres d'usage et de recherche s'appliquent à la carte, à la liste et
aux travaux sélectionnés et à leurs coûts et gains. Les moyennes d'IDC et d'état
restent pondérées par SRE sur **l'ensemble du parc**, y compris les bâtiments
sans travaux : avant = parc au 1er janvier 2027 ; après = mêmes bâtiments,
avec les valeurs après travaux pour les seuls bâtiments du programme sélectionné.
L'**Investissement requis** et les gains absolus restent ceux de ce programme ;
le pourcentage de CO₂ évité est rapporté aux émissions de tout le parc.
Une sélection vide laisse donc les moyennes avant/après identiques.
Les bâtiments gris sont en surveillance et ne génèrent pas de travaux simulés.
Les paramètres sont conservés pendant la session de page,
mais réinitialisés au rechargement. Changer la base personnalisée
réinitialise ses curseurs et son calendrier.

Le bouton « Réinitialiser les filtres » dans la légende efface
l'échéance isolée, les affectations et la recherche, puis ferme la fiche
sélectionnée. Le scénario, ses seuils et l'horizon du programme restent
inchangés. Dans la carte et le diagramme, les points rouges, jaunes et verts restent
à pleine opacité ; les bâtiments au-delà de dix ans sont
gris à 30 % d'opacité, indépendamment de l'horizon des KPI et après modification
des seuils. Cliquer sur « Sous 10 ans » isole les bâtiments dont le premier
besoin apparaît entre cinq et dix ans.

Le nombre de bâtiments et les m² du périmètre sélectionné accompagnent
des widgets KPI agrandis. Pour les bâtiments gris, ces valeurs
représentent le parc sous surveillance, sans rénovation simulée.
Les échéances utilisent les mêmes familles de couleurs sur la carte,
le diagramme, la légende et les fiches : **rouge = immédiat, jaune =
5 ans, vert = 10 ans, gris à 30 % = surveillance au-delà de 10 ans**. Le gris
signifie qu'aucun besoin n'a été identifié dans les dix ans modélisés,
sans prédire une date de rénovation ultérieure. Les nuances dans une
famille indiquent le nombre de critères dépassés. Les formes
d'affectation et les tailles de référence dans la légende sont bleues.

Chaque scénario possède son propre accent, repris sur les seuils,
les curseurs et les widgets : **Base légale rouge, Exemplaire
vert, Modulable bleu**. Les trois seuils sont
séparés en blocs distincts.

### Identité visuelle

Présentation inspirée de l'identité numérique de Genève : jaune
`#ffcd00`, gris chaud et noir, en-tête blanc. Le
[logo officiel](https://www.geneve.ch/themes/custom/vdg_theme/logo.svg)
est conservé sans modification dans [public/ville-geneve.svg](./public/ville-geneve.svg),
conformément au principe de non-altération présenté sur la
[page de mise à disposition](https://www.geneve.ch/autorites-administration/administration-municipale/mise-disposition-logo).
La typographie système Helvetica/Arial est un remplacement, et non la
fonte propriétaire de la charte imprimée. Le prototype n'est pas un
service officiel ni une application homologuée par la Ville.

### Méthode et limites

Voir le [cahier des charges](./CAHIER-DES-CHARGES.md) et le panneau
« Méthode & hypothèses » dans l'application.

- IDC en **MJ/m²/an** ; intensité carbone en **kgCO₂e/m²/an**.
- Début du programme et année de référence fixe : **1er janvier 2027**,
  avec les horizons **2027 / 2032 / 2037**, pour une démonstration reproductible.
  Les dates des changements réglementaires (notamment 2031) ne sont pas décalées ;
  le seuil initial de la Base légale est donc 650 MJ/m²·an et 48 kgCO₂e/m²·an.
- Base légale : seuils IDC de l'art. 14 REn (800 MJ/m²·an, 650 dès 2027, 550 dès 2031 ; rien de programmé ensuite). Exemplaire, jusqu'en 2050 : Plan directeur de l'énergie 2020-2030 (450 MJ/m²·an ; CO₂ 25, puis 13 dès 2030), zéro net en 2050 (IDC 230, CO₂ 1 kgCO₂e/m²·an ; LCl, Stratégie climat de la Ville), valeurs 2040 interpolées (IDC 340, CO₂ 6). Aucune limite légale de CO₂ par bâtiment : les seuils CO₂ sont des équivalents du seuil IDC (voir `Data_legal/`). État : 0,5.
- CO₂ = scope 1 + 2, calculé pour chaque bâtiment à partir de l'IDC, du système de chauffage et du facteur d'émission de son agent (`src/carriers.json` : combustion directe pour le gaz et le mazout, facteur du réseau pour l'électricité et le CAD). Le champ scope 1 de QuantHome n'est pas utilisé (facteurs incohérents, p. ex. 120 bâtiments au gaz avec le facteur du mazout).
- Sans travaux, IDC et CO₂ constants pour tous les agents (facteurs d'émission constants : CAD 0,131, électricité 0,097 kgCO₂e/kWh) ; l'objectif de 1 kgCO₂e/m²·an en 2050 n'est donc pas atteint par un raccordement au CAD.
- Échéance = première année où le bâtiment dépasse un seuil en vigueur cette année-là (calendrier daté, état dégradé avec l'âge), évaluée de 2027 à 2050 dans le tableau de bord comme dans le rapport. Couleurs du tableau de bord : 2027 rouge, 2028–2032 jaune, 2033–2037 vert, gris = aucun seuil dépassé d'ici 2037 (l'année d'un premier dépassement 2038–2050 est indiquée sur la fiche et l'infobulle). Les bâtiments gris n'ont aucun travaux simulés dans les KPI ni la liste ; le rapport HTML les planifie jusqu'en 2050.
- Profondeur de rénovation (interprétation, hypothèse modèle) : indice d'état de l'année des travaux < 0,70 → rénovation complète (façade, toit, cave, fenêtres, changement de chauffage fossile, photovoltaïque ; état remis à 1) ; sinon rénovation énergétique (chauffage, photovoltaïque, toit et cave, sans façade ni fenêtres ; état inchangé), escaladée en rénovation complète si elle laisse un seuil IDC, CO₂ ou d'état en vigueur dépassé entre l'année des travaux et 2037 (tableau de bord) ou 2050 (rapport). La même règle signale « encore hors seuil après travaux », avec l'année et le critère. Une seule rénovation par bâtiment.
- Surfaces d'éléments déduites de la SRE (hypothèses modèle) : façade brute 1,0 m²/m², toiture et cave 0,33 m²/m². Fenêtres = part vitrée de l'affectation × façade brute : Logement 20 % et Administration 60 % (ordres de grandeur donnés par l'utilisateur) ; Logement mixte et Santé & social 25 %, Éducation et Commerce & ateliers 40 %, Culture & loisirs et Sport 30 %, autres 30 % (hypothèses modèle à valider).
- Coûts et gains indicatifs ; aucune faisabilité technique certifiée.
- Aucune IA générative dans cette version : moteur métier déterministe.
- Les noms et positions proviennent des sources réelles. Les valeurs
  manquantes sont estimées et signalées ; l'état et les résultats des travaux
  restent des projections du modèle, pas des diagnostics mesurés.

### Organisation

- [Moteur métier](./src/model.ts) : seuils annuels, priorités et KPI.
- [Données](./src/data.ts) : chargement et validation du parc réel depuis le dossier public.
- [Chargement initial](./src/PortfolioLoader.tsx) : états de chargement et d'erreur, sans données de secours.
- [Données de test](./src/test-data.ts) : lecture du parc local pour les tests d'intégration et générateur fictif réservé aux tests.
- [Pipeline de données](./pipeline/) : sourcing SITG / QuantHome / QBuildings.
- [Tableau de bord](./src/App.tsx) et [carte](./src/BuildingMap.tsx).
- [Tests métier](./src/model.test.ts).
- [Rapport HTML](./src/report/) : calculs ([plan.ts](./src/report/plan.ts)), mise en page ([runtime.js](./src/report/runtime.js), [report.css](./src/report/report.css)) et **textes par défaut** ([texts.ts](./src/report/texts.ts)) ; fonctionnement détaillé : [docs/report.html](./docs/report.html).
- [Transcriptions de cadrage](./transcripts/transcripts.zip).

### Précautions d'intégration réelle

L'intégration SITG/QuantHome est exécutée localement par le pipeline Python.
Avant une mise en production :

1. Révoquer toute clé déjà partagée et générer une nouvelle clé.
2. Ajouter un backend ou proxy pour protéger les identifiants ; aucune
   clé dans le code client, dans une variable `VITE_*`, dans Git ou dans
   les exports.
3. Vérifier les unités, surfaces énergétiques, dates, identifiants et
   disponibilités réelles de l'indice Stratus.
4. Charger un calendrier de seuils **vérifié et sourcé** ; ne pas déduire
   les obligations applicables d'une transcription orale.
5. Traiter explicitement les données manquantes et leur qualité, sans
   leur substituer silencieusement des données fictives.
