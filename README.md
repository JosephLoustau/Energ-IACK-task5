# Energ-IACK-task5

## ÉnergiACK — Trajectoire Genève

Application web d'aide à la décision pour prioriser la rénovation et la
décarbonation d'un parc municipal. Première version fonctionnelle avec
les **770 bâtiments de la Ville de Genève** (SITG / QuantHome, `ville_geneve_core.geojson`), sans accès API ni chatbot. Régénérer les données : `npm run data`.

### Lancer l'application

Prérequis : Node.js 22.12+ ou une version LTS ultérieure compatible avec Vite.

```powershell
npm ci
npm run dev
```

Ouvrir l'adresse locale affichée dans le terminal (par défaut
http://127.0.0.1:5173). Le fond OpenStreetMap et les polices web nécessitent
Internet. Les marqueurs, les calculs et la liste restent accessibles si le
fond de carte échoue ; un avertissement est affiché. Les polices disposent
d'un repli système.

```powershell
npm test
npm run build
npm run preview
```

### Parcours de démonstration

1. Explorer le programme immédiat de la stratégie **Conservatoire**.
2. Passer à **Accélération carbone** et comparer les KPI.
3. Ouvrir **À votre mesure**, choisir une base et modifier les curseurs.
4. Ajouter, par exemple, un seuil IDC de 450 en 2030 : **exemple de
   simulation seulement**, pas calendrier légal confirmé.
5. Comparer les programmes cumulés en 2026, 2031 et 2036, puis cliquer sur
   une couleur pour isoler une catégorie.
6. Cliquer sur un point ou une ligne pour lire les motifs, les coûts et les
   gains supposés. Exporter la sélection en CSV.

Les filtres d'usage et de recherche s'appliquent à la carte, à la liste et
aux KPI. Les bâtiments verts sont en surveillance et ne génèrent pas de
travaux simulés. Les paramètres sont conservés pendant la session de page,
mais réinitialisés au rechargement. Changer la base personnalisée
réinitialise ses curseurs et son calendrier.

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
- [Données fictives](./src/data.ts) : génération déterministe.
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