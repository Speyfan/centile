/**
 * Porte d'entrée du build : valide TOUS les JSON de `data/site/` contre le
 * contrat avant qu'Astro n'en génère quoi que ce soit.
 *
 * Le but n'est pas de se rassurer, c'est de rendre une évolution du moteur
 * bruyante. Sans ce garde-fou, un champ renommé côté Python produirait des
 * pages où un score manque en silence — le pire cas pour un produit dont
 * l'argument est l'honnêteté de l'affichage.
 *
 * Trois contrôles ne sont pas dans les schémas Zod parce qu'ils portent sur
 * la cohérence entre fichiers, pas sur la forme d'un fichier :
 *   - un pan sans percentile porte un motif ;
 *   - un score porte toujours ses deux bornes, dans le bon ordre ;
 *   - tout code d'énumération croisé est déclaré dans meta.json.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  leagueIndexSchema,
  leagueSchema,
  metaSchema,
  playerIndexSchema,
  playerSchema,
  rankingSchema,
} from "../src/lib/contract";

const DATA = join(process.cwd(), "data", "site");
const read = (...p: string[]) => JSON.parse(readFileSync(join(DATA, ...p), "utf-8"));
const jsonIn = (dir: string) =>
  readdirSync(join(DATA, dir)).filter((f) => f.endsWith(".json"));

const problems: string[] = [];
const fail = (where: string, what: string) => problems.push(`${where} — ${what}`);

/**
 * Intervalle incohérent : tolérance ZÉRO.
 *
 * Un intervalle qui n'encadre pas son point estimé est un contresens — un IC
 * mesure la variabilité du MÊME estimateur que sa valeur. Le corpus en
 * comptait 37 pour deux causes distinctes, toutes deux corrigées côté moteur :
 *
 *   - le bootstrap ne partageait pas les rangs ex æquo alors que le point les
 *     partageait (deux estimateurs différents portant le même nom) ;
 *   - le quantile à 2,5 % était estimé sur cent tirages, c'est-à-dire sur
 *     deux ou trois observations.
 *
 * Il n'en reste aucun. Le contrôle est donc sans budget : si un seul
 * réapparaît, quelque chose a régressé dans `pipeline/metrics.py` et le build
 * doit s'arrêter. `hasUsableInterval` reste en défense en profondeur côté
 * rendu — une page ne doit jamais afficher « 20 (35–40) », même le jour où ce
 * contrôle serait contourné.
 */
let ciAnomalies = 0;
const ciAnomalyPans = new Set<string>();
const ciAnomalyDetail: string[] = [];

const meta = metaSchema.parse(read("meta.json"));
const statuses = new Set(meta.codes.score_status);
const gaps = new Set(meta.codes.unavailable);

let players = 0;
let windows = 0;
let pans = 0;

for (const file of jsonIn("players")) {
  if (file === "index.json") continue;
  const parsed = playerSchema.safeParse(read("players", file));
  if (!parsed.success) {
    fail(`players/${file}`, parsed.error.issues[0]?.message ?? "schéma invalide");
    continue;
  }
  const player = parsed.data;
  players += 1;

  for (const window of player.windows) {
    windows += 1;
    const where = `players/${file} ${window.key}`;

    if (window.score) {
      const s = window.score;
      if (s.world !== null) {
        if (!(s.ci_low <= s.world && s.world <= s.ci_high)) {
          fail(where, `score ${s.world} hors de son intervalle [${s.ci_low}, ${s.ci_high}]`);
        }
      } else if (s.status !== "no_anchor") {
        // Une note absente n'est légitime que faute d'ancrage. Ailleurs, un
        // `world: null` serait un score perdu en route.
        fail(where, `score sans projection monde mais statut ${s.status}`);
      }
      if (!statuses.has(s.status)) fail(where, `statut inconnu : ${s.status}`);
      if (s.weight_covered <= 0 || s.weight_covered > 1) {
        fail(where, `weight_covered hors ]0,1] : ${s.weight_covered}`);
      }
      // La renormalisation doit être lisible : un pan compté dans le score
      // porte un poids utilisé non nul, et réciproquement.
      const used = new Set(s.pans_used);
      for (const pan of window.pans) {
        const counted = pan.weight_used > 0;
        if (counted !== used.has(pan.pan)) {
          fail(where, `${pan.pan} : weight_used=${pan.weight_used} mais pans_used=${used.has(pan.pan)}`);
        }
      }
    }

    // Grille complète : tous les pans du rôle sont présents, calculés ou non.
    const expected = new Set([
      ...Object.keys(meta.pans.scored_by_role[window.role] ?? {}),
      ...meta.pans.descriptive,
    ]);
    const present = new Set(window.pans.map((p) => p.pan));
    for (const pan of expected) {
      if (!present.has(pan)) fail(where, `pan absent de la grille : ${pan}`);
    }

    for (const pan of window.pans) {
      pans += 1;
      if (pan.percentile === null) {
        if (!gaps.has(pan.unavailable.code)) {
          fail(where, `${pan.pan} : motif inconnu ${pan.unavailable.code}`);
        }
      } else if (!(pan.ci_low <= pan.percentile && pan.percentile <= pan.ci_high)) {
        ciAnomalies += 1;
        ciAnomalyPans.add(pan.pan);
        ciAnomalyDetail.push(
          `${where} ${pan.pan} : ${pan.percentile} hors de [${pan.ci_low}, ${pan.ci_high}]`,
        );
      } else if (pan.n_games <= 0) {
        fail(where, `${pan.pan} : n_games nul`);
      }
    }
  }
}

const index = playerIndexSchema.parse(read("players", "index.json"));
if (index.players.length !== players) {
  fail("players/index.json", `${index.players.length} entrées pour ${players} fiches`);
}

let leagues = 0;
for (const file of jsonIn("leagues")) {
  if (file === "index.json") continue;
  const parsed = leagueSchema.safeParse(read("leagues", file));
  if (!parsed.success) {
    fail(`leagues/${file}`, parsed.error.issues[0]?.message ?? "schéma invalide");
    continue;
  }
  leagues += 1;
  for (const season of parsed.data.seasons) {
    const anchor = season.anchor;
    // Un ancrage non identifié sort à NULL AVEC son motif — jamais à 0, et
    // jamais NULL sans explication.
    if (anchor && anchor.value === null && !anchor.conf_reason && !anchor.transf_reason) {
      fail(`leagues/${file} ${season.year}`, "ancrage nul sans motif");
    }
    // La conversion en points est faite à l'export : les deux formes doivent
    // exister ensemble ou pas du tout. Une page qui trouverait l'une sans
    // l'autre serait tentée de refaire l'affine.
    const hasAnchor = anchor?.value != null;
    if (hasAnchor !== (season.anchor_points !== null)) {
      fail(
        `leagues/${file} ${season.year}`,
        `anchor et anchor_points désaccordés (${anchor?.value} / ${season.anchor_points?.value})`,
      );
    }
    if (season.anchor_points) {
      const p = season.anchor_points;
      if (!(p.ci_low <= p.value && p.value <= p.ci_high)) {
        fail(`leagues/${file} ${season.year}`, "ancrage en points hors de son intervalle");
      }
    }
  }
}
leagueIndexSchema.parse(read("leagues", "index.json"));

let rows = 0;
for (const file of jsonIn("rankings")) {
  const ranking = rankingSchema.parse(read("rankings", file));
  rows += ranking.rows.length;
  for (const row of ranking.rows) {
    if (row.score !== null && (row.ci_low === null || row.ci_high === null)) {
      fail(`rankings/${file}`, `${row.handle} : score sans intervalle`);
    }
  }
}

console.log(
  `contrat v${CONTRACT_VERSION} — ${players} fiches, ${windows} fenêtres, ` +
    `${pans} pans, ${leagues} ligues, ${rows} lignes de classement`,
);

if (ciAnomalies) {
  fail(
    "global",
    `${ciAnomalies} intervalle(s) n'encadrent pas leur point estimé ` +
      `(${[...ciAnomalyPans].join(", ")}) — tolérance zéro, cf. metrics.ordinal_percentile ` +
      `et BOOTSTRAP_DRAWS`,
  );
  for (const one of ciAnomalyDetail.slice(0, 10)) problems.push(`  ${one}`);
}

if (problems.length) {
  console.error(`\n${problems.length} violation(s) du contrat :`);
  for (const problem of problems.slice(0, 25)) console.error(`  ${problem}`);
  if (problems.length > 25) console.error(`  … et ${problems.length - 25} autres`);
  process.exit(1);
}
console.log("contrat respecté");
