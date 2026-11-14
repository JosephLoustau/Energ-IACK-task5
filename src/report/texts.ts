/**
 * Default wording of the HTML report — edit here.
 *
 * - `{name}` placeholders are filled by the report with already formatted values (numbers, years, names).
 *   Keep the placeholders listed in each comment; any other `{…}` is left empty.
 * - Light HTML is allowed (<b>, <i>, <br>, <p>).
 * - Keys ending in a "clause" (e.g. `summaryThermostat`) are optional fragments inserted into a longer
 *   sentence only when they apply; start them with a space.
 * - The reader can still rewrite the main blocks in the report itself ("Modifier le texte").
 * - Table headers and legend labels stay in runtime.js.
 */
export const REPORT_TEXTS = {
  // ---- Page 1 · Synthèse -------------------------------------------------------------
  coverEyebrow: 'Feuille de route · parc bâti municipal',
  coverTitle: 'Décarboner le parc de la Ville de Genève',
  // {strategy} {thermostat} {budget} {scope}
  coverSubtitle: 'Stratégie {strategy}, {thermostat}, {budget}. Périmètre : {scope}.',

  kpiInvestment: 'Investissement',
  kpiInvestmentSub: '{count} bâtiments, {budget}', // {count} {budget}
  kpiFullCost: 'Coût complet',
  kpiFullCostSub: 'avec le CO₂ émis à {scc} CHF/tCO₂', // {scc}
  kpiEmissions: 'Émissions',
  kpiEmissionsSub: '{avoided}/an évitées', // {avoided}
  kpiEnd: 'Fin des travaux',
  kpiEndSub: 'premiers chantiers en {firstYear}', // {firstYear}

  s1Eyebrow: '1 · Synthèse',
  // {buildings} {area} {emissions} {strategy} {thermostatClause} {now} {due} {dueHorizon} {budget} {firstYear} {end} {reduction} {residualClause}
  summary: 'Le parc étudié compte <b>{buildings} bâtiments</b> ({area} m² chauffés) qui émettent <b>{emissions} par an</b>. '
    + 'Avec la stratégie <b>{strategy}</b>{thermostatClause}, <b>{now}</b> d’entre eux franchissent déjà un seuil, '
    + 'et <b>{due}</b> d’ici {dueHorizon}. Rénovés par lots de {budget} dès {firstYear}, ils sont traités d’ici <b>{end}</b>, '
    + 'et les émissions du parc baissent de <b>{reduction}</b>.{residualClause}',
  summaryThermostat: ' et un thermostat abaissé de {degrees} °C', // {degrees}
  summaryResidual: ' {residual} bâtiments demandent une étude spécifique : l’intervention type ne suffit pas à passer sous les seuils.', // {residual}
  s1Figure: 'Situation en {year} : quand chaque bâtiment franchit-il un seuil, sans travaux ?', // {year}
  s1FigureSource: 'SITG, QuantHome. Seuils {strategy}.', // {strategy}
  s1FigureCredit: ' Fond de carte © swisstopo.',
  s1FigureOutside: ' {outside} bâtiments excentrés hors cadre.', // {outside}
  s1Read: 'Couleur : période du premier seuil franchi ; plus la teinte est foncée, plus de critères sont dépassés (IDC, état, CO₂). Forme : usage. Taille : surface chauffée.',
  s1ReadNote: 'Comment lire la carte',

  // ---- Pages 2–3 · Feuille de route ----------------------------------------------------
  s2Eyebrow: '2 · Feuille de route',
  s2Title: 'Le programme {strategy}', // {strategy}
  s2Claim: '{count} bâtiments rénovés de {firstYear} à {end}, par lots annuels de {budget} au plus.', // {count} {firstYear} {end} {budget}
  s2Note: 'Ordre : échéance, puis IDC → état → CO₂, puis gain carbone.',
  s2Figure: 'Année des travaux planifiée',
  s2FigureSource: 'Planification sous plafond budgétaire, hypothèses en annexe B.',
  // {immediate} {year} {half} {full}
  s2Pace: '{immediate} bâtiments sont déjà hors seuil en {year} : ce retard ne se résorbe pas en un an. '
    + 'La moitié du gain CO₂ est acquise en <b>{half}</b>, la totalité en <b>{full}</b>. '
    + 'Retarder un bâtiment coûte plus cher, car son état continue de se dégrader.',
  s2PaceNote: 'Le rythme',
  s2Capex: 'Investissement annuel',
  s2CapexSource: 'Prix {year}, hors inflation et subventions.', // {year}
  s2CapexBeyond: ' {beyond} bâtiments planifiés après {horizon}.', // {beyond} {horizon}
  s2Gantt: 'Calendrier des lots',
  s2GanttSource: 'Études, puis appel d’offres, puis travaux ; le gain CO₂ compte dès l’année suivante.',

  // ---- Page 4 · Comparaison --------------------------------------------------------------
  s3Eyebrow: '3 · Comparaison',
  s3Title: 'Ce que l’on aurait pu faire mieux',
  s3ClaimGeneric: 'Comparaison avec les autres stratégies, au même budget et au même thermostat.',
  // {ambitious} {conservative} {dCost} {dCo2} {horizon}
  s3Claim: 'La stratégie {ambitious} coûte {dCost} de plus que la stratégie {conservative} et évite {dCo2} de plus d’ici {horizon}.',
  s3Note: 'Coût complet = investissement + {scc} CHF par tonne de CO₂ émise, {year}–{horizon}.', // {scc} {year} {horizon}
  s3Figure: 'Émissions annuelles du parc selon la stratégie',
  s3FigureSource: 'Budget {budget}, {thermostat}.', // {budget} {thermostat}
  s3PerTonne: 'Chaque tonne évitée en plus coûte environ <b>{perTonne} CHF</b>. ', // {perTonne}
  s3Worth: 'Avec un coût social du carbone de {scc} CHF/tCO₂, l’ambition <b>est rentable pour la société</b>.', // {scc}
  // {scc} {horizon}
  s3NotWorth: 'Avec un coût social du carbone de {scc} CHF/tCO₂, l’ambition ne le devient qu’au-delà de ce prix. '
    + 'L’écart vient surtout de ce que le rapport ne compte pas : les économies d’énergie et les émissions évitées après {horizon}.',
  // {horizon}
  s3Sobriety: ' Attention : avec le thermostat abaissé, moins de bâtiments franchissent un seuil, et ceux qui sortent du programme gardent leur chauffage fossile. '
    + 'Les émissions de {horizon} sont donc plus élevées : la sobriété complète la rénovation, elle ne la remplace pas.',
  s3PrudenceNote: 'Le coût de la prudence',
  s3Levers: 'Un levier à la fois, comparé au scénario retenu ({scenario})', // {scenario}
  // {combos} {best} {bestCost} {currentCost} {bestCo2Clause}
  s3Best: 'Parmi les {combos} combinaisons testées, le coût complet le plus bas est obtenu par <b>{best}</b> : {bestCost}, contre {currentCost} pour le scénario retenu.{bestCo2Clause}',
  s3BestCo2: ' Les émissions les plus basses viennent de <b>{bestCo2}</b>.', // {bestCo2}
  s3BestNote: 'Meilleure combinaison',

  // ---- Annexes ---------------------------------------------------------------------------
  a1Eyebrow: 'Annexe A',
  a1Title: 'Liste des bâtiments',
  a1Claim: '{scenario}.', // {scenario}
  a1ClaimSort: ' Cliquer sur un en-tête pour trier.',
  a1Note: 'Net CSC : coût des travaux moins la valeur, au CSC, du CO₂ évité jusqu’en {horizon}.', // {horizon}
  // {buildings} {works} {safe}
  a1Summary: '{buildings} bâtiments, dont <b>{works}</b> avec travaux planifiés et {safe} en surveillance. La liste détaillée n’est pas affichée par défaut.',

  a2Eyebrow: 'Annexe B',
  a2Title: 'Paramètres et hypothèses',
  a2Claim: 'Les valeurs saisies pour ce rapport, puis la méthode derrière chaque chiffre.',
  // Hypotheses: placeholders {year} {dueHorizon} {firstYear} {saving} {horizon}
  hypotheses: [
    ['Déclenchement', 'Un bâtiment entre au programme dès qu’un critère dépasse son seuil (IDC, état, CO₂), au premier franchissement entre {year} et {horizon} (la carte de synthèse distingue les échéances jusqu’en {dueHorizon}). Sans travaux, l’IDC et le CO₂ restent constants (facteurs d’émission constants pour tous les agents, CAD et électricité compris) et l’état se dégrade avec l’âge (courbe en S).'],
    ['Intervention type', 'Paquet recommandé selon la raison de la rénovation (hypothèse modèle) : si l’indice d’état de l’année des travaux est inférieur à 0,70, <b>rénovation complète</b> — isolation (façade, toit, cave), fenêtres, remplacement du chauffage fossile (raccordement obligatoire au CAD s’il est dans la rue, sinon PAC air/eau ; système non fossile conservé) et photovoltaïque si possible, état remis à 1. Sinon <b>rénovation énergétique</b> — chauffage, photovoltaïque, toit et cave, sans façade ni fenêtres, état inchangé — sauf si elle laisse un seuil en vigueur dépassé avant {horizon} : rénovation complète. Fenêtres = part vitrée de l’affectation × façade brute (1 m² par m² chauffé ; Logement 20 %, Administration 60 %, autres affectations : hypothèses modèle). Coût = somme des mesures chiffrées par bâtiment. Un bâtiment qui dépasse encore un seuil en vigueur entre ses travaux et {horizon} est signalé « à étudier ». Une seule rénovation par bâtiment.'],
    ['Planification', 'Premiers travaux en {firstYear} (une année d’études, une année d’appel d’offres). Les bâtiments sont placés par ordre de priorité, chacun la première année où le budget le permet. Un bâtiment plus coûteux que le plafond occupe seul son année. Le gain CO₂ compte dès l’année suivant les travaux.'],
    ['Thermostat', 'Une baisse de n °C multiplie l’IDC et le CO₂ de chaque bâtiment par (1 − {saving} % × n), dès {year} et avant la vérification des seuils. Règle empirique, appliquée uniformément.'],
    ['Coût social du carbone', 'Coût marginal des dommages causés par une tonne de CO₂ supplémentaire. Coût complet = investissement + CSC × tonnes émises de {year} à {horizon}, sans actualisation. Par bâtiment, le coût net CSC retranche la valeur des tonnes évitées jusqu’en {horizon}.'],
    ['Limites', 'Non modélisés : faisabilité PAC/CAD, patrimoine protégé, subventions, inflation, économies d’exploitation, carbone gris des travaux, capacité des entreprises, émissions après {horizon}. Facteurs d’émission constants : la décarbonation future du CAD et de l’électricité n’est pas comptée, et l’objectif de 1 kgCO₂e/m²·an en 2050 n’est pas atteint par un raccordement au CAD (0,131 kg/kWh).'],
    ['Sources', 'SITG, QuantHome. Indice d’état = proxy (âge, travaux récents), pas un diagnostic Stratus. Base légale : seuils IDC de l’art. 14 REn (800, puis 650 dès 2027 et 550 dès 2031) ; Exemplaire : Plan directeur de l’énergie 2020-2030 (IDC 450, CO₂ 25 puis 13 dès 2030), puis zéro net en 2050 (LCl, Stratégie climat de la Ville : IDC 230, CO₂ 1) ; valeurs de 2040 interpolées. Aucune limite légale de CO₂ par bâtiment : seuils CO₂ = équivalents du seuil IDC. CO₂ = scope 1 + 2, calculé pour chaque bâtiment à partir de l’IDC, du système de chauffage et du facteur d’émission de son agent ; le champ scope 1 de QuantHome n’est pas utilisé (facteurs incohérents).'],
  ] as [string, string][],
  a2Footer: 'Document d’aide à la décision généré par DeCathlon Genève le {date}. Les seuils, coûts et calendriers sont des hypothèses de simulation, pas des obligations légales ni des devis.', // {date}

  // ---- Toolbar help ("?") ------------------------------------------------------------------
  helpThermostatTitle: 'Agir sur la demande avant de rénover',
  // {saving} {year}
  helpThermostat: '<p>Baisser le thermostat de tous les bâtiments (par exemple de 21 à 20 °C) réduit la chaleur consommée d’environ {saving} % par degré, dès {year} et presque sans investissement.</p>'
    + '<p>L’IDC et les émissions de chaque bâtiment baissent d’autant. Certains bâtiments repassent sous les seuils et sortent du programme : le budget baisse, mais ces bâtiments gardent leur chauffage actuel.</p>'
    + '<p class="muted">Hypothèse indicative, appliquée uniformément ; confort et usages sensibles non modélisés.</p>',
  helpSccTitle: 'Coût social du carbone (CSC)',
  // {year} {horizon} {defaultScc}
  helpScc: '<p>Le CSC est le coût marginal d’une tonne de CO₂ supplémentaire : la valeur des dommages qu’elle cause à la société (climat, santé, agriculture, infrastructures), absente des prix du marché.</p>'
    + '<p>Le rapport multiplie les tonnes émises de {year} à {horizon} par le CSC et les ajoute à l’investissement : c’est le <b>coût complet</b>. Les coûts sont affichés avec et sans le CSC.</p>'
    + '<p class="muted">Défaut : {defaultScc} CHF/tCO₂e. Pas d’actualisation ; les émissions après {horizon} ne sont pas comptées.</p>',

  pageFooter: 'DeCathlon Genève · Feuille de route de décarbonation',
};

export type ReportTexts = typeof REPORT_TEXTS;
