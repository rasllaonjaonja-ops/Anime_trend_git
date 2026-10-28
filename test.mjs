import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(existsSync(fullPath), `Fichier manquant : ${relativePath}`);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } {
    catch (error) {
    throw new Error(`JSON invalide dans ${relativePath}: ${error.message}`);
  }
  }
}

async function main() {
  const pkg = loadJson("package.json");
  assert(pkg && typeof pkg === "object", "package.json est vide ou invalide");
  assert(pkg.scripts && pkg.scripts.test, "package.json n'a pas de script test");

  for (const file of ["data/settings.json", "data/state.json", ".github/workflows/cycle.yml"]) {
    assert(existsSync(path.join(root, file)), `Fichier requis manquant : ${file}`);
  }

  const settings = loadJson("data/settings.json");
  assert(Array.isArray(settings.sources), "data/settings.json doit contenir une liste de sources");
  assert(settings.settingsVersion !== undefined, "data/settings.json doit inclure settingsVersion");

  const state = loadJson("data/state.json");
  assert(state && typeof state === "object", "data/state.json est invalide");

  const workflowPath = path.join(root, ".github/workflows/cycle.yml");
  const workflowText = readFileSync(workflowPath, "utf8");
  assert(/concurrency:/m.test(workflowText), "Le workflow manque la section concurrency");
  assert(/cancel-in-progress:\s*true/m.test(workflowText), "Le workflow ne doit pas autoriser plusieurs cycles simultanés");
  assert(/node --check/m.test(workflowText), "Le workflow doit vérifier la syntaxe Node avant d'exécuter le cycle");

  for (const script of ["scripts/core.mjs", "scripts/file-store.mjs", "scripts/run-cycle.mjs"]) {
    const abs = path.join(root, script);
    assert(existsSync(abs), `Script requis manquant : ${script}`);
    try {
      await import(pathToFileURL(abs).href);
    } catch (error) {
      throw new Error(`Import impossible pour ${script}: ${error.message}`);
    }
  }

  const core = await import(pathToFileURL(path.join(root, "scripts/core.mjs")).href);
  assert(core.DEFAULT_SETTINGS && Array.isArray(core.DEFAULT_SETTINGS.sources), "DEFAULT_SETTINGS doit exposer une liste de sources");
  assert(typeof core.loadSettings === "function", "loadSettings est introuvable");

  console.log("Validation OK: package.json, workflow, données JSON et modules Node sont cohérents.");
}

main().catch((error) => {
  console.error("ÉCHEC DE VALIDATION");
  console.error(error.stack || error.message);
  process.exit(1);
});
