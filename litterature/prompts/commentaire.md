Tu relis la comparaison entre les paramètres d'un modèle de rénovation énergétique du parc immobilier de la Ville de Genève et les valeurs trouvées dans la littérature.

Le tableau ci-dessous (sorties/comparaison.csv) donne, pour chaque paramètre et chaque déclinaison (élément, agent…) : la valeur du modèle, le nombre de valeurs et de sources primaires de la littérature, leur minimum, médiane et maximum après normalisation, le percentile du modèle dans cette distribution, et une alerte. La colonne `puissances_kw` donne l'étendue des puissances des valeurs d'un groupe : un groupe qui couvre des tailles très différentes mélange des coûts unitaires différents. L'alerte `voir_courbes` signifie que la littérature donne aussi des séries (valeur selon la puissance, l'épaisseur…), absentes de ce tableau : ne conclus pas sur la forme d'une dépendance (linéaire ou non) à partir d'un minimum, d'une médiane et d'un maximum, et signale ces paramètres comme à comparer avec sorties/courbes.csv.

Pour chaque ligne en alerte, puis pour les paramètres de priorité haute :
1. dis si l'écart est probablement réel ou s'il vient d'une différence de contexte (pays, année des prix, base de surface, type de bâtiment, valeur simulée ou mesurée) visible dans les colonnes de contexte ;
2. dis si le nombre de sources suffit pour conclure ;
3. propose une action : garder la valeur, l'ajuster (vers quelle valeur et pourquoi), ou chercher d'autres sources (lesquelles).

Ne recalcule pas les statistiques et n'invente pas de valeur absente du tableau. Termine par la liste des paramètres sans aucune valeur de littérature.

<comparaison>
{comparaison}
</comparaison>
