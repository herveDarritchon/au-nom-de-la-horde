/**
 * Tests de l'orchestrateur `pnpm media:optimize`.
 *
 * Couvre l'analyse des arguments et le garde-fou de nettoyage : seules les
 * références pointant vers un asset réellement présent sur le disque doivent
 * empêcher la suppression d'un PNG.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  collectRemainingPngRefs,
  isMainModule,
  parseArgs
} from "./mediaOptimize.mjs";

const MODULE_ID = "warbound-campaign-content";
const PREFIX = `modules/${MODULE_ID}/`;

test("parseArgs — dry-run par défaut", () => {
  const result = parseArgs([]);

  assert.equal(result.write, false);
  assert.equal(result.help, false);
  assert.equal(result.error, null);
});

test("parseArgs — --write active l'écriture", () => {
  assert.equal(parseArgs(["--write"]).write, true);
});

test("parseArgs — --dry-run désactive explicitement l'écriture", () => {
  assert.equal(parseArgs(["--write", "--dry-run"]).write, false);
});

test("parseArgs — --help et -h", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
});

test("parseArgs — option inconnue => erreur", () => {
  const result = parseArgs(["--convertir"]);

  assert.equal(result.error, "Option inconnue : --convertir");
});

test("isMainModule — false quand le module est importé", () => {
  assert.equal(isMainModule(), false);
});

test("collectRemainingPngRefs — ignore les références vers des assets absents", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-media-orch-"));

  try {
    await fs.mkdir(path.join(dir, "assets"), { recursive: true });
    await fs.writeFile(path.join(dir, "assets", "existe.png"), "png");

    const sourcePath = path.join(dir, "source.yml");

    await fs.writeFile(
      sourcePath,
      [
        `img: ${PREFIX}assets/existe.png`,
        `doc: ${PREFIX}assets/illustration-de-doc.png`,
        ""
      ].join("\n")
    );

    const sources = [
      {
        filePath: sourcePath,
        fileDir: dir,
        relativePath: "source.yml"
      }
    ];

    const knownAssets = new Set(["assets/existe.png"]);

    const remaining = await collectRemainingPngRefs(sources, knownAssets);

    assert.deepEqual([...remaining], ["assets/existe.png"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
