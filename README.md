# Energ-IACK-task5

## StratoRéno — Trajectoire Genève

Application web d'aide à la décision pour prioriser la rénovation et la
décarbonation d'un parc municipal. Première version fonctionnelle avec
les **770 bâtiments de la Ville de Genève** (SITG / QuantHome / QBuildings). Les données
ne sont pas versionnées : chacun les génère localement avec ses propres identifiants
(voir [Données](#données)).

### Données

Aucune donnée n'est commitée (`data/`, `*.geojson` et `src/buildings.generated.json`
sont ignorés par Git). Elles sont produites en deux étapes :

1. `npm run data:fetch` — [pipeline/stock.py](./pipeline/stock.py) interroge SITG,
   QuantHome et QBuildings et écrit `data/ville_geneve_core.geojson`
   (réponses brutes en cache dans `data/cache/`).
2. `npm run data:build` — [scripts/build-buildings.mjs](./scripts/build-buildings.mjs)
   convertit ce GeoJSON en `src/buildings.generated.json`, lu par l'application.

`npm run data` enchaîne les deux. Prérequis :

- Python 3.11+ ;
- un fichier `.env` à la racine, copié depuis [.env.example](./.env.example), avec
  votre clé QuantHome (`API_KEY`) et vos accès QBuildings (`QBUILDINGS_*`).
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
- Seuils proposés par l'équipe, non validés réglementairement.
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