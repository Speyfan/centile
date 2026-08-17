/**
 * Index de recherche allégé, émis comme fichier statique.
 *
 * `players/index.json` pèse 2,2 Mo : l'embarquer dans l'accueil coûterait
 * plus cher que tout le reste de la page. Celui-ci ne porte que ce qu'une
 * recherche affiche, et n'est chargé qu'à la première frappe.
 */
import type { APIRoute } from "astro";
import { getPlayerIndex } from "../lib/data";

export const GET: APIRoute = () => {
  const rows = getPlayerIndex().map((entry) => ({
    s: entry.slug,
    h: entry.handle,
    // Le pseudo replié sans accent ni casse : la recherche se fait dessus,
    // pour que « faker » trouve « Faker » et « bo » trouve « Bo ».
    k: entry.handle
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase(),
    r: entry.role,
    l: entry.league,
    y: entry.year,
    c: entry.score ?? null,
    t: entry.status,
  }));

  return new Response(JSON.stringify({ v: 1, players: rows }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
