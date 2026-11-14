/**
 * Scénario de la vidéo de démonstration (lu par scripts/record-tour.mjs).
 *
 * Chaque ligne est une action, exécutée dans l'ordre. Les sélecteurs sont des sélecteurs Playwright :
 *   CSS                 '[data-tour="map"]', '#threshold-idc', 'button[data-strategy="ambitious"]'
 *   texte               'text=Exporter la stratégie'
 *   rôle + nom          'role=button[name="Visite guidée"]'
 *   n-ième élément      '.building-list .building-name >> nth=2'
 *
 * Actions disponibles (toutes acceptent `wait` : pause en ms après l'action, défaut 400) :
 *   { wait: 3000 }                                   pause
 *   { caption: 'Texte' } / { caption: null }         affiche / masque un sous-titre
 *   { tour: 'start' | 'next' | 'prev' | 'end' }      pilote la visite guidée (fast: true : sans bouger le curseur)
 *   { click: sélecteur, offset?: [x, y] }            clic (au centre, ou à x,y px du coin de l'élément)
 *   { click: sélecteur, fast: true }                 clic direct, le curseur ne bouge pas (élément hors écran…)
 *   { hover: sélecteur }                             survol
 *   { move: [x, y] }                                 déplace la souris à une position de l'écran
 *   { type: sélecteur, text: '…' }                   saisie au clavier
 *   { key: 'Escape' }                                touche
 *   { slider: sélecteur, to: 600, duration?: 1200 }  fait glisser un curseur jusqu'à une valeur
 *   { zoom: 3, at?: sélecteur }                      molette, ≈ en niveaux de zoom (positif = avant), par défaut sur la carte
 *   { zoom: 2, on: [lng, lat] }                      … centrée sur un point géographique de la carte
 *   { zoom: 3, on: 'selected' }                      … sur le bâtiment sélectionné (la carte se centre d'abord dessus)
 *   { drag: sélecteur, by: [dx, dy] }                glisser (ex. déplacer la carte)
 *   { scroll: sélecteur, offset?: 64 }               fait défiler pour amener l'élément en haut de l'écran
 *   { scrollBy: 800 }                                fait défiler de 800 px (négatif = vers le haut)
 *   { report: 'open' | 'close' }                     ouvre le rapport (bouton « Exporter ») / le referme
 *   … , in: 'report'                                 l'action vise un élément du rapport ouvert (click, hover,
 *                                                    type, slider, scroll, scrollBy)
 *   { run: async (page) => { … } }                   code Playwright libre
 */
export default [
  { caption: 'DeCathlon Genève — planifier la rénovation du parc bâti de la Ville', wait: 2500 },
  { caption: null, wait: 200 },

  // 1. Scénarios : passer en Modulable
  { tour: 'start', wait: 1500 },
  { click: 'button[data-strategy="custom"]', wait: 800 },

  // 2. Curseurs : dépense de chaleur à 600, puis intensité carbone de 48 à 42
  { tour: 'next', wait: 1200 },
  { slider: '#threshold-idc', to: 600, duration: 700, wait: 1000 },
  { slider: '#threshold-carbon', to: 42, duration: 1400, wait: 2000 },

  // 3. Carte : zoom moyen sur le centre-ville, puis filtrer Administration + Éducation
  { tour: 'next', wait: 1200 },
  { zoom: 2, on: [6.143, 46.203], duration: 1800, wait: 1200 },
  { click: 'button.use-filter:has-text("Administration")', wait: 600 },
  { click: 'button.use-filter:has-text("Éducation")', wait: 1800 },

  // 4. Légende (les filtres Administration + Éducation restent actifs)
  { tour: 'next', wait: 2500 },

  // 5. Diagramme : isoler « Immédiat »
  { tour: 'next', wait: 1200 },
  { click: 'button[data-cohort="now"]', wait: 1500 },

  // 6. Indicateurs
  { tour: 'next', wait: 2200 },

  // 7. Feuille de route : montrer l'icône « Mesures de rénovation » (sans cliquer), puis passer à la suite sans bouger le curseur
  { tour: 'next', wait: 1200 },
  { hover: '.building-list .row-actions button[aria-label^="Mesures de rénovation"]', wait: 1500 },
  { tour: 'next', fast: true, wait: 1200 },

  // 8. Mesures : décocher isolation de la façade, isolation de la toiture, remplacement des fenêtres
  { click: '.measure-list li:has-text("façade") input:checked', wait: 700 },
  { click: '.measure-list li:has-text("Isolation de la toiture") input:checked', wait: 700 },
  { click: '.measure-list li:has-text("Remplacement des fenêtres") input:checked', wait: 1500 },
  // … puis voir le bâtiment sur la carte et zoomer jusqu'au rendu 3D
  { click: '.measures-pane button:has-text("Voir sur la carte")', wait: 800 },
  { zoom: 3.5, on: 'selected', duration: 2500, wait: 2500 },

  // 9. Export : ouvrir le rapport, changer ses paramètres, le parcourir page par page (la vidéo s'y termine)
  { tour: 'next', wait: 2000 },
  { report: 'open', wait: 2000 },
  { click: 'button[data-comfort="1"]', in: 'report', wait: 1200 },
  { click: '.seg button:text-is("120")', in: 'report', wait: 1800 },
  { scroll: '.pages > .page >> nth=1', in: 'report', wait: 1800 },
  { scroll: '.pages > .page >> nth=2', in: 'report', wait: 1800 },
  { scroll: '.pages > .page >> nth=3', in: 'report', wait: 1800 },
  { scroll: '.pages > .page >> nth=4', in: 'report', wait: 800 },
  { click: 'button[data-action="list"]', in: 'report', wait: 1500 },
  { scrollBy: 500, in: 'report', duration: 1500, wait: 1500 },
];
