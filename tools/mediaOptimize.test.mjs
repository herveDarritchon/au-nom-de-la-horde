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

test("parseArgs — --type images", () => {
  assert.equal(parseArgs(["--type", "images"]).type, "images");
});

test("parseArgs — --type audio", () => {
  assert.equal(parseArgs(["--type", "audio"]).type, "audio");
});

test("parseArgs — --type all", () => {
  assert.equal(parseArgs(["--type", "all"]).type, "all");
});

test("parseArgs — --type invalide => erreur", () => {
  const result = parseArgs(["--type", "video"]);

  assert.ok(result.error !== null);
  assert.match(result.error, /--type invalide/);
});

test("parseArgs — --type sans valeur => erreur", () => {
  const result = parseArgs(["--type"]);

  assert.ok(result.error !== null);
  assert.match(result.error, /--type invalide/);
});

test("parseArgs — --quality 80", () => {
  assert.equal(parseArgs(["--quality", "80"]).quality, 80);
});

test("parseArgs — --quality 0 est accepté", () => {
  assert.equal(parseArgs(["--quality", "0"]).quality, 0);
});

test("parseArgs — --quality 101 hors plage => erreur", () => {
  const result = parseArgs(["--quality", "101"]);

  assert.ok(result.error !== null);
  assert.match(result.error, /--quality invalide/);
});

test("parseArgs — --quality abc => erreur", () => {
  const result = parseArgs(["--quality", "abc"]);

  assert.ok(result.error !== null);
  assert.match(result.error, /--quality invalide/);
});

test("parseArgs — --quality sans valeur => erreur", () => {
  const result = parseArgs(["--quality"]);

  assert.ok(result.error !== null);
  assert.match(result.error, /--quality invalide/);
});

test("parseArgs — --update-references", () => {
  assert.equal(parseArgs(["--update-references"]).updateReferences, true);
});

test("parseArgs — updateReferences false par défaut", () => {
  assert.equal(parseArgs([]).updateReferences, false);
});

test("parseArgs — --clean", () => {
  assert.equal(parseArgs(["--clean"]).clean, true);
});

test("parseArgs — --confirm", () => {
  assert.equal(parseArgs(["--confirm"]).confirm, true);
});

test("parseArgs — type all par défaut", () => {
  assert.equal(parseArgs([]).type, "all");
});

test("parseArgs — quality null par défaut", () => {
  assert.equal(parseArgs([]).quality, null);
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
