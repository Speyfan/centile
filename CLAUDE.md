# LoL Scout — le site

Site statique de stats et scouting esport League of Legends. Il **affiche** le
travail du moteur analytique, il ne calcule rien. Le moteur vit dans un autre
repo (`projet-stats-lol`) et sort des JSON versionnés que ce repo consomme.

## Règles d'affichage — NON NÉGOCIABLES

Ces quatre règles sont le produit, pas une préférence esthétique. Le site vend
l'honnêteté d'une mesure ; une seule entorse la ruine.

1. **Jamais un score sans son ±.** Le composant `ScoreHeadline` n'accepte pas
   un nombre, seulement un `RatedScore` qui porte ses deux bornes. Une ligue
   sans ancrage n'a pas de score sur 100 : elle affiche son rang local et dit
   pourquoi il n'y a pas de note.
2. **Jamais une stat sans son `n`.** Un pan ne compte que les parties portant
   toute sa base : son `n_games` vaut donc aussi pour chacune de ses stats,
   et il est écrit sous chaque barre.
3. **Le statut est toujours visible.** `published` / `experimental` /
   `no_anchor` portent un badge, et tout ce qui n'est pas publié porte en plus
   sa phrase d'avertissement — pas seulement une couleur.
4. **Un pan manquant est montré, avec son motif.** Tranche grisée hachurée
   dans le pizza chart, ligne « indispo. » + motif en clair dans les barres.
   Le motif est lisible **sans interaction** : une fiche est souvent lue en
   image, où rien ne se déplie.

Corollaires :

- la couleur double toujours une valeur écrite, jamais l'inverse (seuils 70 et
  40, matérialisés aussi par deux cercles de repère dans le pizza chart) ;
- le site n'arrondit jamais : les arrondis sont figés à l'export, sinon deux
  pages affichent deux valeurs de la même chose ;
- le site ne recalcule aucune quantité mesurée — pas de moyenne de
  percentiles, pas de renormalisation de poids, pas d'affine d'échelle.

## Contrat de données — `data/site/`, v1

Produit par `scripts/export_site_data.py` dans le repo moteur. Miroir
TypeScript + Zod dans `src/lib/contract.ts`, appliqué à **tous** les fichiers
par `npm run check:data` avant chaque build.

```
data/site/
  meta.json              # calibration, seuils, pans et poids, classes de champions
  players/index.json     # 8 894 entrées : recherche, classements, états vides
  players/{id}.json      # une fiche = un fichier ; id = playerid sans `oe:player:`
  leagues/index.json
  leagues/{league}.json  # ancrage par saison, distribution, effectif
  rankings/{year}.json   # fenêtre `season` uniquement
```

Invariants du contrat :

- `v` obligatoire dans chaque fichier ; un `v` inconnu fait échouer le build.
- **Un trou est un objet, jamais une clé absente** : un pan sans valeur sort
  avec `percentile: null` ET un bloc `unavailable` (`code`, `scope`,
  `missing_stats`…). `scope` distingue « toute la ligue » de « ce joueur »,
  et la nuance change ce que le lecteur conclut.
- Un score porte ses bornes, ou n'est pas un score (union
  `ratedScoreSchema | localScoreSchema`).
- Aucun texte d'affichage dans le JSON : codes stables en anglais, libellés
  français dans `src/lib/display.ts`. Exceptions : noms propres (pseudo,
  équipe, ligue).
- Clé d'une fenêtre : **(year, split, league, role)**. Un joueur peut changer
  de rôle ou de ligue dans la même année.
- **`split` est du texte libre et non ordonnable** (27 libellés : « Rounds
  3-5 », « Cup », « Champ 1 »…). Tout tri chronologique passe par `from`/`to`,
  jamais par le libellé.
- **Toute conversion d'unité est faite à l'export.** Un ancrage vit en logits
  de winrate ; `leagues/*.json` porte donc `anchor_points` (valeur et bornes,
  déjà en points de score) à côté de `anchor` (les logits bruts, pour
  vérification). `meta.score_scale.points_per_logit` est **documentaire** : il
  dit d'où vient la conversion, il ne sert jamais à la faire. Le site
  n'applique aucune affine — sinon le jour où κ change, deux pages affichent
  deux valeurs de la même chose. `check-data.ts` vérifie que les deux formes
  existent ensemble ou pas du tout.

### Intervalles : tolérance zéro, et pourquoi

`check-data.ts` échoue si **un seul** intervalle n'encadre pas son point
estimé. Ce n'est pas de la sévérité gratuite : un IC mesure la variabilité du
MÊME estimateur que sa valeur, et un intervalle qui exclut son point est un
contresens, pas une imprécision.

Le corpus en comptait 37 au premier export, pour deux causes distinctes,
toutes deux corrigées côté moteur :

- le bootstrap ne partageait pas les rangs ex æquo alors que le point les
  partageait — deux estimateurs différents sous un seul nom. `ordinal_percentile`
  est désormais l'équivalent matriciel exact de `perf_v0.percentile` ;
- le quantile à 2,5 % était estimé sur cent tirages, donc sur deux ou trois
  observations. `BOOTSTRAP_DRAWS` est passé à 1000 : les intervalles publiés
  étaient **trop étroits de près de deux points** (largeur médiane d'un pan
  45,4 → 47,2), et le nombre d'anomalies dépendait de la graine.

Les points estimés n'ont pas bougé d'une décimale : ni le percentile d'un pan,
ni `pan_percentile`, ni `score_local`, ni `score_world`. Seuls les intervalles
changent, et seulement pour s'élargir.

`hasUsableInterval` reste en défense en profondeur côté rendu : une page ne
doit jamais afficher « 20 (35–40) », même le jour où ce contrôle serait
contourné.

### Les formateurs sont testés, avec des chaînes exactes

`npm test` (Node test runner, `src/lib/*.test.ts`, dans le gate de `npm run
build`) couvre une classe de défauts qu'aucun autre contrôle ne voit : les
données sont justes, les types sont bons, **et le rendu ment**. Précédent :
`num(valeur, décimales)` traitait son second argument comme un booléen, si
bien que `num(0.8832, 2)` rendait « 0,9 » et que la page méthode annonçait
une corrélation fausse d'un centième. `check-data.ts` et `astro check`
passaient tous les deux.

D'où la forme des assertions : des chaînes littérales, pas des nombres.
`num(0.8832, 2) === "0,88"`, `ratio(0.9) === "0,90"`, `int(6172) === "6 172"`
(espace fine insécable, pas une espace ordinaire). Tout nouveau formateur —
ou toute fonction qui décide de ce qu'un lecteur lit — se teste ici.

## Chaîne export → build

```bash
# repo moteur
uv run python -m pipeline.metrics
uv run python scripts/export_site_data.py --out ../lol-scout-site/data/site

# ici
npm run check:data      # valide les JSON contre le contrat
npm run build           # check:data puis astro build
SITE_SAMPLE=ruler,bin npx astro build   # itération de maquette (2 fiches)
```

`data/site/` est **commité** : ~83 Mo en clair, ~12 Mo compressés, ce qui rend
le déploiement reproductible sans accès à DuckDB. C'est le point de découplage
entre les deux repos.

## Pages

- `/` — recherche (index allégé chargé à la première frappe seulement) et top
  10 par rôle de la dernière saison, publiés uniquement.
- `/classements` et `/classements/{year}` — une page par saison, filtres
  rôle × ligue côté client. `published` par défaut ; le toggle
  « expérimental » lève un bandeau, parce qu'un score expérimental n'est pas
  opposable à un score publié.
- `/ligue/{league}` — ancrage exprimé **en points de score** (le logit ne se
  lit pas ; la conversion vient de l'export, cf. `anchor_points`), son
  évolution, la distribution des scores, l'effectif. Un
  `scale_source: "local"` affiche « échelle locale, non comparable » : ces
  ligues s'ordonnent entre elles et avec rien d'autre.
- `/joueur/{slug}` — la fiche. Fenêtre courante dans le fragment d'URL.
- `/methode` — la prose est écrite. **Tout ce qui y est chiffré vient de
  `meta.json`**, jusqu'à la concordance des deux signaux d'ancrage
  (`validation.anchor_agreement`, r = 0,88 sur 75 couples). Une page méthode
  qui annoncerait une corrélation figée le jour où on l'a écrite ferait
  exactement le contraire de ce qu'elle promet — aucun chiffre n'y est saisi
  à la main.
- `/404` — renvoie vers la recherche : le cas fréquent est un slug périmé
  après un changement de pseudo.
- Un joueur sous les seuils a une page qui explique pourquoi, pas un 404.

## Stack

- Astro en statique (`output: "static"`), zéro runtime JS sur la fiche hormis
  un commutateur de fenêtre de 40 lignes. Sans lui, la fenêtre par défaut —
  le dernier split joué — reste affichée : c'est la dégradation voulue.
- Tailwind v4 via `@tailwindcss/vite`, tokens dans `src/styles/global.css`.
- Zod pour le contrat. Pas de state management, pas de backend.
- La fenêtre affichée vit dans le fragment d'URL
  (`/joueur/ruler-eada4723#2025:season:LCK:bot`) : une fiche partagée pointe
  sur la fenêtre qu'on voulait montrer.

## Conventions

- Code et noms en anglais, commentaires et interface en français.
- Mobile-first strict : tout doit tenir à 360 px, y compris le pizza chart.
  Le contenu large (mini-graphe) scrolle dans son propre conteneur, jamais la
  page.
- URL d'une fiche : `/joueur/{pseudo-slug}-{8 premiers caractères de l'id}`.
  Le pseudo pour le partage, l'id pour l'unicité entre homonymes.
- Le pizza chart est le moment signature : SVG pur, sans dépendance, pour
  rester réutilisable côté serveur pour un futur export image. Angle d'une
  tranche = poids du pan dans la note du rôle ; rayon = percentile local.
- Nouveau composant qui affiche une mesure = il doit rendre les quatre règles
  ci-dessus impossibles à violer par distraction (le typage y aide : voir
  `isRated`).
