# Cahier des charges — DeCathlon Genève, MVP stratégique

## Objectif

Aider les décideurs de la Ville de Genève à identifier les bâtiments
municipaux à traiter, comprendre leur priorité et estimer l'enveloppe
stratégique et le potentiel de décarbonation.

La version initiale est une application interactive, pas une maquette
statique ni un diagnostic réglementaire. Elle utilise exclusivement des
données fictives. Elle ne décide pas des crédits à voter.

## Périmètre et utilisateurs

- Décideurs municipaux, responsables énergie et patrimoine.
- 96 bâtiments fictifs : écoles, musées, administrations, sports,
  logements de la Ville.
- Carte centrée sur Genève ; positions et noms marqués comme fictifs.
- Interface française, utilisable sur ordinateur et mobile.
- Pas de connexion à SITG/Quanthome, d'authentification, de chatbot ou
  d'optimisation sous contrainte de budget dans cette version.

## Stratégies

| Stratégie | État Stratus | IDC (MJ/m²/an) | CO₂e (kg/m²/an) |
|---|---:|---:|---:|
| 1. Base légale (à valider) | < 0,5 | > 600 | > 20 |
| 2. Exemplaire | < 0,7 | > 450 | > 6 |
| 3. Modulable | Curseur 0–1 | Curseur 200–1 000 | Curseur 1–80 |

Les valeurs prédéfinies sont celles demandées par l'équipe. Elles ne
constituent pas des seuils réglementaires vérifiés.

La stratégie personnalisée copie l'une des deux bases. Les stratégies
prédéfinies restent intactes. Changer la base ou réinitialiser supprime
les modifications et les changements futurs de la stratégie
personnalisée ; ce comportement est annoncé dans l'interface.

Dans le scénario modulable, chaque plage affiche des repères fixes
S1/S2 et les valeurs des deux scénarios prédéfinis. Ils restent
identiques lorsque le scénario modulable change et ne sont pas des
curseurs supplémentaires. Les seuils sont séparés en blocs.

Accents des scénarios, repris dans les curseurs et les KPI :
Base légale rouge, Exemplaire vert, Modulable bleu.
Ces accents sont indépendants des couleurs d'échéance.

## Classification

Un seul critère hors seuil suffit. Les comparaisons sont strictes :
l'égalité exacte au seuil ne déclenche pas ce critère.

L'indice d'état va de **0 = ruine à 1 = neuf**. C'est un indicateur d'état,
malgré l'usage du terme « vétusté » dans les échanges.

L'application cherche le premier franchissement chaque année de 2026
à 2036 :

- Rouge : franchissement en 2026.
- Jaune : premier franchissement de 2027 à 2031 inclus.
- Vert : premier franchissement de 2032 à 2036 inclus.
- Bleu : aucun franchissement identifié jusqu'en 2036 inclus ;
  surveillance au-delà de dix ans, sans date de travaux prédite.

La couleur représente une échéance **sans travaux**, pas l'état après
rénovation ni la conformité du bâtiment à la date sélectionnée.

La liste est triée par année d'échéance croissante, puis, à année égale,
par présence des critères déclenchés **IDC, état, CO₂**, dans cet ordre.
Les égalités sont départagées par potentiel de réduction annuelle
absolue de CO₂ décroissant, puis identifiant stable.

## Projection et seuils annuels

Année de référence fixe : 2026. Projection annuelle, non mensuelle.

```text
état(t) = max(0, état(2026) − dégradation annuelle × (t − 2026))
```

- IDC et intensité CO₂ restent constants sans intervention.
- La dégradation annuelle fictive varie de 0,012 à 0,030 point d'état.
- Sans calendrier, les seuils de 2026 restent constants.
- La stratégie personnalisée permet des changements datés de 2027 à
  2036 pour les trois critères.
- Un changement entre en vigueur dès son année et reste applicable
  jusqu'au suivant ; une seule entrée est autorisée par année.
- Les changements sont des hypothèses de simulation, non des lois.

L'architecture accepte donc un futur calendrier réglementaire sans
inventer aujourd'hui ses valeurs ni faire évoluer artificiellement
l'IDC ou le CO₂ des bâtiments.

## Rénovation générique et KPI

Chaque bâtiment non vert du programme sélectionné reçoit une
intervention générique, à sa première échéance :

```text
coût CHF = surface m² × [550 + 900 × (1 − état à échéance)]
IDC après = IDC avant × 0,55
état après = max(état à échéance, 0,92)
CO₂ après kg/m²/an = min(CO₂ avant, IDC après / 3,6 × 0,035)
gain annuel tCO₂e = (CO₂ avant − CO₂ après) × surface / 1 000
```

Le facteur de 0,035 kgCO₂e/kWh est une hypothèse de chauffage bas
carbone générique après intervention. Il n'est pas une valeur garantie
pour une PAC ou un raccordement CAD réel.

Le programme combine rénovation de l'enveloppe et chauffage
décarboné. Il ne certifie ni leur faisabilité ni le respect de tous les
seuils après travaux. Un avertissement apparaît dans la fiche si
l'intervention générique laisse un dépassement.

KPI :

1. Somme des coûts estimés en CHF, hors inflation et actualisation.
2. Gain annuel de CO₂e en tonnes/an, et pourcentage des émissions
   sélectionnées avant travaux.
3. IDC moyen avant/après, pondéré par surface énergétique.
4. État moyen avant/après, pondéré par surface énergétique ; état
   avant pris à l'échéance de chaque intervention.
5. Nombre de bâtiments à rénover et surface concernée.

Les moyennes avant/après utilisent le même ensemble de bâtiments.
Chaque intervention est comptée une seule fois dans le cumul. Le
gain CO₂ indique le potentiel annuel lorsque les interventions sont
achevées, pas des tonnes cumulées sur cinq ou dix ans.

Les bâtiments gris n'ont pas de travaux simulés. Une sélection vide
affiche des coûts/gains nuls et des moyennes non applicables, pas
des valeurs `NaN` ni un état moyen fictif.

## Interactions

- Choix des trois stratégies.
- Widgets KPI agrandis, avec nombre de bâtiments et surface sélectionnée
  dans un format plus compact ; en gris, périmètre de surveillance.
- Même code couleur sur carte, diagramme, légende et fiches : rouge
  immédiat, jaune cinq ans, vert dix ans, gris à 30 % au-delà de dix ans.
- Symboles d'affectation et tailles de référence de la légende en bleu.
- Logo officiel de Genève conservé sans altération, identité numérique
  jaune/noir/gris et typographie système de remplacement. Prototype
  explicitement non officiel.
- Curseurs et changements futurs dans la stratégie personnalisée.
- Programme cumulé : aujourd'hui, d'ici 2031, d'ici 2036.
- Sélection exclusive d'une catégorie en cliquant sa couleur ; un
  second clic revient au cumul actif.
- Carte et diagramme : les points rouges, jaunes et verts restent à pleine
  opacité, les points gris au-delà de dix ans à 30 %, indépendamment de
  l'horizon du programme et après modification des seuils.
  Seuls les filtres explicites masquent des bâtiments.
- Recherche par nom fictif, quartier ou identifiant ; filtre par usage.
- Carte, liste et KPI utilisent le même périmètre de filtres.
- Clic sur un marqueur ou une ligne : fiche bâtiment et justification.
- Le clic sur un bâtiment ne modifie pas le périmètre des KPI.
- Export CSV du programme ou de la catégorie filtrée, avec mention
  des données fictives.
- Panneau de méthode, unités et limites accessibles depuis l'en-tête.

Les paramètres sont conservés en mémoire pendant la session de page.
Le rechargement revient à la configuration initiale.

## Critères d'acceptation

- Les trois seuils prédéfinis sont exacts, avec leurs unités.
- Chacun des trois critères peut déclencher seul.
- L'égalité au seuil, les limites cinq/dix ans et les changements
  annuels sont testés.
- Les quatre couleurs sont présentes dans le parc conservatoire.
- Les programmes cumulés ne doublonnent pas les rénovations.
- La stratégie personnalisée ne modifie pas les bases.
- La carte, la liste et les KPI se synchronisent sans rechargement.
- La fiche explique les critères à l'année de première échéance.
- Les moyennes sont pondérées et les gains carbone cohérents.
- Les cas vides et les saisies de calendrier invalides sont explicites.
- Le fond cartographique indisponible déclenche un avertissement ;
  les points, calculs et tableaux restent accessibles.
- Le code passe la vérification TypeScript, les tests et la compilation.
- Aucun identifiant API ni donnée réelle confidentielle dans le client.

## Hors périmètre et intégration ultérieure

La version ne modélise pas les monuments protégés, les réseaux
électriques, la faisabilité CAD/PAC, les projets déjà engagés, les
subventions, le carbone des travaux, les économies d'exploitation,
les priorités politiques ou l'exécution réelle des chantiers.

L'intégration réelle nécessitera un backend pour les clés, une
validation des données et un calendrier légal sourcé. Toute clé
exposée auparavant doit être révoquée. L'IA pourra ensuite aider à
expliquer les stratégies à partir de résultats vérifiés ; elle ne sera
pas utilisée comme source autonome de calculs.

## Sources du cadrage

- [Transcriptions](./transcripts/transcripts.zip) : échanges de cadrage,
  notamment distinction stratégique/opérationnelle, Stratus et IDC.
- Tableau blanc partagé et décisions de l'équipe pendant la session
  de cadrage du 13 novembre 2026.
- Le guide API n'est pas encore analysé : intégration reportée.
