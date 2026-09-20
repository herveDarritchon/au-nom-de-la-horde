import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const yaml = true;
const log = true;

const entries = await fs.readdir("./packs", { withFileTypes: true });

const packs = entries
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

console.log(`Packs: ${packs}`);

for (const pack of packs) {
  console.log(`Unpacking ${pack}`);
  const directory = `./compendiums/${pack}`;
  console.log(`Directory: ${directory}`);
  try {
    const files = await fs.readdir(directory);
    console.log(`Files: ${files}`);
    for (const file of files) {
      const filesToDelete = path.join(directory, file);
      console.log(`Deleting files${filesToDelete}`);
      await fs.unlink(filesToDelete);
    }
  } catch (error) {
    if (error.code === "ENOENT") console.log(`No files inside of ${pack}`);
    else console.log(error);
  }
  console.log(`Extracting pack:${pack}`);
  try {
    await extractPack(
      `${ROOT}/packs/${pack}`,
      `${ROOT}/compendiums/${pack}`,
      {
        yaml: true,
        transformName,
        log: true
      }
    );
  } catch (error) {
    console.error("Error extracting pack:", error);
  }
}

/**
 * Prefaces the document with its type
 * @param {object} doc The document data
 */
function transformName (doc) {
  const safeFileName = doc.name.replace(/[^a-zA-Z0-9А-я]/g, "_");
  const type = doc._key.split("!")[1];
  const prefix = ["actors", "items"].includes(type) ? doc.type : type;

  console.log(`transformName: ${doc.name}`);
  return `${doc.name ? `${prefix}_${safeFileName}_${doc._id}` : doc._id}.${
    yaml ? "yml" : "json"
  }`;
}
