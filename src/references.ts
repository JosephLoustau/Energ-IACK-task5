// Lexique et sources affichés dans « Méthode & hypothèses ».

export interface Term { term: string; definition: string }
export interface Source { id: string; title: string; author: string; year?: number; url?: string; use: string }

export const GLOSSARY: Term[] = [
  { term: 'IDC', definition: 'Indice de dépense de chaleur : énergie consommée pour le chauffage et l’eau chaude, par m² de SRE et par an (MJ/m²·an). Calculé par l’OCEN à partir des consommations mesurées.' },
  { term: 'SRE', definition: 'Surface de référence énergétique : somme des surfaces de plancher chauffées (m²). Sert de base à l’IDC et au CO₂ par m².' },
  { term: 'CAD', definition: 'Chauffage à distance : réseau de chaleur alimentant plusieurs bâtiments. Raccordement obligatoire s’il passe dans la rue.' },
  { term: 'PAC', definition: 'Pompe à chaleur : prélève la chaleur de l’air (PAC air/eau) ou du sol et la restitue au chauffage, avec un rendement (COP) de 3 à 4.' },
  { term: 'COP', definition: 'Coefficient de performance d’une PAC : chaleur produite par kWh d’électricité consommé.' },
  { term: 'PV', definition: 'Photovoltaïque : panneaux solaires produisant de l’électricité, puissance en kWc (kilowatt-crête).' },
  { term: 'CO₂ scope 1 + 2', definition: 'Émissions d’exploitation : combustion sur place (gaz, mazout, scope 1) et électricité ou chaleur achetées (scope 2), en kgCO₂e/m²·an.' },
  { term: 'tCO₂e', definition: 'Tonne d’équivalent CO₂ : émissions de gaz à effet de serre ramenées à l’effet du CO₂.' },
  { term: 'Carbone gris', definition: 'Émissions liées à la fabrication, au transport et à l’élimination des matériaux et équipements des travaux.' },
  { term: 'Indice d’état', definition: 'Proxy de vétusté entre 0 et 1, déduit de l’âge depuis la construction ou les derniers travaux. Ce n’est pas un diagnostic.' },
  { term: 'Valeur U', definition: 'Coefficient de transmission thermique d’un élément (W/m²·K). Plus il est bas, mieux l’élément isole.' },
  { term: 'Degrés-jours', definition: 'Somme des écarts entre une température intérieure de référence et la température extérieure : mesure du besoin de chauffage d’un climat.' },
  { term: 'Enveloppe thermique', definition: 'Parois séparant l’intérieur chauffé de l’extérieur : façade, toiture, sol sur cave, fenêtres.' },
  { term: 'Annuité', definition: 'Coût d’un investissement réparti en montants annuels constants sur sa durée de vie, au taux d’actualisation retenu.' },
  { term: 'Coût social du carbone', definition: 'Valeur monétaire des dommages causés par une tonne de CO₂ émise, ajoutée aux coûts annuels.' },
  { term: 'EGID', definition: 'Identifiant fédéral du bâtiment (registre RegBL), clé commune à toutes les sources.' },
  { term: 'DDP', definition: 'Droit de superficie distinct et permanent : un tiers possède le bâtiment construit sur un terrain de la Ville. Ces bâtiments sont exclus.' },
  { term: 'OCEN', definition: 'Office cantonal de l’énergie de Genève : publie les IDC et applique la loi sur l’énergie.' },
  { term: 'REn', definition: 'Règlement d’application de la loi genevoise sur l’énergie : fixe les seuils IDC au-delà desquels des travaux sont ordonnés.' },
  { term: 'LCl', definition: 'Loi cantonale sur le climat : objectif de zéro net en 2050.' },
  { term: 'SITG', definition: 'Système d’information du territoire à Genève : géodonnées publiques (cadastre, IDC, solaire, autorisations).' },
];

export const DATA_SOURCES: Source[] = [
  { id: 'SITG', author: 'État de Genève', title: 'Cadastre (parcelles, bâtiments hors sol, DDP), IDC publics, cadastre solaire, autorisations de construire', url: 'https://sitg.ge.ch', use: 'Liste de référence des bâtiments de la Ville, IDC mesurés, toitures solaires, protection patrimoniale.' },
  { id: 'QuantHome', author: 'QuantHome', title: 'API QuantHome v2', url: 'https://api.quanthome.com', use: 'Adresse, année de construction, loyers, chauffage et estimations de repli (IDC, SRE).' },
  { id: 'QBuildings', author: 'EPFL', title: 'QBuildings, base de données Genève', use: 'Estimation de l’IDC d’une dizaine de bâtiments sans autre source (optionnel).' },
  { id: 'swisstopo', author: 'Office fédéral de topographie', title: 'Fond de carte « light base map »', url: 'https://www.swisstopo.admin.ch', use: 'Fond de carte.' },
];

export const LITERATURE: Source[] = [
  { id: 'GE_REN', author: 'République et canton de Genève', year: 2022, title: 'Règlement d’application de la loi sur l’énergie (REn, L 2 30.01), art. 14 et 14A', url: 'https://silgeneve.ch/legis/program/books/rsg/htm/rsg_l2_30p01.htm', use: 'Seuils IDC du scénario Base légale.' },
  { id: 'GE_PDE2020', author: 'République et canton de Genève', year: 2020, title: 'Plan directeur de l’énergie 2020-2030, fiches 2.1, 2.2 et 5.3', use: 'Seuils du scénario Exemplaire.' },
  { id: 'OCEN_IDC2025', author: 'OCEN, Genève', year: 2025, title: 'Annexe relative au calcul de l’indice de dépense de chaleur (IDC), rév. 1.0', url: 'https://www.ge.ch/document/11405/annexe/file/634612', use: 'Conversion en énergie finale (CAD, électricité de PAC).' },
  { id: 'DATA_LEGAL2026', author: 'Équipe projet', year: 2026, title: 'Inventaire des réglementations énergie GE/CH et scénarios 1 et 2 (Data_legal/)', use: 'Calendrier des seuils, équivalents CO₂ (OFEV).' },
  { id: 'LICS2022', author: 'TEP Energy, Low-Tech Lab, Studio Durable pour l’OFEN', year: 2022, title: 'LICS – Low Invest Cost Sanierungen, rapport final', url: 'https://pubdb.bfe.admin.ch/fr/publication/download/11206', use: 'Coûts unitaires des mesures, prix de l’énergie.' },
  { id: 'HFM2015', author: 'INFRAS pour OFEN/EnFK', year: 2016, title: 'Harmonisiertes Fördermodell der Kantone (HFM 2015)', url: 'https://pubdb.bfe.admin.ch/de/publication/download/8097', use: 'Valeurs U, durées de vie des équipements.' },
  { id: 'STREICHER2020', author: 'Streicher K.N.', year: 2020, title: 'Cost-effective energy retrofit of the Swiss residential building stock, thèse UNIGE', url: 'https://archive-ouverte.unige.ch/unige:148611', use: 'Durées de vie, isolation du sol.' },
  { id: 'NAEGELI2020', author: 'Nägeli C. et al.', year: 2020, title: 'Policies to decarbonize the Swiss residential building stock, Energy Policy 146', url: 'https://research.chalmers.se/publication/519103', use: 'Fenêtres, facteur d’émission de l’électricité.' },
  { id: 'KBOB2022', author: 'KBOB / ecobau / IPB', year: 2022, title: 'Ökobilanzdaten im Baubereich, version 9.0', url: 'https://www.kbob.admin.ch/de/oekobilanzdaten-im-baubereich', use: 'Carbone gris des matériaux et équipements.' },
  { id: 'SWISSOLAR2024', author: 'Swissolar', year: 2024, title: 'Coût de production du kWh PV', url: 'https://www.fr.ch/document/543191', use: 'Coût et productible du photovoltaïque.' },
  { id: 'GRANDJEAN2021', author: 'Grandjean B. et al.', year: 2021, title: 'Actual energy savings of more than 1000 renovated buildings in Geneva', url: 'https://archive-ouverte.unige.ch/unige:156968', use: 'Économies réellement atteintes après rénovation.' },
  { id: 'COZZA2020', author: 'Cozza S. et al.', year: 2020, title: 'In search of optimal consumption: performance gap and energy savings deficit, Energy & Buildings 224', url: 'https://doi.org/10.1016/j.enbuild.2020.110235', use: 'Écart de performance après rénovation.' },
  { id: 'EQUIPE_FACTEURS2026', author: 'Équipe projet', year: 2026, title: 'Facteurs d’émission : électricité 0,097 et CAD 0,131 kgCO₂e/kWh', use: 'CO₂ scope 2.' },
];
