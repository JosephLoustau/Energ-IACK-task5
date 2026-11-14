/**
 * Version rapide de la démonstration, sans la visite guidée : mêmes actions que scenario.mjs,
 * enchaînées directement dans l'interface. Format des actions : voir scenario.mjs.
 *
 *   CURSOR_SPEED=1.4 PAUSE=400 npm run video -- scripts/demo/rapide.mjs   → videos/rapide.webm (≈ 1 min 20)
 */
/** Facteur appliqué à toutes les pauses : règle la durée totale de la vidéo. */
const WAIT_SCALE = 1.8;

export default [
  { caption: 'DeCathlon Genève — planifier la rénovation du parc bâti de la Ville', wait: 1500 },
  { caption: null, wait: 100 },

  // 1. Scénarios : passer en Modulable
  { click: 'button[data-strategy="custom"]', wait: 500 },

  // 2. Curseurs : dépense de chaleur à 600, puis intensité carbone à 42
  { slider: '#threshold-idc', to: 600, duration: 500, wait: 500 },
  { slider: '#threshold-carbon', to: 42, duration: 800, wait: 900 },

  // 3. Carte : zoom sur le centre-ville, puis filtrer Administration + Éducation
  { zoom: 2, on: [6.143, 46.203], duration: 1000, wait: 600 },
  { click: 'button.use-filter:has-text("Administration")', wait: 300 },
  { click: 'button.use-filter:has-text("Éducation")', wait: 900 },

  // 4. Diagramme : isoler « Immédiat »
  { click: 'role=tab[name*="Diagramme"]', wait: 700 },
  { click: 'button[data-cohort="now"]', wait: 1000 },

  // 5. Indicateurs
  { hover: '[data-tour="kpis"]', wait: 800 },

  // 6. Feuille de route : ouvrir les mesures de rénovation du premier bâtiment
  { click: '.building-list .row-actions button[aria-label^="Mesures de rénovation"]', wait: 900 },

  // 7. Mesures : décocher isolation de la façade, de la toiture, remplacement des fenêtres
  { click: '.measure-list li:has-text("façade") input:checked', wait: 400 },
  { click: '.measure-list li:has-text("Isolation de la toiture") input:checked', wait: 400 },
  { click: '.measure-list li:has-text("Remplacement des fenêtres") input:checked', wait: 900 },
  // … puis voir le bâtiment sur la carte et zoomer jusqu'au rendu 3D
  { click: '.measures-pane button:has-text("Voir sur la carte")', wait: 500 },
  { zoom: 3.5, on: 'selected', duration: 1500, wait: 1500 },

  // 8. Export : ouvrir le rapport, changer ses paramètres, le parcourir page par page
  { report: 'open', wait: 1200 },
  { click: 'button[data-comfort="1"]', in: 'report', wait: 700 },
  { click: '.seg button:text-is("120")', in: 'report', wait: 1000 },
  { scroll: '.pages > .page >> nth=1', in: 'report', duration: 700, wait: 1000 },
  { scroll: '.pages > .page >> nth=2', in: 'report', duration: 700, wait: 1000 },
  { scroll: '.pages > .page >> nth=3', in: 'report', duration: 700, wait: 1000 },
  { scroll: '.pages > .page >> nth=4', in: 'report', duration: 700, wait: 500 },
  { click: 'button[data-action="list"]', in: 'report', wait: 900 },
  { scrollBy: 500, in: 'report', duration: 900, wait: 1000 },
].map((step) => ('wait' in step ? { ...step, wait: Math.round(step.wait * WAIT_SCALE) } : step));
