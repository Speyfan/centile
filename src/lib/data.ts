/**
 * Accès aux JSON de `data/site/`, au build uniquement.
 *
 * Rien de ceci n'atteint le navigateur : Astro appelle ces fonctions pendant
 * la génération et n'émet que du HTML. C'est aussi le seul endroit du site
 * qui lit le disque — si un jour les données viennent d'ailleurs, c'est ce
 * fichier qui change, et lui seul.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  leagueIndexSchema,
  leagueSchema,
  metaSchema,
  playerIndexSchema,
  playerSchema,
  rankingSchema,
  type League,
  type LeagueIndex,
  type Meta,
  type Player,
  type PlayerIndexEntry,
  type Ranking,
} from "./contract";

export const DATA_DIR = join(process.cwd(), "data", "site");

const read = (...segments: string[]): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, ...segments), "utf-8"));

let metaCache: Meta | null = null;
export const getMeta = (): Meta => (metaCache ??= metaSchema.parse(read("meta.json")));

let indexCache: PlayerIndexEntry[] | null = null;
export const getPlayerIndex = (): PlayerIndexEntry[] =>
  (indexCache ??= playerIndexSchema.parse(read("players", "index.json")).players);

export const getPlayer = (id: string): Player =>
  playerSchema.parse(read("players", `${id}.json`));

export const getLeague = (league: string): League =>
  leagueSchema.parse(read("leagues", `${league}.json`));

let leagueIndexCache: LeagueIndex["leagues"] | null = null;
export const getLeagueIndex = (): LeagueIndex["leagues"] =>
  (leagueIndexCache ??= leagueIndexSchema.parse(read("leagues", "index.json")).leagues);

export const getRanking = (year: number): Ranking =>
  rankingSchema.parse(read("rankings", `${year}.json`));

export const listRankingYears = (): number[] =>
  readdirSync(join(DATA_DIR, "rankings"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => Number(f.replace(".json", "")))
    .sort((a, b) => a - b);

/**
 * Échantillon de développement.
 *
 * Générer 8 894 fiches à chaque itération de maquette coûte des minutes pour
 * rien. `SITE_SAMPLE=ruler,bin` limite le build aux joueurs nommés — jamais
 * en production, où l'absence de la variable rend le corpus entier.
 */
export const sampleFilter = (): ((entry: PlayerIndexEntry) => boolean) => {
  const raw = process.env.SITE_SAMPLE;
  if (!raw) return () => true;
  const wanted = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (entry) =>
    wanted.some((w) => entry.slug.startsWith(`${w}-`) || entry.id.startsWith(w));
};
