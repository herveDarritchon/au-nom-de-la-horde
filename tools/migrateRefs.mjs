/**
 * Warbound — Migrate Refs
 *
 * Réécriture des références `.png` vers `.webp` dans les fichiers sources du
 * module : compendiums YAML, feuilles de style et scripts.
 *
 * Les références ne vivent pas uniquement dans les compendiums : `styles/` et
 * `scripts/` référencent eux aussi des PNG du module. Les migrer est
 * indispensable, sinon la suppression des PNG originaux casserait le rendu.
 *
 * Idempotent : un contenu déjà entièrement en `.webp` n'est pas réécrit.
 *
 * Usage CLI :
 *   pnpm media:migrate-refs           # dry-run par défaut
 *   pnpm media:migrate-refs --write   # applique les modifications
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { rewriteAssetRefs } from "../src/tools/mediaPaths.mjs";
import { MODULE_ID } from "./media.config.mjs";
import { scan } from "./mediaScanner.mjs";

/**
 * @param {Array<{filePath:string,fileDir:string,relativePath:string}>} refs
 * @param {boolean} write
 * @param {{ root: string, migratableAssets?: Set<string> }} options
 * @returns {Promise<{
 *   migrated: number,
 *   skipped: number,
 *   replacements: number,
 *   files: Array<{file:string,replacements:number}>,
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(refs, write, options = {}) {
  const { root, migratableAssets } = options;

  const errors = [];
  const files = [];

  let migrated = 0;
  let skipped = 0;
  let replacements = 0;

  for (const ref of refs) {
    try {
      const content = await fs.readFile(ref.filePath, "utf8");

      const { updated, count } = rewriteAssetRefs(content, {
        root,
        fileDir: ref.fileDir,
        moduleId: MODULE_ID,
        isKnownAsset: migratableAssets
          ? (assetPath) => migratableAssets.has(assetPath)
          : undefined
      });

      if (count === 0) {
        skipped++;
        continue;
      }

      if (write) {
        await fs.writeFile(ref.filePath, updated, "utf8");
      }

      migrated++;
      replacements += count;
      files.push({ file: ref.relativePath ?? ref.filePath, replacements: count });
    } catch (err) {
      errors.push({ file: ref.filePath, error: err.message });
    }
  }

  return { migrated, skipped, replacements, files, errors };
}

export { run };

const ROOT = process.cwd();
const CONVERSION_TABLE = "conversion-table.json";

function isMainModule() {
  const entry = process.argv[1];

  if (!entry) return false;

  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

/**
 * @param {string[]} argv
 * @returns {{ write: boolean, help: boolean, error: string|null }}
 */
function parseArgs(argv) {
  let write = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg === "--dry-run") {
      write = false;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else {
      return { write, help, error: `Option inconnue : ${arg}` };
    }
  }

  return { write, help, error: null };
}

function printHelp() {
  console.log(`
WARBOUND — Migrate Refs

Usage :
  pnpm media:migrate-refs [--dry-run | --write]

Options :
  --dry-run   Projette les remplacements sans rien écrire (comportement par défaut).
  --write     Réécrit les fichiers sources puis exécute pnpm packs:audit.
  -h, --help  Affiche cette aide.

Entrée : ${CONVERSION_TABLE} (produit par pnpm media:convert:images)
`);
}

async function main() {
  const { write, help, error } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  if (error) {
    console.error(`❌ ${error}`);
    printHelp();
    process.exitCode = 2;
    return;
  }

  const mode = write ? "WRITE" : "DRY-RUN";

  if (!write) {
    console.log(
      "\n[DRY-RUN] Aucune écriture sur le disque. Utilise --write pour appliquer."
    );
  }

  const tablePath = path.join(ROOT, CONVERSION_TABLE);

  let table;

  try {
    table = JSON.parse(await fs.readFile(tablePath, "utf8"));
  } catch {
    console.error(
      `❌ ${CONVERSION_TABLE} introuvable. Lance d'abord pnpm media:convert:images.`
    );
    process.exitCode = 1;
    return;
  }

  const migratableAssets = new Set(Object.keys(table));

  console.log("");
  console.log("WARBOUND — Migrate Refs");
  console.log("========================");
  console.log(`Mode............................ ${mode}`);
  console.log(`Assets dans la table............. ${migratableAssets.size}`);
  console.log("");

  const scanReport = await scan(ROOT);

  console.log(
    `Fichiers sources avec refs médias.. ${scanReport.refs.length}`
  );
  console.log("");

  const result = await run(scanReport.refs, write, {
    root: ROOT,
    migratableAssets
  });

  console.log("RÉSULTATS");
  console.log(`  Sources migrées............... ${result.migrated}`);
  console.log(`  Sources inchangées............. ${result.skipped}`);
  console.log(`  Remplacements de références..... ${result.replacements}`);
  console.log("");

  if (result.errors.length > 0) {
    console.error(`ERREURS (${result.errors.length})`);

    for (const { file, error: err } of result.errors) {
      console.error(`  ✗ ${path.relative(ROOT, file)}: ${err}`);
    }

    console.error("");
    process.exitCode = 1;
    return;
  }

  if (!write) {
    const total = result.migrated;
    console.log(
      `Relance avec --write pour appliquer ${total} fichier(s).`
    );
    return;
  }

  if (result.migrated === 0) {
    console.log("✅ Aucune référence à migrer — déjà à jour.");
    return;
  }

  console.log("Validation des packs (pnpm packs:audit)...");

  try {
    execSync("pnpm packs:audit", { stdio: "inherit", cwd: ROOT });
    console.log("✅ Migration terminée.");
  } catch {
    console.error("❌ pnpm packs:audit a échoué après migration.");
    process.exitCode = 1;
  }
}

export { isMainModule, main, parseArgs };

try {
  if (isMainModule()) {
    await main();
  }
} catch (err) {
  console.error("\n❌ ERREUR INATTENDUE");
  console.error(err);
  process.exitCode = 2;
}
