// Lancé par GitHub Actions (.github/workflows/cycle.yml) ou à la main : node scripts/run-cycle.mjs
import { appendFileSync } from "node:fs";
import { runCycle, discoverNow, emptyState, DEFAULT_SETTINGS } from "./core.mjs";
import { fileStore } from "./file-store.mjs";

const store = fileStore(process.env.DATA_DIR || "data");
const force = process.env.FORCE === "true";
const sites = (process.env.SITES || "").split(/[\s,]+/).filter(Boolean).slice(0, 10);
const rejectId = (process.env.REJECT_ID || "").trim();
const out = [];

// Première exécution : réglages par défaut en MODE TEST (rien n'est publié tant que vous ne l'avez pas décidé).
if (!(await store.get("settings"))) { await store.set("settings", { ...DEFAULT_SETTINGS, testMode: true }); out.push("Réglages créés (mode test activé)."); }

if (rejectId) {
  const st = { ...emptyState(), ...(await store.get("state") || {}) }, p = st.posts.find(x => x.id === rejectId);
  if (p && ["Prête", "À vérifier", "Erreur"].includes(p.status)) { p.status = "Rejetée"; await store.set("state", st); out.push(`Publication ${rejectId} rejetée.`); }
  else out.push(`Publication ${rejectId} introuvable ou déjà envoyée.`);
}
if (sites.length) { const d = await discoverNow({ store, urls: sites }); out.push(`Détection : ${d.checked} site(s), ${d.added} nouvelle(s) source(s).`); }

const r = await runCycle({ store, force });
out.push(r.skipped ? `Cycle ignoré : ${r.skipped}.` : `Cycle (${r.mode}) : ${r.newImages} nouveauté(s), ${r.duplicates} doublon(s), ${r.published} publiée(s), ${r.errors.length} erreur(s).`);
for (const e of r.errors || []) out.push("  ⚠ " + e);
console.log(out.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Anime Trend\n" + out.map(x => "- " + x).join("\n") + "\n");
              
