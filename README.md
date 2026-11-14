# Energ-IACK-task5

## StratoRéno — Trajectoire Genève

Application web d'aide à la décision pour prioriser la rénovation et la
décarbonation d'un parc municipal. Première version fonctionnelle avec
les **770 bâtiments de la Ville de Genève** (SITG / QuantHome / QBuildings). Les données
ne sont pas versionnées : chacun les génère localement avec ses propres identifiants
(voir [Données](#données)).

### Données

Aucune donnée n'est commitée (`data/`, `*.geojson` et `src/buildings.generated.json`
sont ignorés par Git). `npm run data` (lancé aussi avant `npm run dev` / `npm run build`)
exécute [pipeline/stock.py](./pipeline/stock.py), qui interroge SITG, QuantHome et, si
configuré, QBuildings (réponses brutes en cache dans `data/cache/`), écrit
`public/data/ville_geneve_3d.geojson` et passe les bâtiments à
[scripts/build-buildings.mjs](./scripts/build-buildings.mjs), qui écrit
`src/buildings.generated.json`. En cas d'échec, les fichiers existants sont conservés.
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

Le modèle de données et la provenance des attributs sont décrits dans
[docs/data_model.html](./docs/data_model.html).

### Lancer l'application

Prérequis : Node.js 22.12+ ou une version LTS ultérieure compatible avec Vite,
et les données générées (voir ci-dessus).

```powershell
npm ci
npm run data   # première fois, ou pour rafraîchir les données
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

1. Explorer le programme immédiat du scénario **Base légale**.
2. Passer à **Exemplaire** et comparer les KPI.
3. Ouvrir **Modulable**, choisir une base et modifier les curseurs.
   Les repères S1/S2 et leurs valeurs, affichés uniquement dans ce
   scénario, comparent les deux références sans les modifier.
4. Ajouter, par exemple, un seuil IDC de 450 en 2030 : **exemple de
   simulation seulement**, pas calendrier légal confirmé.
5. Comparer les programmes cumulés en 2026, 2031 et 2036, puis cliquer sur
   une couleur pour isoler une catégorie.
6. Cliquer sur un point ou une ligne pour lire les motifs, les coûts et les
   gains supposés. Exporter la sélection en CSV.

Les filtres d'usage et de recherche s'appliquent à la carte, à la liste et
aux KPI. Les bâtiments gris sont en surveillance et ne génèrent pas de
travaux simulés. Les paramètres sont conservés pendant la session de page,
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
- Année de référence fixe : **2026**, pour une démonstration reproductible.
- Base légale : seuils IDC de l'art. 14 REn (800 MJ/m²·an, 650 dès 2027, 550 dès 2031 ; rien de programmé ensuite). Exemplaire, jusqu'en 2050 : Plan directeur de l'énergie 2020-2030 (450 MJ/m²·an ; CO₂ 25, puis 13 dès 2030), zéro net en 2050 (IDC 230, CO₂ 1 kgCO₂e/m²·an ; LCl, Stratégie climat de la Ville), valeurs 2040 interpolées (IDC 340, CO₂ 6). Aucune limite légale de CO₂ par bâtiment : les seuils CO₂ sont des équivalents du seuil IDC (voir `Data_legal/`). État : 0,5.
- CO₂ = scope 1 + 2, calculé pour chaque bâtiment à partir de l'IDC, du système de chauffage et du facteur d'émission de son agent (`src/carriers.json` : combustion directe pour le gaz et le mazout, facteur du réseau pour l'électricité et le CAD). Le champ scope 1 de QuantHome n'est pas utilisé (facteurs incohérents, p. ex. 120 bâtiments au gaz avec le facteur du mazout).
- Sans travaux, IDC et CO₂ constants pour tous les agents (facteurs d'émission constants : CAD 0,131, électricité 0,097 kgCO₂e/kWh) ; l'objectif de 1 kgCO₂e/m²·an en 2050 n'est donc pas atteint par un raccordement au CAD.
- Échéance = première année où le bâtiment dépasse un seuil en vigueur cette année-là (calendrier daté, état dégradé avec l'âge), évaluée de 2026 à 2050 dans le tableau de bord comme dans le rapport. Couleurs du tableau de bord : 2026 rouge, 2027–2031 jaune, 2032–2036 vert, gris = aucun seuil dépassé d'ici 2036 (l'année d'un premier dépassement 2037–2050 est indiquée sur la fiche et l'infobulle). Les bâtiments gris n'ont aucun travaux simulés dans les KPI, la liste ni l'export CSV ; le rapport HTML les planifie jusqu'en 2050.
- Profondeur de rénovation (interprétation, hypothèse modèle) : indice d'état de l'année des travaux < 0,70 → rénovation complète (façade, toit, cave, fenêtres, changement de chauffage fossile, photovoltaïque ; état remis à 1) ; sinon rénovation énergétique (chauffage, photovoltaïque, toit et cave, sans façade ni fenêtres ; état inchangé), escaladée en rénovation complète si elle laisse un seuil IDC, CO₂ ou d'état en vigueur dépassé entre l'année des travaux et 2036 (tableau de bord) ou 2050 (rapport). La même règle signale « encore hors seuil après travaux », avec l'année et le critère. Une seule rénovation par bâtiment.
- Surfaces d'éléments déduites de la SRE (hypothèses modèle) : façade brute 1,0 m²/m², toiture et cave 0,33 m²/m². Fenêtres = part vitrée de l'affectation × façade brute : Logement 20 % et Administration 60 % (ordres de grandeur donnés par l'utilisateur) ; Logement mixte et Santé & social 25 %, Éducation et Commerce & ateliers 40 %, Culture & loisirs et Sport 30 %, autres 30 % (hypothèses modèle à valider).
- Coûts et gains indicatifs ; aucune faisabilité technique certifiée.
- Aucune IA générative dans cette version : moteur métier déterministe.
- Seuls des noms et positions fictifs sont utilisés ; les performances
  ne sont pas attribuées à de vrais bâtiments municipaux.

### Organisation

- [Moteur métier](./src/model.ts) : seuils annuels, priorités et KPI.
- [Données](./src/data.ts) : parc réel généré localement, plus un générateur fictif déterministe.
- [Pipeline de données](./pipeline/) : sourcing SITG / QuantHome / QBuildings.
- [Tableau de bord](./src/App.tsx) et [carte](./src/BuildingMap.tsx).
- [Tests métier](./src/model.test.ts).
- [Rapport HTML](./src/report/) : calculs ([plan.ts](./src/report/plan.ts)), mise en page ([runtime.js](./src/report/runtime.js), [report.css](./src/report/report.css)) et **textes par défaut** ([texts.ts](./src/report/texts.ts)) ; fonctionnement détaillé : [docs/report.html](./docs/report.html).
- [Transcriptions de cadrage](./transcripts/transcripts.zip).

### Intégration réelle ultérieure

L'intégration SITG/Quanthome et la lecture détaillée du guide API sont
reportées à une étape dédiée. Avant cette étape :

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
