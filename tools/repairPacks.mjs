/**
 * Répare les bases LevelDB des packs dont le fichier MANIFEST est manquant.
 * Utile après un crash de FoundryVTT ou une interruption du build.
 *
 * Usage: pnpm packs:repair
 */
import { promises as fs } from "fs";
import path from "path";

// classic-level is a transitive dep of @foundryvtt/foundryvtt-cli.
// Resolve via the pnpm virtual store symlink.
const { ClassicLevel } = await import(
  new URL(
    "../node_modules/.pnpm/@foundryvtt+foundryvtt-cli@3.0.4/node_modules/classic-level/index.js",
    import.meta.url
  )
);

const TARGET_BASE = path.join(process.cwd(), "packs");

const entries = await fs.readdir(TARGET_BASE, { withFileTypes: true });
const packs = entries.filter(e => e.isDirectory()).map(e => e.name);

let repaired = 0;
let skipped = 0;

for (const pack of packs) {
  const dir = path.join(TARGET_BASE, pack);
  try {
    await ClassicLevel.repair(dir);
    console.log(`✅ Réparé: ${pack}`);
    repaired++;
  } catch (e) {
    console.log(`⏭️  Ignoré (${pack}): ${e.message}`);
    skipped++;
  }
}

console.log(`\n🔧 Réparation terminée — ${repaired} réparé(s), ${skipped} ignoré(s).`);
