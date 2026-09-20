import { promises as fs } from "fs";
import path from "path";

const ROOT = path.resolve("./compendiums");

const OLD_PREFIX =
  "worlds/au-nom-de-la-horde-cof2/assets/";

const NEW_PREFIX =
  "modules/warbound-campaign-content/assets/";

let scanned = 0;
let modified = 0;
let replacements = 0;

async function processDirectory(directory) {
  const entries = await fs.readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(fullPath);
      continue;
    }

    if (
      !entry.name.endsWith(".yml") &&
      !entry.name.endsWith(".yaml")
    ) {
      continue;
    }

    scanned++;

    const original = await fs.readFile(fullPath, "utf8");

    const count =
      original.split(OLD_PREFIX).length - 1;

    if (!count) continue;

    const updated =
      original.split(OLD_PREFIX).join(NEW_PREFIX);

    await fs.writeFile(fullPath, updated, "utf8");

    modified++;
    replacements += count;

    console.log(
      `✓ ${entry.name}: ${count} remplacement(s)`
    );
  }
}

await processDirectory(ROOT);

console.log("");
console.log(`YAML analysés : ${scanned}`);
console.log(`YAML modifiés : ${modified}`);
console.log(`Chemins remplacés : ${replacements}`);