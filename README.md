# LoL Scout — site

Site statique de stats et scouting esport League of Legends : fiche joueur avec
percentiles par pan de jeu et score mondial sur 100, pages ligue, classements.

Les données viennent du moteur analytique (`projet-stats-lol`) sous forme de
JSON versionnés dans `data/site/`. Le site ne touche jamais la base DuckDB.

## Démarrer

```bash
npm install
npm run check:data     # valide data/site/ contre le contrat v1
npm run dev
```

Itérer sur la maquette d'une fiche sans générer les 8 894 pages :

```bash
SITE_SAMPLE=ruler,bin npx astro build
```

## Mettre à jour les données

Depuis le repo moteur :

```bash
uv run python -m pipeline.metrics
uv run python scripts/export_site_data.py --out ../lol-scout-site/data/site
```

Puis `npm run build` ici : le build échoue si les JSON ne respectent plus le
contrat.

Les règles d'affichage et le contrat de données sont décrits dans `CLAUDE.md`.
