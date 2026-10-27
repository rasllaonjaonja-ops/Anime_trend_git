// Stockage JSON dans le dossier data/ (stockage versionné par Git). Interface : get / set / del.
import { promises as fs } from "node:fs";
import path from "node:path";
const clean = k => String(k).replace(/[^a-zA-Z0-9:_-]/g, "").replace(/:/g, "/");
export function fileStore(dir = "data") {
  const file = k => path.join(dir, clean(k) + ".json");
  return {
    get: async k => { try { return JSON.parse(await fs.readFile(file(k), "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; } },
    set: async (k, v) => { const f = file(k); await fs.mkdir(path.dirname(f), { recursive: true });
      const tmp = f + ".tmp"; await fs.writeFile(tmp, JSON.stringify(v, null, k === "settings" ? 2 : 0)); await fs.rename(tmp, f); },
    del: async k => { try { await fs.unlink(file(k)); } catch {} },
  };
                                                 }

