/**
 * Parcours de démonstration : chaque étape cible un élément `data-tour="<target>"`.
 * Pour enrichir la visite, il suffit d'ajouter ou de modifier des étapes ici ;
 * la mécanique d'affichage est dans Tour.tsx.
 */
export interface TourStep {
  target: string;
  title: string;
  body: string;
  /** Action facultative exécutée en entrant dans l'étape (ex. changer d'onglet). */
  onEnter?: 'tab-map' | 'tab-chart';
}

export const TOUR_STEPS: TourStep[] = [
  { target: 'strategies', title: 'Choisissez un scénario', body: 'Trois approches : Base légale, Exemplaire ou Modulable. Le scénario fixe les seuils qui déclenchent une rénovation.' },
  { target: 'thresholds', title: 'Ajustez les curseurs', body: 'IDC, état du bâtiment et intensité carbone : un seul seuil dépassé suffit à rendre un bâtiment prioritaire. Les repères S1 et S2 indiquent les valeurs de référence. Dans le scénario Modulable, les curseurs sont libres.', },
  { target: 'map', title: 'Lisez la carte', body: 'La taille suit la surface énergétique et la forme indique l’affectation. Rouge : immédiat ; jaune : 5 ans ; vert : 10 ans, tous à pleine opacité. Gris à 30 % : surveillance au-delà de 10 ans. Une teinte plus foncée indique davantage de critères dépassés.', onEnter: 'tab-map' },
  { target: 'legend', title: 'Filtrez avec la légende', body: 'Cliquez sur une échéance pour n’afficher que ces bâtiments, ou sur une affectation pour isoler un type d’usage.' },
  { target: 'chart-tab', title: 'Passez au diagramme', body: 'IDC en abscisse, intensité carbone en ordonnée : repérez d’un coup d’œil les bâtiments hors seuils.', onEnter: 'tab-chart' },
  { target: 'kpis', title: 'Mesurez l’impact', body: 'Les widgets montrent le coût estimé, le CO₂ évitable, l’IDC et l’état moyens. Leur couleur suit le scénario : rouge pour Base légale, vert pour Exemplaire, bleu pour Modulable. Les bâtiments et m² précisent le périmètre.' },
  { target: 'roadmap', title: 'Consultez la feuille de route', body: 'La liste classe les bâtiments par échéance et critères ; elle s’exporte en CSV.' },
];
