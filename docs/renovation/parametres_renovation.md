# Paramètres de rénovation énergétique – données sourcées

Ce document décrit les valeurs à utiliser pour modéliser la rénovation énergétique des bâtiments du jeu de données `ville_geneve_core.geojson`. Il accompagne deux fichiers :

| Fichier | Contenu |
|---|---|
| `parametres_renovation.csv` | 1498 lignes, une valeur publiée par ligne, avec source et emplacement exact dans la source |
| `sources.csv` | Les 18 sources (auteurs, année, titre, lien) référencées par `source_id` |

Règles suivies :
- aucune valeur n'est inventée, interpolée, ajustée, indexée ni convertie (TVA, année de prix, unité) ;
- quand plusieurs sources donnent des valeurs différentes, elles figurent toutes, avec leur périmètre, pour servir de plages de validité ;
- quand aucune source ne couvre un cas, la valeur la plus proche est utilisée et marquée `proxy`.

Les références entre crochets renvoient à `source_id`, suivi de la table, figure ou section de la source.

---

## 1. Conventions

### 1.1 Colonnes du CSV

| Colonne | Signification |
|---|---|
| `famille` | enveloppe, ventilation, production_chaleur, distribution_exploitation, ecs, photovoltaique, transversal, ecart_performance, paquets_cas_etude |
| `mesure` | Mesure ou objet (ex. `facade`, `PAC_air_eau`, `facteur_emission_gaz_naturel`) |
| `parametre` | Grandeur (ex. `cout_investissement`, `U_avant`, `COP_annuel_chauffage`) |
| `valeur`, `valeur_min`, `valeur_max` | Valeur publiée et/ou bornes publiées. Une plage seule (sans `valeur`) est une plage publiée telle quelle |
| `unite`, `base` | Unité, et grandeur de référence (voir 1.2) |
| `cas` | Situation de comparaison : renovation_energetique, remise_en_etat, changement_systeme, remplacement_meme_systeme, neuf, cout_complet, part_energetique_seule… |
| `perimetre_batiment`, `perimetre_periode`, `perimetre_autre` | Domaine de validité donné par la source (type, époque, puissance, U, etc.) |
| `annee_prix`, `tva` | Année des prix et inclusion de la TVA, telles qu'indiquées (ou « non précisée ») |
| `source_id`, `localisation` | Source et emplacement exact |
| `statut` | Voir ci-dessous |

Valeurs de `statut` :
- `valeur_source` : valeur publiée.
- `hypothese_source` : hypothèse de modèle fixée par la source (ex. coûts HFM fixés par le groupe de travail).
- `mesure_terrain` : valeur mesurée sur des bâtiments réels.
- `lecture_graphique` : valeur mesurée par moi au pixel sur une figure raster (LICS Fig. 47, voir 3.3) ; la précision est indiquée dans `remarque`.
- `proxy` : valeur d'une mesure voisine, faute de donnée directe.

### 1.2 Grandeurs de référence (« m² de quoi ? »)

Les coûts d'enveloppe des sources sont exprimés par **m² d'élément**. C'est la surface de l'élément de construction lui-même, pas la surface de plancher :

| Élément | `base` | Surface à fournir dans les données |
|---|---|---|
| Façade / mur | `m2_element` | Surface de mur extérieur opaque traitée, fenêtres déduites. HFM parle de « wärmegedämmte Bauteilfläche » [HFM2015, M-01], LICS de « CHF/m² Bauteilfläche » [LICS2022, Tab. 28] |
| Toit incliné ou plat | `m2_element` | Surface de toiture isolée (en pente pour un toit incliné) |
| Dalle des combles | `m2_element` | Surface du plancher du comble non chauffé |
| Plafond de cave / sol / mur contre terre | `m2_element` | Surface séparant le volume chauffé du terrain ou d'un local non chauffé |
| Fenêtres | `m2_fenetre` | Surface de fenêtre. Streicher et LICS ne précisent pas s'il s'agit de la baie ou du vitrage |
| Fenêtres (carbone gris) | `m2_ouverture_mur`, `m2_vitrage` | KBOB rapporte les cadres à l'ouverture dans le mur et le vitrage à la surface de verre [KBOB2022, notes du groupe 05] |
| Systèmes, ventilation, distribution | `m2_SRE` | Surface de référence énergétique (SIA 380/1), soit le champ `sre` du jeu de données |
| Production de chaleur | `kW_th`, `installation` | Puissance thermique ; LICS donne les PAC air/eau à A-8/W55 [LICS2022, §4.1.1], EBP à A-7/W35 [EBP2015] |

Je recommande de stocker dans les données, pour les fenêtres, la surface de baie et la part vitrée. Elles permettent d'utiliser à la fois les coûts (par m² de fenêtre) et le carbone gris KBOB (cadre par m² de baie, vitrage par m² de verre).

### 1.3 Années de prix et TVA par source

| Source | Année des prix | TVA |
|---|---|---|
| HFM2015 (enveloppe) | ~2010 (base TEP 2010) | non précisée |
| LICS2022 (enveloppe, Tab. 18) | 2020 (EAK 2011 indexé par l'OFS) | non précisée |
| LICS2022 (chauffage, Fig. 47, Tab. 17) | 2017-2020, surtout région zurichoise | incluse, avec honoraires et autorisations [§4.1] |
| STREICHER2020 | 2015 (IWU DE × 1.07 EUR/CHF × 1.6) | non précisée |
| JAKOB2006 | non explicitée (enquête Jakob et al. 2002) | non précisée |
| JAKOB2006WB (non résidentiel) | ~2006 | non précisée |
| EBP2015 | 2015 | exclue |
| SE_HEIZGRUPPE2024 (Genève) | 2024 | exclue (« net HT ±25 % ») |
| SWISSOLAR2024 (PV) | 2023-2024 | exclue (coût spécifique hors taxe) |
| GALIMSHINA2024 | non précisée | non précisée |

LICS signale que ses prix de chauffage sont plutôt hauts pour la Suisse entière (centrés sur Zurich), mais plutôt bas pour fin 2022, la hausse des prix de la construction n'étant pas incluse [LICS2022, §4.1.2].

---

## 2. Lien avec le jeu de données

Le fichier contient 770 bâtiments de la Ville de Genève :
- 391 sont résidentiels ou mixtes, 379 non résidentiels (126 écoles, 75 commerces, 73 administrations, 64 culture, 38 sport, 3 santé) ;
- 69 sont protégés (30 classés, 39 à l'inventaire) ;
- le chauffage est surtout au gaz.

| Champ | Utilisation dans le modèle | Paramètres concernés |
|---|---|---|
| `sre` | Base des coûts par m² de SRE ; dimensionnement des systèmes | Ventilation, distribution, puissance spécifique |
| `idc` (MJ/m²·a, chauffage + ECS, énergie finale) | État initial ; dimensionnement à partir de la consommation ; calage des économies réelles | LICS Tab. 9 ; GRANDJEAN2021 (même indicateur) ; seuils genevois 450 et 800 MJ/m²·a |
| `heating`, `hot_water` | Système et agent existants | Rendements, facteurs d'émission, cas `changement_systeme` ou `remplacement_meme_systeme` |
| `construction_period` | U d'origine si U absent ; taux de rénovation | STREICHER2020 Fig. A.1 ; GRANDJEAN2021 Tab. 3 |
| `usage`, `destination` | Choix résidentiel / non résidentiel (section 7) | LICS bâtiments 7 (bureau) et 11 (école) ; JAKOB2006WB |
| `protection` | Isolation intérieure (proxy) ; subvention spécifique | GE_BAREME2024 (80 CHF/m², U<0.25) |
| `cad_connected`, `cad_in_street` | Disponibilité du raccordement CAD | Coûts CAD (Fig. 47), facteurs d'émission CAD |
| `solar_profile` | Production PV | SWISSOLAR2024 (productible 1050 kWh/kWc dans l'exemple fribourgeois) |
| `co2_scope1` | Émissions directes seulement (gaz 0.198 kg/kWh selon le champ) | Pour comparer, prendre les facteurs « loi CO2 » (LICS Tab. 3) ; KBOB inclut l'amont |
| Surfaces d'éléments, U, étages, hauteur (à venir) | Coûts par m² d'élément ; économie par ΔU | Section 3.1 |

---

## 3. Mesures découplées

Chaque mesure est chiffrée seule, sur son levier physique : énergie utile pour l'enveloppe, rendement et facteur d'émission pour la production. Les interactions entre mesures sont traitées en section 6.

### 3.1 Enveloppe

**Effet énergétique d'un élément.** Formule du HFM [HFM2015, A2.1.2], sans le terme d'effet d'aubaine :

`Δq_utile [kWh/(m² élément·a)] = (f0·U0 − f1·U1) · Cght`, avec `Cght = HDD·24/1000`

- Le HFM prend 3250 degrés-jours, soit Cght = 78 kWh·K/W.
- Khoury normalise les cas genevois à 2659 degrés-jours (base 18/12) [KHOURY2016].
- f = facteur de réduction contre terre : 0.42 avant, 0.69 après pour les murs et sols contre terre ; 1 ailleurs [HFM2015, Tab. 5].
- L'économie en énergie finale s'obtient en divisant par le rendement du système (section 3.3).

**U de référence.**

| Élément | U avant | U après | Source |
|---|---|---|---|
| Façade | 1.0 | 0.20 | HFM2015 Tab. 5 |
| Toit | 0.6 | 0.20 | HFM2015 Tab. 5 |
| Mur/sol contre terre | 1.0 | 0.25 | HFM2015 Tab. 5 |
| Par période et type (MFH, SFH) | médianes CECB d'origine, 9 périodes × 4 éléments | – | STREICHER2020 Paper I Fig. A.1 (72 lignes du CSV) |
| 6 bâtiments collectifs 1911-1988 | ex. mur 0.43-1.60, fenêtres 1.60-2.95 | – | GALIMSHINA2024 SI Tab. S1 |
| Bureau 1919-45 (LICS bât. 7) | façade 1.10 ; fenêtres 2.20 ; toit 1.00 ; cave 1.50 | 0.24 ; 1.05 ; 0.61 ; 0.28 | LICS2022 Tab. 28 |
| École 1971-80 (LICS bât. 11) | façade 1.10 ; fenêtres 2.30 ; toit 0.60 ; cave 1.10 | 0.40 ; 1.00 ; 0.25 ; 0.20 | LICS2022 Tab. 28 |

Cibles de U :
- éléments opaques : 0.25 (SIA 380/1 et MuKEn), 0.20 (Programme Bâtiments), ≤0.17 (Minergie) [GALIMSHINA2024 SI §3 ; NAEGELI2020 Tab. 3] ;
- fenêtres : 1.0 [NAEGELI2020 Tab. 3].

**Coûts par m² d'élément.** Pour chaque ligne, la colonne « Remise en état » donne le coût qui serait payé de toute façon ; « Énergétique » donne le coût de la rénovation avec isolation.

| Élément | Énergétique | Remise en état | Périmètre / année | Source |
|---|---|---|---|---|
| Façade crépie (ITE) | 200 | 40-80 | tous, 2020 | LICS2022 Tab. 18 |
| Façade ventilée | 240 | n.d. | tous, 2020 | LICS2022 Tab. 18 |
| Façade | 240 | 100 | tous, ~2010 | HFM2015 Tab. 7 |
| Façade, mur extérieur | 163 + 4.72/cm (coût complet) ; 33.2 + 4.72/cm (part énergétique) | – | résidentiel, 2015, λ=0.035 | STREICHER2020 Paper III Tab. 3 |
| Façade compacte | 117 (12 cm) ; 127 (16) ; 140 (20) ; 174 (30) | 35 | EFH/MFH, ~2002 | JAKOB2006 Tab. 2 |
| Façade, cas d'étude | 196-331 (résidentiel) ; 243 (bureau) ; 235 (école) | 38-80 (46 pour le bureau et l'école) | Zurich, 2020 | LICS2022 Tab. 28 |
| Toit incliné, isolation ultérieure | 180-200 | – | 2020 | LICS2022 Tab. 18 |
| Toit incliné, réfection complète | 350-450 | – | 2020 | LICS2022 Tab. 18 |
| Toit plat | 250 | 50-100 | 2020 | LICS2022 Tab. 18 |
| Toit | 260 | 150 | ~2010 | HFM2015 Tab. 7 |
| Toit, extérieur | 254 + 4.65/cm (complet) ; 19 + 3.98/cm (part énergétique) | – | 2015 | STREICHER2020 Tab. 3 |
| Dalle des combles | 80-100 | sans objet | 2020 | LICS2022 Tab. 18 |
| Plafond de cave | 100-140 ; cas d'étude 104 (résidentiel), 136 (bureau), 112 (école) | sans objet | 2020 | LICS2022 Tab. 18 et 28 |
| Sol, isolation intérieure | 91.1 + 2.60/cm | – | 2015 | STREICHER2020 Tab. 3 |
| Mur/sol contre terre | 240 | 100 | ~2010 | HFM2015 Tab. 7 (valeur façade reprise faute de données) |
| Fenêtres | 830-1200 ; cas d'étude 827 (bureau), 1187 (école) | 20-40 | 2020 | LICS2022 Tab. 18 et 28 |
| Fenêtres triple vitrage | MFH 630 / SFH 680 (complet) ; 84 / 89 (part énergétique) | – | 2015 | STREICHER2020 Tab. 3 |
| Fenêtres passives | MFH 847 / SFH 926 ; 301 / 334 | – | 2015 | STREICHER2020 Tab. 3 |
| **Isolation intérieure des murs** | **proxy** : 91.1 + 2.60/cm (isolation intérieure du sol) | – | – | STREICHER2020 Tab. 3, statut `proxy` |

Pour la conversion épaisseur ↔ U chez Streicher : `t = λ/U_isolant`, avec `1/U_isolant = 1/U_requis − 1/U_actuel` et λ = 0.035 W/(m·K) [STREICHER2020, Paper III SM Eq. (7)].

Incertitude des coûts d'enveloppe [LICS2022, §4.2, citant Jakob et al. 2010] :
- le standard énergétique (légal vs Minergie) pèse environ 10 % du coût, ou ≤20 CHF/m² ;
- les coûts annexes propres à chaque cas (typiquement 50-100 CHF/m², jusqu'à +50 à 200 CHF/m²) pèsent davantage.

**Carbone gris.** KBOB donne les isolants par kg [KBOB2022, groupe 10] ; le modèle multiplie par épaisseur × masse volumique.

| Isolant | kg CO2eq/kg | Masse vol. KBOB (kg/m³) | C biogénique (kg C/kg) |
|---|---|---|---|
| EPS | 7.6 | 15-40 | – |
| XPS | 14.4 | 30-35 | – |
| Laine de roche | 0.816 | 32-160 | – |
| Laine de verre | 1.1 | 20-100 | – |
| Cellulose | 0.28 | 35-60 | 0.404 |
| Fibre de bois (panneau mou) | 0.725 | 147.5 | 0.436 |
| Botte de paille | 0.0956 | 215 | 0.368 |

- KBOB ne comptabilise aucune émission négative pour le carbone biogénique ; la règle doit être fixée au niveau du bâtiment.
- Galimshina utilise d'autres masses volumiques, par exemple paille 105 kg/m³ (λ 0.066) et EPS 40 kg/m³ (λ 0.03) [GALIMSHINA2024 SI Tab. S3/S4].
- Fenêtres, en kg CO2eq/m² : cadres bois 36.2, bois-métal 65.7, PVC 63.4, alu 132 (par m² d'ouverture) ; vitrages double Ug 1.1 : 44.3, triple Ug 0.5 : 78.3 (par m² de verre) [KBOB2022].

**Durées de vie.**
- Enveloppe 40 ans [HFM2015].
- Mur 50, toit 40, sol 50, fenêtres 30 ans [STREICHER2020 Tab. A.2].
- Lognormales (moyenne, écart-type) : mur (40.6 ; 11.6), toit (30.4 ; 9.6), dalle (33.7 ; 14.2), fenêtres (27.5 ; 12.2) [GALIMSHINA2024 SI Tab. S2].

**Subventions.**
- M-01 : HFM minimum 40 CHF/m² d'élément (U≤0.20) [HFM2015].
- Genève 2024 :
  - 140 CHF/m² (U<0.2), 80 CHF/m² pour les bâtiments protégés (U<0.25), +40 CHF/m² de toiture pour des capteurs sur un bâtiment protégé [GE_BAREME2024, diapo 22] ;
  - HPE/THPE pour les bâtiments non habitat : 150/190 CHF/m² SRE [diapo 24].

**Bureaux et écoles.** Ces valeurs viennent d'enquêtes sur des bâtiments non résidentiels, surtout des bureaux, transposables aux écoles selon les auteurs [JAKOB2006WB, Tab. Z.2] :

| Mesure | Effet | Coût |
|---|---|---|
| Isolation thermique | combustible −100 à −150 MJ/m² SRE·a | coût annuel net −0.5 à +1 CHF/m²·a ; 0.05-0.13 CHF/kWh |
| Fenêtres, vitrages, protection solaire | combustible +20 à −400 MJ/m²·a ; électricité −20 à +15 MJ/m²·a | 0.03-0.2 CHF/kWh |

L'isolation est rentable ou presque jusqu'à U = 0.2, soit 20 cm (surcoût <1-2 CHF/m²·a).

### 3.2 Ventilation

| Paramètre | Valeur | Source |
|---|---|---|
| VMC double flux, maison neuve | 14 000-20 000 CHF ; 80-100 CHF/m² SRE | LICS2022 §5.4 |
| VMC double flux, immeuble | 8 000-18 000 CHF/logement ; 120-160 CHF/m² SRE ; +30-50 % hors rénovation globale | LICS2022 §5.4 |
| Fonction de coût | 383·(SRE/nb logements)^−0.36 × 1.3 (avec récupération), CHF/m² SRE, 2015 | STREICHER2020 Eq. (16) |
| Débit d'air | 0.7 m³/(m²·h) (mécanique) ; 0.35 équivalent avec récupération | STREICHER2020 Tab. 4 |
| Valeurs HFM | 20 MWh/logement sur la durée de vie ; surinvestissement 9 600 CHF/logement | HFM2015 Tab. 4 |
| Extraction régulée CO2/humidité | 30-60 CHF/m² SRE | LICS2022 §5.4.2 |
| Fenêtre motorisée | 2 000-2 500 CHF/fenêtre ; 20 CHF/m² SRE pour une fenêtre par logement | LICS2022 §5.4.1 |
| Non résidentiel | récupération jusqu'à −150 MJ/m²·a ; coût annuel ventilation ~10 CHF/m²·a ; électricité ventilation 160-290 avant → 15-30 MJ/m²·a après | JAKOB2006WB |
| Carbone gris | 15.0 (1 m³/h·m²) à 51.4 (8 m³/h·m²) kg CO2eq/m² SRE ; logement 8.25-14.1 | KBOB2022 groupe 32 |
| Subventions | HFM 2 400 CHF/logement ; Genève 2024 : 4 800 CHF/unité d'habitation | HFM2015 M-09 ; GE_BAREME2024 diapo 26 |

### 3.3 Production de chaleur

**Coûts par installation et classe de puissance [LICS2022, Annexe 11.1, Fig. 47].** Cette figure est la seule source qui couvre 10 systèmes de 5 à 200 kW, pour trois cas : même système, neuf, changement de système.
- C'est une image raster. J'ai mesuré la hauteur des barres et des barres d'erreur pixel par pixel à 613 ppi.
- La précision va d'environ 0.2 kCHF (5 kW) à environ 2 kCHF (200 kW).
- Les coûts incluent honoraires, autorisations et TVA ; les prix datent de 2017 à 2020.

Valeurs en kCHF pour un **changement de système**, au format moyen (favorable – coûteux) :

| Système | 5 kW | 10 kW | 20 kW | 70 kW | 100 kW | 200 kW |
|---|---|---|---|---|---|---|
| Chaudière mazout | 38 (27–51) | 42 (29–56) | 53 (35–73) | 88 (63–137) | 122 (89–222) | 242 (156–340) |
| Chaudière gaz | 34 (26–50) | 36 (27–52) | 41 (31–60) | 71 (52–116) | 92 (67–183) | 206 (136–298) |
| Raccordement CAD | 25 (18–49) | 31 (23–68) | 44 (33–107) | 132 (97–267) | 183 (134–417) | 416 (284–788) |
| Pellets | 48 (35–65) | 57 (41–79) | 70 (48–100) | 126 (92–190) | 160 (118–280) | 316 (208–446) |
| Plaquettes | – | – | 81 (57–113) | 148 (110–217) | 193 (144–320) | 356 (242–493) |
| PAC air/eau | 48 (34–67) | 53 (38–75) | 73 (51–104) | 186 (119–256) | 284 (186–437) | 641 (438–844) |
| PAC sol/eau | 54 (39–74) | 72 (52–99) | 107 (78–151) | 308 (212–432) | 434 (297–666) | 852 (587–1169) |
| PAC eau/eau (nappe) | 73 (55–119) | 82 (60–133) | 101 (75–168) | 197 (128–308) | 273 (176–478) | 515 (348–800) |
| PAC air/eau + gaz (bivalente) | 33 (25–44) | 66 (51–87) | 78 (60–104) | 156 (114–203) | 200 (141–267) | 402 (270–509) |
| PAC sol/eau + gaz (bivalente) | 37 (28–49) | 73 (57–97) | 98 (75–129) | 214 (159–284) | 283 (206–389) | 549 (378–717) |

Les cas « remplacement par le même système » et « neuf » sont dans le CSV (`cas`). Ces valeurs sont des points ; aucun ajustement « coût fixe + coût par kW » n'a été fait.

Autres sources de coût :

| Paramètre | Valeur | Périmètre | Source |
|---|---|---|---|
| PAC air/eau 10 kW, changement de système | 24 260 (favorable) ; 49 328 (moyen) ; 63 831 (coûteux) CHF, honoraires et TVA inclus | 2017-2020 | LICS2022 Tab. 17 |
| PAC air/eau, coût spécifique | 3 000 CHF/kW (monovalente) ; 2 200 CHF/kW (bivalente) | exemple MFH 120 kWh/m² | LICS2022 Tab. 20 |
| PAC air/eau, maison | médiane 36 000 CHF HT (26 000-49 000) ; factures 31 000 ; appareil seul ~15 000 | maison 1950, 9 kW, 2015 | EBP2015 |
| Chaudière mazout, maison | ~22 000 CHF HT | 2015 | EBP2015 |
| PAC air/eau, grands immeubles genevois | 0.95-1.30 MCHF HT pour 185-440 kW, dont renforcement électrique 120-210 kCHF et caissons acoustiques 80-120 kCHF | 2024, ±25 % | SE_HEIZGRUPPE2024 |
| PAC, coût par m² SRE | gaz 30.1-45.2 ; pellets 37.7-56.5 ; PAC 40.7-61 CHF/m² | 6 bâtiments collectifs | GALIMSHINA2024 SI Tab. S2 |
| Sondes géothermiques | 100 CHF/m ; 35 W/m ; 20-22 m/kW | – | LICS2022 §4.1.1 |
| Surinvestissement vs référence (HFM) | PAC air 340 ; PAC sol 670 ; CAD 210 ; bois auto 510-630 CHF/kWth | ~2015 | HFM2015 Tab. 4 |

**Dimensionnement (de l'IDC à la puissance).**
- Puissance spécifique à partir de la consommation, à −8 °C / 20 °C [LICS2022 Tab. 9, prSIA 384/1, base GEAK résidentielle, Zurich] :

  | Consommation (kWh/m²) | Courbe 90 % (W/m²) | Courbe médiane (W/m²) |
  |---|---|---|
  | 30 | 24 | 20 |
  | 60 | 34 | 27 |
  | 90 | 44 | 34 |
  | 120 | 54 | 40 |
  | 150 | 64 | 47 |

- La charge normative surestime de 20 à 35 % [LICS2022 §2.3.3].
- Le HFM prend 2000 heures de pleine charge [HFM2015 Tab. 10].
- À Genève, la méthode des 2700 heures surdimensionne de 16 à 52 % par rapport à la mesure. La puissance mesurée était de 23-38 W/m² contre 41-45 W/m² estimés sur la consommation [SE_HEIZGRUPPE2024].

**Performance.**
- COP annuel à 55 °C de départ : PAC air/eau 2.8 (chauffage) et 2.7 (ECS) ; PAC sol/eau 3.3 et 2.8 [LICS2022 Tab. 7].
- Hypothèses HFM : PAC air 3.0, PAC sol 3.5 [HFM2015 Tab. 11].
- Mesures de terrain : 2.6 (air) et 3.75 (sondes) [SE_PAC_FICHE] ; taux d'utilisation de chaleur 3.3 pour les PAC air/eau en 2019/20 [FELDMESSUNG2020].
- Rendements des chaudières au PCI : gaz 0.92, mazout 0.85, pellets 0.80, CAD 0.95 (chauffage) [LICS2022 Tab. 8].
- Chaudières anciennes : mazout 0.80, gaz 0.85 [HFM2015 Tab. 11].

**Facteurs d'émission (kg CO2eq/kWh).** Trois conventions coexistent ; il faut en choisir une dans le modèle (section 7).

| Agent | KBOB 2022, énergie finale | KBOB 2022, chaleur utile | Loi CO2 (direct), PCI | HFM (direct) |
|---|---|---|---|---|
| Mazout | 0.324 | 0.343 (chaudière) | 0.265 | 0.265 |
| Gaz naturel | 0.230 | 0.234 (chaudière) | 0.203 | 0.202 |
| Pellets | 0.0277 | 0.0377 | 0 | 0 (bois) |
| CAD moyenne CH | 0.0658 | – | 0 | 0.170 |
| Électricité mix consommateur CH | 0.125 | – | 0 | 0.024 |
| PAC air/eau ancien, COP annuel 2.7, mix CH | – | 0.058 | – | – |
| PAC sonde ancien, COP annuel 3.2, mix CH | – | 0.0505 | – | – |

Sources : KBOB2022, onglet Energie ; LICS2022 Tab. 3 ; HFM2015 Tab. 6. Nägeli donne une trajectoire de l'électricité de 0.097 (2017) à 0.017 (2050) [NAEGELI2020 Tab. 3, lu par OCR].

**Carbone gris des équipements [KBOB2022, groupe 31] :**
- PAC air/eau 7 kW : 4 000 kg/appareil ; PAC sol/eau 7 kW : 2 400 kg ; sondes : 23.2 kg/m ;
- générateur : 0.858-4.29 kg/m² SRE ;
- radiateurs : 6.51 kg/m² SRE.

Galimshina donne : PAC 4 600-5 520 kg, chaudière gaz 2 246-3 370 kg [GALIMSHINA2024 SI].

**Durées de vie.**
- PAC et bois ≤70 kW 15 ans ; CAD et bois >70 kW 20 ans [HFM2015 Tab. 10].
- Système de chauffage 25 ans [STREICHER2020].
- Lognormales : PAC (17.1 ; 6.4), gaz (18.8 ; 3.3) [GALIMSHINA2024].

**Subventions.**
- HFM : PAC air 1 600 + 60 CHF/kWth ; PAC sol 2 400 + 180 ; CAD 4 000 + 20. Le calcul est plafonné à 50 W/m² SRE.
- Genève 2024 :
  - PAC air 3 000 + 400 CHF/kW ; PAC sol ou eau 3 000 + 800 ;
  - CAD 8 000 + 200 CHF/kW (≤500 kW) ;
  - création d'un réseau hydraulique 3 000 + 400 CHF/kW [GE_BAREME2024 diapos 25, 27].

### 3.4 Distribution, température de départ, exploitation

- **Baisse de la température de départ** [LICS2022 Tab. 21] :
  - PAC sol/eau : COP annuel 2.7 à 65 °C → 3.4 (55 °C) → 4.1 (45 °C) → 4.8 (35 °C) ;
  - PAC air/eau : 2.2 → 2.7 → 3.1 → 3.6 ;
  - coût des émetteurs, toutes pièces confondues : 50 CHF/m² SRE (55 °C), 128 (45 °C), 230 (35 °C) ;
  - −10 K donne +20 à 25 % de COP annuel, environ neutre en coût annuel.
- **Optimisation d'exploitation** (équilibrage, courbe de chauffe) :
  - éco21 Genève : 16 % en moyenne (10-40 %) [SE_HEIZGRUPPE2024 §2] ;
  - non résidentiel : « entre quelques dizaines et environ 100 MJ/m²·a » [JAKOB2006WB].
- **Seuils IDC genevois** : obligation d'agir à 450 MJ/m²·a ; dépassement significatif à 800 MJ/m²·a. Au changement de chaudière, renouvelable en priorité, minimum 30 % en cas de dérogation [GE_BAREME2024].

### 3.5 Eau chaude sanitaire

- **Besoin** :
  - 1 000 kWh/personne·a [LICS2022 §5.5] ; 1 080 kWh/occupant·a pour les logements genevois [KHOURY2016] ;
  - mesuré 12-15 kWh/m²·a ; SIA 380/1 : MFH 21, EFH 14 kWh/m²·a ;
  - pertes de stockage et circulation : 25-50 % [LICS2022].
- **Récupération sur les douches** : −15 à −45 % du besoin d'ECS, soit 3-8 kWh/m²·a, pour un surcoût de 23-30 CHF/m² SRE si les sanitaires sont refaits [LICS2022].
- **Boiler PAC** : 5 000-7 000 CHF.
- **Station d'eau fraîche** : −10 à −15 K de température.
- **Solaire thermique** :
  - HFM : 14 MWh/kWth sur la durée de vie, surinvestissement 2 600 CHF/kWth ;
  - subvention Genève 2024 : 4 800 + 2 000 CHF/kW ;
  - carbone gris des capteurs plans : 168-289 kg/m² [KBOB2022].

### 3.6 Photovoltaïque

- Prix médian 2 400 CHF/kWc pour 10-30 kWc (prix 2023) [SWISSOLAR2024].
- Exemples : 10 kWc = 28 092 CHF brut (rétribution unique 3 800) ; 150 kWc = 235 992 CHF (45 890).
- Entretien : 3 ct/kWh en moyenne (1.4-5 selon la taille).
- Productible 1 050 kWh/kWc ; durée de vie 25 ans ; intégration au bâti +20-50 %.
- Carbone gris : 1 000 (toit incliné) à 1 220 (façade) kg CO2eq/kWc [KBOB2022].

### 3.7 Paquets complets (études de cas, pour validation)

La famille `paquets_cas_etude` du CSV contient des résultats de paquets complets. Ils ne servent pas de paramètres par mesure, mais à valider les combinaisons calculées par le modèle.

**LICS2022, 11 bâtiments** (dont un bureau et une école) × 7 stratégies, de Ref1 à S5 [Tab. 22, 27, 29, 30]. Pour chaque cas : investissement (CHF/m² SRE), coût annuel, énergie finale, émissions loi CO2 et émissions KBOB, avec le système de chauffage de chaque stratégie.
- Bureau, bâtiment 7 : investissement 65 (Ref1) à 462 (S2) CHF/m² ; énergie finale 137 → 17-58 kWh/m²·a.
- École, bâtiment 11 : investissement 40 à 317 CHF/m² ; énergie finale 89 → 21-55 kWh/m²·a.

**GALIMSHINA2024, 6 bâtiments collectifs** × 3 systèmes × 2 familles d'isolants [SI Tab. S12/S13]. Pour chaque paquet optimal robuste : besoin de chaleur après rénovation, coût de cycle de vie et impact de cycle de vie.

---

## 4. Économies réelles et écart de performance

Les économies théoriques surestiment les économies réelles ; ces sources permettent de caler le modèle sur la consommation mesurée.

| Indicateur | Valeur | Périmètre | Source |
|---|---|---|---|
| Écart réel/théorique avant rénovation | G −37.3 % ; F −23.4 % ; E −9.21 % ; D −5.83 % ; toutes −22.9 % | résidentiel CECB | COZZA2020 Tab. 2 |
| Écart après rénovation | toutes +2.11 % | résidentiel CECB | COZZA2020 Tab. 2 |
| Surestimation des économies | 37 % (sur base théorique) ; 3.6 % (sur consommation mesurée avant) | résidentiel | COZZA2020 |
| Économie réelle médiane par saut de classe | +1 : 28.6 ; +2 : 53.0 ; +3 : 85.6 ; +4 : 112 ; +5 : 142 ; +6 : 159 kWh/m²·a | résidentiel | COZZA2020 Tab. E1 |
| Relation réel/théorique | ΔQh_réel = 0.0009·ΔQh_théo² + 0.17·ΔQh_théo (MJ/m²·a, R² = 0.99) ; part réalisée 44 % (29-65) | collectif Genève, 10 cas | KHOURY2016 |
| Réduction réelle d'IDC selon l'IDC avant | >700 : 160 ; 600-700 : 114 ; 500-600 : 88.1 ; 400-500 : 22.1 ; <400 : 5.39 MJ/m²·a | collectif Genève | GRANDJEAN2021 Fig. 1 |
| Permis suivis d'une hausse de l'IDC | 22 % | collectif Genève | GRANDJEAN2021 |
| Taux de rénovation énergétique | 1.7 %/an (1961-70 : 2.4 %) ; gain ≥1 classe : 0.6 %/an | collectif Genève | GRANDJEAN2021 Tab. 3 |
| Écart médian | −11 % ; classe G −40 % ; classe B +12 % | résidentiel | GAPXPLORE2019 |

---

## 5. Paramètres économiques

- **Actualisation** :
  - taux réel 3 % [LICS2022 ; HFM2015] ; 2.5-4.5 % [GALIMSHINA2024] ;
  - annuités à 3 % : 8.4 % (15 ans) à 3.9 % (50 ans) [LICS2022 Tab. 10] ;
  - taux implicite des décisions de propriétaires : environ 15 % [NAEGELI2020].
- **Prix de l'énergie** :
  - mazout 12.0, gaz 9.0, électricité 23.7, pellets 9.0, CAD 8.8 ct/kWh, avec une taxe CO2 de 96 CHF/t [LICS2022 Tab. 11]. LICS précise que les prix sont plus élevés depuis 2022 ;
  - moyennes HFM sur la durée de vie : 0.10 / 0.10 / 0.20 / 0.10 CHF/kWh [HFM2015 Tab. 8].

---

## 6. Synergies et interactions

| # | Interaction | Mécanisme | Valeurs | Sources |
|---|---|---|---|---|
| S1 | Enveloppe ou optimisation → puissance du générateur | La puissance suit le besoin | 120 kWh/m² → 54 W/m² ; 60 kWh/m² → 34 W/m² (courbe 90 %). Optimisation : puissance −12 à −30 %, coût PAC −9.5 à −16 %. Le coût ne baisse pas en proportion : à Mon-Idée, −35 % de puissance donne −9 % de coût (même nombre de PAC, mêmes caissons, même renforcement électrique) | LICS2022 Tab. 9 ; SE_HEIZGRUPPE2024 |
| S2 | Enveloppe ou émetteurs → température de départ → COP | Un besoin plus faible permet un départ plus bas | −10 K donne +20-26 % de COP annuel. Après remplacement des fenêtres, isolation des combles et du plafond de cave, et suppression de l'abaissement nocturne, 55 °C est possible avec des radiateurs ; COP annuel >3.0 atteignable avec les PAC air/eau actuelles | LICS2022 Tab. 21, §5.3 |
| S3 | Dilution (antagonisme) | Après une PAC, chaque kWh utile économisé vaut kWh/COP en énergie finale, en CHF et en CO2 | Isolation optimale plus mince avec PAC qu'avec gaz. Bâtiment 1 (1911) : toit 11 cm (gaz) contre 8 cm (PAC) | GALIMSHINA2024 SI Tab. S12 ; HFM2015 (effet calculé avec le rendement du système après rénovation) |
| S4 | Cycle d'entretien | La part « de toute façon » réduit le surcoût énergétique | Façade : 200 contre 40-80 CHF/m² [LICS] ; 240 contre 100 [HFM] ; coût fixe 163 (complet) contre 33.2 (part énergétique) [Streicher] | LICS2022, HFM2015, STREICHER2020 |
| S5 | Fenêtres → ventilation | Une enveloppe plus étanche crée un besoin de renouvellement d'air contrôlé | Alternatives : extraction régulée 30-60 CHF/m², fenêtre motorisée 20 CHF/m² | LICS2022 §5.4 |
| S6 | Isolation → surchauffe (non résidentiel) | Les gains internes ne s'évacuent plus | +50 à +200 h de surchauffe (isolation) ; −120 à +800 h (fenêtres) ; verres g 0.35-0.42 recommandés | JAKOB2006WB Tab. Z.2 |
| S7 | Éclairage → chauffage (non résidentiel) | Moins de chaleur dégagée par l'éclairage | Au plus ~0.5 kWh de combustible en plus par kWh électrique économisé ; éclairage −20 à −110 MJel, +10 à +60 MJ combustible | JAKOB2006WB |
| S8 | ECS → PAC | La part de l'ECS augmente après rénovation ; la séparer abaisse le départ toute l'année | Part de l'ECS : 46 % (MuKEn 2008), 58 % (Minergie 2009). Boiler PAC 5-7 kCHF ; station d'eau fraîche −10 à −15 K | LICS2022 §5.4.2, §5.5 |
| S9 | Cave fermée → plafond de cave et départ | La cave plus chaude réduit les pertes du rez-de-chaussée | Cave à 16-18 °C fenêtres fermées ; supprimer l'isolation du retour au plafond de cave gagne ~1 °C au rez | LICS2022 §5.3.2, §5.4.1 |
| S10 | PAC bivalente → PV | Une PAC plus petite libère de la toiture | Qualitatif ; bivalente : −50 % de raccordement électrique, −10 dB(A) | LICS2022 §5.1 |
| S11 | Profondeur → part réalisée des économies | Plus l'économie visée est grande, plus la part réalisée est élevée | 35 % réalisés pour 200 MJ/m²·a visés ; ~50 % pour 350 ; ~65 % pour 550 | KHOURY2016 ; COZZA2020 Fig. 6 |
| S12 | Subventions : cumul | Aides globales et aides par mesure non cumulables dans un même projet | M-10 non cumulable avec M-01 à M-09. À Genève, un programme de mesures ponctuelles peut atteindre le niveau de subvention d'un standard | HFM2015 M-10 ; GE_BAREME2024 diapo 28 |
| S13 | Carbone gris ↔ système | Avec un système bas carbone, le carbone gris des isolants domine | Bâtiment 1 avec PAC : 10.90 kg CO2eq/m²·a (isolants conventionnels) contre 2.72 (biosourcés) | GALIMSHINA2024 SI Tab. S12/S13 |

---

## 7. Lacunes, proxys et choix laissés au modèle

**Non résidentiel (49 % du jeu de données).** Les données directes sont :
- LICS2022 bâtiment 7 (bureau 1919-45) et bâtiment 11 (école 1971-80) : coûts par élément, U, investissement par m² SRE (Tab. 29 : école 40 en Ref1, 138 en Ref2, 198-317 selon la stratégie) ;
- JAKOB2006WB : effets et coûts annuels par m² SRE ;
- KBOB : distribution de chaleur en bureau (9.15 kg/m² SRE) ;
- subventions HFM M-10 et Genève « non habitat ».

Les coûts de production de chaleur de LICS Fig. 47 dépendent de la puissance, pas du type de bâtiment ; ils s'appliquent tels quels. Le dimensionnement LICS Tab. 9 vient de données résidentielles : c'est l'option la plus proche pour les écoles et bureaux, à marquer comme proxy dans le modèle.

**Autres lacunes :**
- isolation intérieure des murs (proxy : isolation intérieure du sol) ;
- coûts d'enveloppe après 2020 (aucune source indexée ; prix bruts reportés) ;
- isolants biosourcés : pas de coût par m² dans Galimshina (SI Tab. S2 : ±20 % sur les coûts des composants, sans valeur de base) ;
- facteur d'émission des réseaux genevois spécifiques (KBOB ne donne que la moyenne CH et des types de centrale).

**Choix de modélisation à faire :**
1. Convention CO2 : directe (loi CO2, cohérente avec `co2_scope1`) ou avec amont (KBOB).
2. Coûts « complets » ou « part énergétique seule » : dépend de l'état d'entretien de l'élément.
3. Économie théorique (ΔU) ou calée sur le réel (Khoury, Cozza, Grandjean).

---

## 8. Sources

Voir `sources.csv`. Liste courte :
- HFM2015 ; LICS2022 ; EBP2015 ; STREICHER2020 ; GALIMSHINA2024 (+ SI) ; KBOB2022 ;
- COZZA2020 ; GAPXPLORE2019 ; KHOURY2016 ; GRANDJEAN2021 ;
- JAKOB2006 ; JAKOB2006WB ; NAEGELI2020 ;
- SE_HEIZGRUPPE2024 ; SWISSOLAR2024 ; SE_PAC_FICHE ; GE_BAREME2024 ; FELDMESSUNG2020.

Limites de lecture :
- JAKOB2006WB : seuls les résumés (p. 7-29) ont été lus ; les coûts détaillés par élément sont au chapitre 4 du rapport.
- NAEGELI2020 : PDF scanné, lu par OCR ; les valeurs signalées « lu par OCR » sont à vérifier sur le PDF.
- FELDMESSUNG2020 : seul le résumé a été lu.
