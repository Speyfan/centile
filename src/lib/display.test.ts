/**
 * Tests des formateurs — chaînes attendues exactes.
 *
 * Ces tests couvrent une classe de défauts qu'aucun autre contrôle du projet
 * ne voit : `check-data.ts` valide les données, `astro check` valide les
 * types, et les deux passent pendant que la page affiche un nombre faux.
 * C'est arrivé — `num(valeur, décimales)` traitait son second argument comme
 * un booléen, et la page méthode annonçait une corrélation de « 0,9 » là où
 * le moteur avait mesuré 0,8832.
 *
 * D'où la forme : on compare des chaînes littérales, pas des nombres. Un test
 * qui vérifierait `num(0.8832, 2)` « vaut à peu près 0,88 » n'aurait rien
 * attrapé.
 *
 *     npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasUsableInterval,
  int,
  num,
  panTone,
  plusMinus,
  ratio,
  unavailableMessage,
} from "./display";
import type { Meta, Pan, RatedScore } from "./contract";

// L'espace des milliers en fr-FR est une espace fine insécable (U+202F), pas
// une espace ordinaire. Un test qui écrirait " " passerait à côté.
const NBSP = " ";

test("num honore son nombre de décimales", () => {
  assert.equal(num(0.8832, 2), "0,88");
  assert.equal(num(0.8832, 1), "0,9");
  assert.equal(num(0.8832, 0), "1");
  assert.equal(num(6.2822, 2), "6,28");
  assert.equal(num(85.05, 1), "85,1");
});

test("num par défaut arrondit au dixième", () => {
  assert.equal(num(85.132), "85,1");
  assert.equal(num(0.8832), "0,9");
});

test("num(x, 2) et num(x, 1) ne rendent pas la même chose", () => {
  // La régression exacte : deux formateurs pour toutes les précisions
  // faisaient de `digits` un booléen.
  assert.notEqual(num(0.8832, 2), num(0.8832, 1));
});

test("le séparateur décimal est la virgule, jamais le point", () => {
  for (const value of [0.5, 12.34, 99.9, 1234.5]) {
    assert.ok(!num(value, 2).includes("."), `${value} rendu avec un point`);
  }
});

test("ratio affiche toujours deux décimales", () => {
  assert.equal(ratio(0.8832), "0,88");
  assert.equal(ratio(0.9), "0,90");
  assert.equal(ratio(0.9024), "0,90");
  assert.equal(ratio(1), "1,00");
  assert.equal(ratio(-0.5), "-0,50");
});

test("int groupe les milliers avec une espace fine insécable", () => {
  assert.equal(int(6172), `6${NBSP}172`);
  assert.equal(int(73189), `73${NBSP}189`);
  assert.equal(int(121), "121");
  assert.equal(int(0), "0");
});

test("int n'affiche aucune décimale", () => {
  assert.equal(int(85.7), "86");
  assert.ok(!int(85.7).includes(","));
});

// ---------------------------------------------------------------- le ±

const score = (world: number, low: number, high: number): RatedScore =>
  ({
    world,
    ci_low: low,
    ci_high: high,
    status: "published",
    clipped: false,
    local_percentile: 50,
    world_z: 0,
    world_sd: null,
    weight_covered: 1,
    pans_used: [],
    anchor: null,
  }) as RatedScore;

test("plusMinus retient la borne la plus large", () => {
  // Intervalle asymétrique : la lecture prudente est le côté le plus long.
  assert.equal(plusMinus(score(85.1, 78.2, 92.1)), 7);
  assert.equal(plusMinus(score(64.3, 59.1, 69.5)), 5.2);
  assert.equal(plusMinus(score(50, 40, 52)), 10);
});

test("plusMinus arrondit au dixième sans jamais rendre de flottant sale", () => {
  assert.equal(num(plusMinus(score(85.1, 78.2, 92.1))), "7");
  assert.equal(num(plusMinus(score(10.05, 10, 10.1))), "0,1");
});

// ------------------------------------------------------- seuils de couleur

test("les seuils de couleur sont 70 et 40, bornes incluses", () => {
  assert.equal(panTone(95), "high");
  assert.equal(panTone(70), "high");
  assert.equal(panTone(69.9), "mid");
  assert.equal(panTone(40), "mid");
  assert.equal(panTone(39.9), "low");
  assert.equal(panTone(0), "low");
  assert.equal(panTone(null), "none");
});

// --------------------------------------------------- intervalle exploitable

const pan = (percentile: number, low: number, high: number): Pan =>
  ({
    pan: "laning",
    weight_used: 0.25,
    percentile,
    ci_low: low,
    ci_high: high,
    n_games: 20,
    pool_size: 10,
    stats: {},
  }) as Pan;

test("un intervalle qui n'encadre pas son point est refusé au rendu", () => {
  assert.equal(hasUsableInterval(pan(50, 40, 60)), true);
  assert.equal(hasUsableInterval(pan(50, 50, 60)), true);
  assert.equal(hasUsableInterval(pan(9.2, 10, 38.4)), false);
  assert.equal(hasUsableInterval(pan(50, 20, 49)), false);
});

// ------------------------------------------------------------- les motifs

const meta = {
  thresholds: { min_games_pan: 10, min_pool_size: 8, min_games_edge: 3 },
} as Meta;

test("un pan sans stats @15 nomme la ligue et la cause", () => {
  const message = unavailableMessage(
    {
      code: "thin_basis",
      scope: "pool",
      n_stats: 0,
      n_stats_expected: 3,
      missing_stats: ["csdiffat15", "xpdiffat15", "golddiffat15"],
    },
    "LPL",
    meta,
  );
  assert.equal(message, "Stats @15 non collectées en LPL");
});

test("un motif nomme toujours quelque chose", () => {
  const codes = [
    "thin_basis",
    "small_pool",
    "few_games",
    "player_below_min_games",
    "not_computed",
  ] as const;
  for (const code of codes) {
    const message = unavailableMessage(
      { code, scope: "pool", n_stats_expected: 2 },
      "LFL",
      meta,
    );
    assert.ok(message.length > 0, `${code} sans message`);
    assert.ok(!message.includes("undefined"), `${code} : ${message}`);
  }
});
