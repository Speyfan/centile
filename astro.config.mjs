// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://lol-scout.local",
  // Rien de dynamique : chaque page est un fichier HTML, la fiche joueur
  // s'ouvre sans exécuter une ligne de JavaScript.
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  vite: { plugins: [tailwindcss()] },
});
