/**
 * Contrat de données v1 — miroir exact de `scripts/export_site_data.py`
 * du repo moteur (projet-stats-lol).
 *
 * Ces schémas ne sont pas décoratifs : `npm run check:data` les applique à
 * TOUS les fichiers de `data/site/` avant chaque build. Une évolution du
 * moteur casse donc le build, pas une fiche en production.
 *
 * Trois règles du contrat sont encodées ici et doivent le rester :
 *   - un pan sans `percentile` porte OBLIGATOIREMENT un bloc `unavailable` ;
 *   - un score porte toujours ses deux bornes d'intervalle ;
 *   - `v` doit valoir CONTRACT_VERSION, sinon le build échoue.
 */
import { z } from "zod";

export const CONTRACT_VERSION = 1;

const version = z.literal(CONTRACT_VERSION);

export const SCORE_STATUS = ["published", "experimental", "no_anchor", "unrated"] as const;
export type ScoreStatus = (typeof SCORE_STATUS)[number];

export const UNAVAILABLE_CODES = [
  "thin_basis",
  "small_pool",
  "few_games",
  "player_below_min_games",
  "not_computed",
] as const;
export type UnavailableCode = (typeof UNAVAILABLE_CODES)[number];

export const ROLES = ["top", "jng", "mid", "bot", "sup"] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------- meta.json

export const metaSchema = z.object({
  v: version,
  generated_at: z.string(),
  model_version: z.string(),
  score_scale: z.object({
    slope: z.number(),
    intercept: z.number(),
    calibrated_on: z.string(),
    ceiling: z.number(),
    /** Logits de winrate par probit de percentile, mesuré par `anchors.py`. */
    kappa: z.number(),
    /**
     * Points de score par logit d'ancrage : slope / kappa.
     *
     * DOCUMENTAIRE. La conversion elle-même est faite à l'export
     * (`anchor_points`) : le site n'applique aucune affine, jamais.
     */
    points_per_logit: z.number(),
  }),
  corpus: z.object({
    first_year: z.number().int(),
    last_year: z.number().int(),
    last_game_date: z.string().nullable(),
    n_games: z.number().int(),
    n_players: z.number().int(),
    n_rated_players: z.number().int(),
    n_leagues: z.number().int(),
  }),
  counts: z.record(z.string(), z.number().int()),
  thresholds: z.object({
    min_games_pan: z.number().int(),
    min_pool_size: z.number().int(),
    min_games_edge: z.number().int(),
  }),
  roles: z.array(z.enum(ROLES)),
  pans: z.object({
    scored_by_role: z.record(z.string(), z.record(z.string(), z.number())),
    descriptive: z.array(z.string()),
    stats: z.record(z.string(), z.array(z.string())),
    conditioned_stats: z.array(z.string()),
    team_grain_stats: z.array(z.string()),
    signs: z.record(z.string(), z.number()),
  }),
  champion_classes: z.object({
    by_role: z.record(z.string(), z.record(z.string(), z.string())),
    overrides: z.array(
      z.object({
        role: z.string(),
        champion: z.string(),
        from: z.number().int(),
        to: z.number().int(),
        class: z.string(),
      }),
    ),
  }),
  /** Ce que le modèle sait de lui-même, publié sur /methode. */
  validation: z.object({
    anchor_agreement: z.object({
      r: z.number().nullable(),
      n_cells: z.number().int(),
      r_published: z.number().nullable(),
      n_published: z.number().int(),
    }),
    transfers: z.object({
      n_moves: z.number().int(),
      n_edges: z.number().int(),
    }),
  }),
  codes: z.object({
    score_status: z.array(z.string()),
    anchor_status: z.array(z.string()),
    unavailable: z.array(z.string()),
  }),
});
export type Meta = z.infer<typeof metaSchema>;

// -------------------------------------------------------------- fiche joueur

/** Le trou est un objet : il dit toujours pourquoi, et pour qui. */
export const unavailableSchema = z.object({
  code: z.enum(UNAVAILABLE_CODES),
  /** `pool` : toute la ligue est concernée. `player` : ce joueur seul. */
  scope: z.enum(["pool", "player"]),
  n_stats: z.number().int().optional(),
  n_stats_expected: z.number().int(),
  missing_stats: z.array(z.string()).optional(),
  n_players: z.number().int().optional(),
  min_games: z.number().int().optional(),
});
export type Unavailable = z.infer<typeof unavailableSchema>;

/**
 * Un pan calculé, ou un pan absent motivé — jamais autre chose.
 *
 * `n_games` vaut pour le pan ET pour chacune de ses stats : un pan ne compte
 * que les parties portant toute sa base, ses stats ont donc exactement le
 * même `n`. C'est ce qui permet d'écrire un `n` sous chaque barre sans
 * approximation.
 */
export const panSchema = z.union([
  z.object({
    pan: z.string(),
    weight_used: z.number(),
    percentile: z.number(),
    ci_low: z.number(),
    ci_high: z.number(),
    n_games: z.number().int(),
    pool_size: z.number().int(),
    stats: z.record(z.string(), z.number()),
  }),
  z.object({
    pan: z.string(),
    weight_used: z.number(),
    percentile: z.null(),
    unavailable: unavailableSchema,
  }),
]);
export type Pan = z.infer<typeof panSchema>;

/**
 * Un score projeté sur l'échelle mondiale, OU l'aveu qu'il n'y en a pas.
 *
 * L'union est la traduction d'une règle : jamais un score sans son ±. Une
 * ligue sans ancrage (`no_anchor`) n'a pas de projection monde ; elle sort
 * donc avec `world: null` et sans bornes, au lieu d'un nombre que rien ne
 * soutiendrait. Le typage force la fiche à traiter le cas.
 */
export const ratedScoreSchema = z.object({
  world: z.number(),
  ci_low: z.number(),
  ci_high: z.number(),
  status: z.enum(SCORE_STATUS),
  clipped: z.boolean(),
  local_percentile: z.number(),
  world_z: z.number(),
  world_sd: z.number().nullable(),
  weight_covered: z.number(),
  pans_used: z.array(z.string()),
  anchor: z
    .object({
      value: z.number().nullable(),
      ci_low: z.number().nullable(),
      ci_high: z.number().nullable(),
      publication: z.string().nullable(),
    })
    .nullable(),
});
export type RatedScore = z.infer<typeof ratedScoreSchema>;

export const localScoreSchema = z.object({
  world: z.null(),
  status: z.enum(SCORE_STATUS),
  local_percentile: z.number(),
  weight_covered: z.number(),
  pans_used: z.array(z.string()),
  anchor: z.null(),
});

export const scoreSchema = z.union([ratedScoreSchema, localScoreSchema]);
export type Score = z.infer<typeof scoreSchema>;

export const isRated = (score: Score | null): score is RatedScore =>
  score !== null && score.world !== null;

export const windowSchema = z.object({
  key: z.string(),
  year: z.number().int(),
  split: z.string(),
  is_season: z.boolean(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  league: z.string(),
  role: z.enum(ROLES),
  team: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  n_games: z.number().int(),
  n_detailed: z.number().int(),
  stat_basis: z.string().nullable(),
  score: scoreSchema.nullable(),
  pool: z
    .object({ size: z.number().int().nullable(), role: z.string(), league: z.string() })
    .optional(),
  pans: z.array(panSchema),
  champions: z.record(z.string(), z.number().int()),
});
export type Window = z.infer<typeof windowSchema>;

export const playerSchema = z.object({
  v: version,
  id: z.string(),
  slug: z.string(),
  source_id: z.string(),
  handle: z.string(),
  aka: z.array(z.string()),
  career: z.object({
    first_year: z.number().int(),
    last_year: z.number().int(),
    n_games: z.number().int(),
    roles: z.array(z.string()),
  }),
  default_window: z.string().nullable(),
  windows: z.array(windowSchema),
});
export type Player = z.infer<typeof playerSchema>;

export const playerIndexEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  handle: z.string(),
  aka: z.array(z.string()),
  years: z.array(z.number().int()),
  role: z.string().nullable(),
  league: z.string().nullable(),
  team: z.string().nullable(),
  year: z.number().int().nullable(),
  split: z.string().optional(),
  score: z.number().optional(),
  ci_low: z.number().optional(),
  ci_high: z.number().optional(),
  status: z.enum(SCORE_STATUS),
  n_games: z.number().int(),
});
export type PlayerIndexEntry = z.infer<typeof playerIndexEntrySchema>;

export const playerIndexSchema = z.object({
  v: version,
  players: z.array(playerIndexEntrySchema),
});

// -------------------------------------------------------------------- ligues

export const anchorSchema = z
  .object({
    value: z.number().nullable(),
    ci_low: z.number().nullable(),
    ci_high: z.number().nullable(),
    status: z.string().nullable(),
    publication: z.string().nullable(),
    scale_source: z.string().nullable(),
    conf_reason: z.string().nullable(),
    transf_reason: z.string().nullable(),
    n_eff_conf: z.number().nullable(),
    n_eff_transf: z.number().nullable(),
    parts: z.object({
      conf: z.number().nullable(),
      transf: z.number().nullable(),
      selection_bias: z.number().nullable(),
    }),
  })
  .nullable();

export const rosterEntrySchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  handle: z.string().nullable(),
  role: z.string(),
  team: z.string().nullable(),
  score: z.number().nullable(),
  ci_low: z.number().nullable(),
  ci_high: z.number().nullable(),
  status: z.enum(SCORE_STATUS),
  n_games: z.number().int(),
  weight_covered: z.number().nullable(),
});

export const leagueSchema = z.object({
  v: version,
  league: z.string(),
  label: z.string(),
  region: z.string().nullable(),
  lineage: z
    .object({
      id: z.string(),
      chain: z.array(z.string()),
      since_year: z.number().int().nullable(),
    })
    .nullable(),
  seasons: z.array(
    z.object({
      year: z.number().int(),
      tier: z.string().nullable(),
      anchor: anchorSchema,
      /** L'ancrage en points de score, converti par l'export. */
      anchor_points: z
        .object({
          value: z.number(),
          ci_low: z.number(),
          ci_high: z.number(),
        })
        .nullable(),
      scores: z.object({
        n_players: z.number().int(),
        n_published: z.number().int(),
        median: z.number().nullable(),
        p10: z.number().nullable(),
        p90: z.number().nullable(),
        min: z.number().nullable(),
        max: z.number().nullable(),
        histogram: z
          .object({
            from: z.number(),
            bin_width: z.number(),
            counts: z.array(z.number().int()),
          })
          .nullable(),
      }),
      roster: z.array(rosterEntrySchema),
    }),
  ),
});
export type League = z.infer<typeof leagueSchema>;

export const leagueIndexSchema = z.object({
  v: version,
  leagues: z.array(
    z.object({
      league: z.string(),
      label: z.string(),
      region: z.string().nullable(),
      tier: z.string().nullable(),
      tiers: z.record(z.string(), z.string().nullable()),
      years: z.array(z.number().int()),
      n_players: z.number().int(),
      n_published: z.number().int(),
    }),
  ),
});
export type LeagueIndex = z.infer<typeof leagueIndexSchema>;

// --------------------------------------------------------------- classements

export const rankingSchema = z.object({
  v: version,
  year: z.number().int(),
  split: z.string(),
  rows: z.array(
    z.object({
      id: z.string(),
      slug: z.string().nullable(),
      handle: z.string().nullable(),
      role: z.string(),
      league: z.string(),
      team: z.string().nullable(),
      score: z.number().nullable(),
      ci_low: z.number().nullable(),
      ci_high: z.number().nullable(),
      status: z.enum(SCORE_STATUS),
      n_games: z.number().int(),
      weight_covered: z.number().nullable(),
    }),
  ),
});
export type Ranking = z.infer<typeof rankingSchema>;
