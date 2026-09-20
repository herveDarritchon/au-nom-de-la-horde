import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { promises as fs } from "fs";
import path from "path";

const ROOT_DIR = process.cwd();
const SOURCE_BASE = path.join(ROOT_DIR, ".", "compendiums");
const TARGET_BASE = path.join(ROOT_DIR, ".", "packs");
const yaml = true;
const log = true;

console.log("📁 [pullYAMLtoLDB] Lecture du dossier source:", SOURCE_BASE);

const entries = await fs.readdir(SOURCE_BASE, { withFileTypes: true });
const packs = entries.filter(e => e.isDirectory()).map(e => e.name);

if (packs.length === 0) {
  console.log("❌ Aucun dossier trouvé dans ./compendiums. Rien à compiler.");
  process.exit(0);
}

for (const pack of packs) {
  const sourceDir = path.join(SOURCE_BASE, pack);
  const targetDir = path.join(TARGET_BASE, pack);

  console.log(`📦 Compilation du pack "${pack}"`);
  const content = await fs.readdir(sourceDir);
  const yamlFiles = content.filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));

  if (yamlFiles.length === 0) {
    console.log(`⚠️  Aucun fichier YAML trouvé dans ${sourceDir}.`);
    continue;
  }

  console.log(`➡️  ${yamlFiles.length} fichier(s) YAML trouvé(s) dans ${sourceDir}`);
  await compilePack(sourceDir, targetDir, { yaml, log });

  try {
    const generated = await fs.readdir(targetDir);
    if (generated.length === 0) {
      console.log(`⚠️  Aucun fichier généré dans ${targetDir}`);
    } else {
      console.log(`✅ ${generated.length} fichier(s) généré(s) dans ${targetDir} :`);
      for (const file of generated) {
        console.log(`   - ${file}`);
      }
    }
  } catch (err) {
    console.log(`❌ Erreur lors de la lecture du dossier ${targetDir}`, err);
  }
}

console.log("🏁 [pullYAMLtoLDB] Fin de la génération des packs");
