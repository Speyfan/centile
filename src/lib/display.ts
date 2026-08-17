/**
 * Libellés français et règles d'affichage.
 *
 * Le JSON ne transporte aucun texte d'affichage : tout ce qu'un lecteur voit
 * est décidé ici. Les règles NON NÉGOCIABLES du produit y sont des fonctions
 * plutôt que des conventions, pour qu'on ne puisse pas les contourner par
 * distraction :
 *
 *   - `plusMinus()` — un score ne s'affiche jamais sans son ± ;
 *   - `panTone()` — la couleur double la valeur écrite, elle ne la remplace
 *     jamais (accessibilité : la valeur est toujours lisible en texte) ;
 *   - `unavailableMessage()` — un pan absent est toujours motivé.
 */
import type { Meta, Pan, RatedScore, Unavailable } from "./contract";

// ------------------------------------------------------------------ nombres

const INTEGER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Un formateur par précision. La première version n'en avait que deux et
// traitait `digits` comme un booléen : `num(0.8832, 2)` rendait « 0,9 », et
// une page méthode annonçait une corrélation fausse d'un centième.
const FORMATTERS = new Map<number, Intl.NumberFormat>();
const formatter = (digits: number): Intl.NumberFormat => {
  let existing = FORMATTERS.get(digits);
  if (!existing) {
    existing = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits });
    FORMATTERS.set(digits, existing);
  }
  return existing;
};

export const num = (value: number, digits = 1): string =>
  formatter(digits).format(value);

export const int = (value: number): string => INTEGER.format(value);

/**
 * Coefficient à deux décimales fixes.
 *
 * « 0,9 » et « 0,90 » ne disent pas la même chose sur une corrélation : le
 * second affiche sa précision, le premier la cache.
 */
const RATIO = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const ratio = (value: number): string => RATIO.format(value);

/**
 * Demi-largeur de l'intervalle, arrondie au dixième.
 *
 * L'intervalle du moteur n'est pas exactement symétrique : on affiche la
 * borne la plus large, qui est la lecture prudente, et l'intervalle exact
 * reste disponible en `intervalText()` (info-bulle et lecteur d'écran).
 */
export const plusMinus = (score: RatedScore): number =>
  Math.round(Math.max(score.world - score.ci_low, score.ci_high - score.world) * 10) / 10;

export const intervalText = (score: RatedScore): string =>
  `${num(score.ci_low)} – ${num(score.ci_high)}`;

// -------------------------------------------------------------------- rôles

export const ROLE_LABELS: Record<string, string> = {
  top: "Toplaner",
  jng: "Jungler",
  mid: "Midlaner",
  bot: "ADC",
  sup: "Support",
};

export const ROLE_PLURAL: Record<string, string> = {
  top: "toplaners",
  jng: "junglers",
  mid: "midlaners",
  bot: "ADC",
  sup: "supports",
};

// --------------------------------------------------------------------- pans

export const PAN_LABELS: Record<string, string> = {
  laning: "Lane",
  damage: "Dégâts",
  vision: "Vision",
  discipline: "Discipline",
  frontline: "Première ligne",
  resources: "Ressources",
  map_control: "Contrôle carte",
  early: "Début de partie",
  objectives: "Objectifs",
};

export const PAN_HINTS: Record<string, string> = {
  laning: "Écart avec l'adversaire direct à 15 minutes.",
  damage: "Dégâts infligés, rapportés à ce que fait le champion joué.",
  vision: "Vision posée, vision refusée, wards de contrôle.",
  discipline: "Morts, et part des morts de l'équipe.",
  frontline: "Dégâts encaissés et mitigés, rapportés au champion joué.",
  resources: "CS et part de l'or gagné par l'équipe.",
  map_control: "Occupation de la jungle et ressources prises.",
  early: "Kills et assists à 10 et 15 minutes. Descriptif : non noté.",
  objectives: "Objectifs pris par l'équipe. Descriptif : non noté.",
};

export const STAT_LABELS: Record<string, string> = {
  csdiffat15: "Diff. CS @15",
  xpdiffat15: "Diff. XP @15",
  golddiffat15: "Diff. or @15",
  dpm: "Dégâts / min",
  damageshare: "Part des dégâts",
  vspm: "Score de vision / min",
  wcpm: "Wards détruites / min",
  controlwards: "Wards de contrôle",
  death_share: "Part des morts",
  deaths: "Morts",
  damagemitigated: "Dégâts mitigés / min",
  damagetaken: "Dégâts subis / min",
  cspm: "CS / min",
  earnedgoldshare: "Part de l'or gagné",
  monsterkills_pm: "Monstres / min",
  ka15: "Kills + assists @15",
  ka10: "Kills + assists @10",
  team_objectives: "Objectifs de l'équipe",
};

// ------------------------------------------------------------------ couleurs

export type Tone = "high" | "mid" | "low" | "none";

/** Seuils produit : 70 et 40. La couleur double la valeur, jamais l'inverse. */
export const panTone = (percentile: number | null): Tone => {
  if (percentile === null) return "none";
  if (percentile >= 70) return "high";
  if (percentile >= 40) return "mid";
  return "low";
};

export const TONE_FILL: Record<Tone, string> = {
  high: "var(--tone-high)",
  mid: "var(--tone-mid)",
  low: "var(--tone-low)",
  none: "var(--tone-none)",
};

// -------------------------------------------------------------------- statut

export const STATUS_LABELS: Record<string, string> = {
  published: "Publié",
  experimental: "Expérimental",
  no_anchor: "Échelle locale",
  unrated: "Non noté",
};

/**
 * Ce qu'un statut autorise à dire. Un score `experimental` porte un badge
 * explicite : l'échelle inter-ligues n'est pas établie pour cette ligue, la
 * note n'est pas opposable à celle d'une autre ligue.
 */
export const STATUS_NOTES: Record<string, string> = {
  published: "Échelle mondiale : comparable aux autres ligues publiées.",
  experimental:
    "Échelle locale — données inter-ligues insuffisantes. Ce score situe le joueur dans sa ligue, pas face aux autres ligues.",
  no_anchor:
    "Échelle locale — aucun ancrage disponible pour cette ligue et cette saison. Le score ne se compare qu'au sein de la ligue.",
  unrated: "Sous les seuils de notation.",
};

// ------------------------------------------------------------------- absences

/** Un pan absent dit toujours pourquoi, et si c'est la ligue ou le joueur. */
export const unavailableMessage = (
  gap: Unavailable,
  league: string,
  meta: Meta,
): string => {
  const missing = (gap.missing_stats ?? []).map((s) => STAT_LABELS[s] ?? s);
  const allAt15 = (gap.missing_stats ?? []).length > 0 &&
    (gap.missing_stats ?? []).every((s) => s.endsWith("at15"));

  switch (gap.code) {
    case "thin_basis":
      if (allAt15) return `Stats @15 non collectées en ${league}`;
      return missing.length
        ? `Non collecté en ${league} : ${missing.join(", ")}`
        : `Base de stats insuffisante en ${league}`;
    case "player_below_min_games":
      return `Moins de ${gap.min_games ?? meta.thresholds.min_games_pan} parties exploitables pour ce joueur`;
    case "small_pool":
      return `Moins de ${meta.thresholds.min_pool_size} joueurs comparables dans ce pool`;
    case "few_games":
      return "Trop peu de joueurs avec assez de parties exploitables";
    default:
      return "Pan non calculé";
  }
};

/**
 * L'intervalle d'un pan est-il exploitable ?
 *
 * Sur une poignée de pans (0,015 % du corpus), le bootstrap exclut le point
 * estimé : le point partage les rangs ex æquo, le bootstrap ne les partage
 * pas, et sur un pan à valeurs entières dans un pool de neuf joueurs les deux
 * divergent. Afficher « 20 (35–40) » serait illisible et faux ; on affiche la
 * valeur et on dit que l'intervalle n'est pas exploitable, plutôt que de
 * l'élargir en douce jusqu'à ce qu'il ait l'air correct.
 */
export const hasUsableInterval = (pan: Pan): boolean =>
  pan.percentile !== null &&
  pan.ci_low <= pan.percentile &&
  pan.percentile <= pan.ci_high;

/** « la ligue » ou « ce joueur » — la nuance change ce que le lecteur conclut. */
export const gapScope = (gap: Unavailable): string =>
  gap.scope === "pool" ? "toute la ligue" : "ce joueur";

// -------------------------------------------------------------------- divers

/**
 * La saison est-elle encore en cours ?
 *
 * Un classement de saison en cours se lit autrement : les volumes sont
 * courts, les intervalles larges, et le haut de tableau peut être tenu par un
 * joueur qui a joué vingt parties. Le dire vaut mieux que laisser croire à un
 * classement définitif — mais la déduction est une heuristique, pas une
 * donnée : le corpus ne sait pas si une saison est finie, il sait seulement
 * quand remonte sa dernière partie.
 */
export const isSeasonInProgress = (year: number, meta: Meta): boolean =>
  meta.corpus.last_game_date !== null &&
  Number(meta.corpus.last_game_date.slice(0, 4)) === year;

export const splitLabel = (window: { split: string; is_season: boolean }): string =>
  window.is_season ? "Saison complète" : window.split;

export const isScored = (pan: Pan, role: string, meta: Meta): boolean =>
  (meta.pans.scored_by_role[role] ?? {})[pan.pan] !== undefined;

export const nominalWeight = (pan: string, role: string, meta: Meta): number =>
  (meta.pans.scored_by_role[role] ?? {})[pan] ?? 0;

export const championClass = (
  champion: string,
  role: string,
  year: number,
  meta: Meta,
): string => {
  const override = meta.champion_classes.overrides.find(
    (o) => o.role === role && o.champion === champion && year >= o.from && year <= o.to,
  );
  if (override) return override.class;
  return meta.champion_classes.by_role[role]?.[champion] ?? "other";
};
