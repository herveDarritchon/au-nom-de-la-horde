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
  cleanupPng,
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

test("parseArgs — --type video => valide", () => {
  assert.equal(parseArgs(["--type", "video"]).type, "video");
});

test("parseArgs — --type invalide => erreur", () => {
  const result = parseArgs(["--type", "unknown"]);

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

test("parseArgs — --force-clean", () => {
  assert.equal(parseArgs(["--force-clean"]).forceClean, true);
});

test("parseArgs — forceClean false par défaut", () => {
  assert.equal(parseArgs([]).forceClean, false);
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

// ─── cleanupPng ───────────────────────────────────────────────────────────────

test("cleanupPng — dry-run : aucun fichier supprimé, candidats listés", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "sprite.png");
    const webpPath = path.join(dir, "sprite.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png().toFile(pngPath);
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .webp({ quality: 80 }).toFile(webpPath);

    const images = [{
      assetPath: "sprite.png",
      pngPath,
      webpPath,
      hasWebp: true
    }];

    const result = await cleanupPng(images, new Set(), { dryRun: true });

    assert.equal(result.deleted, 0);
    assert.equal(result.gitDirty, false);
    assert.ok(result.candidates.includes("sprite.png"), "sprite.png doit être candidat");

    const pngStillExists = await fs.access(pngPath).then(() => true).catch(() => false);
    assert.equal(pngStillExists, true, "PNG ne doit pas être supprimé en dry-run");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — PNG supprimé quand toutes les conditions sont remplies (forceClean)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "icon.png");
    const webpPath = path.join(dir, "icon.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png().toFile(pngPath);
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .webp({ quality: 1 }).toFile(webpPath);

    const images = [{
      assetPath: "icon.png",
      pngPath,
      webpPath,
      hasWebp: true
    }];

    const result = await cleanupPng(images, new Set(), { dryRun: false, forceClean: true });

    assert.equal(result.gitDirty, false);
    assert.equal(result.deleted, 1);
    assert.equal(result.kept.length, 0);

    const pngStillExists = await fs.access(pngPath).then(() => true).catch(() => false);
    assert.equal(pngStillExists, false, "PNG doit être supprimé");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — PNG conservé quand WebP est plus grand", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "tiny.png");
    const webpPath = path.join(dir, "tiny.webp");
    const sharp = (await import("sharp")).default;

    // PNG d'1 octet (fs.stat seulement, pas validé) → garantit que WebP valide sera plus grand
    await fs.writeFile(pngPath, Buffer.from([0x00]));
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 200, b: 200 } } })
      .webp({ quality: 80 }).toFile(webpPath);

    const images = [{
      assetPath: "tiny.png",
      pngPath,
      webpPath,
      hasWebp: true
    }];

    const result = await cleanupPng(images, new Set(), { dryRun: false, forceClean: true });

    assert.equal(result.deleted, 0);
    assert.ok(result.kept.some((k) => k.path === "tiny.png" && k.reason === "webp_larger"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — PNG conservé quand il reste des références YAML", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "map.png");
    const webpPath = path.join(dir, "map.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 128, b: 0 } } })
      .png().toFile(pngPath);
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 128, b: 0 } } })
      .webp({ quality: 1 }).toFile(webpPath);

    const images = [{
      assetPath: "map.png",
      pngPath,
      webpPath,
      hasWebp: true
    }];

    const remaining = new Set(["map.png"]);
    const result = await cleanupPng(images, remaining, { dryRun: false, forceClean: true });

    assert.equal(result.deleted, 0);
    assert.ok(result.kept.some((k) => k.path === "map.png" && k.reason === "refs_remaining"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — collision détectée : aucun PNG supprimé", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const png1 = path.join(dir, "portrait.png");
    const png2 = path.join(dir, "portrait.jpg");
    const webpPath = path.join(dir, "portrait.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png().toFile(png1);
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .jpeg().toFile(png2);
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .webp({ quality: 1 }).toFile(webpPath);

    // Le scanner ne remonte que le PNG : cleanupPng doit détecter le JPEG
    // voisin qui entrerait en collision avec le même WebP.
    const images = [
      { assetPath: "portrait.png", pngPath: png1, webpPath, hasWebp: true }
    ];

    const result = await cleanupPng(images, new Set(), { dryRun: false, forceClean: true });

    assert.equal(result.deleted, 0);
    assert.equal(result.collisions.length, 1);
    assert.ok(result.kept.every((k) => k.reason === "collision"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — WebP invalide : PNG conservé", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "broken.png");
    const webpPath = path.join(dir, "broken.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png().toFile(pngPath);
    await fs.writeFile(webpPath, Buffer.from("not a valid webp"));

    const images = [{
      assetPath: "broken.png",
      pngPath,
      webpPath,
      hasWebp: true
    }];

    const result = await cleanupPng(images, new Set(), { dryRun: false, forceClean: true });

    assert.equal(result.deleted, 0);
    assert.ok(result.kept.some((k) => k.path === "broken.png" && k.reason === "webp_invalid"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupPng — PNG sans WebP conservé (no_webp)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-cleanup-"));

  try {
    const pngPath = path.join(dir, "orphan.png");
    const webpPath = path.join(dir, "orphan.webp");
    const sharp = (await import("sharp")).default;

    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png().toFile(pngPath);

    const images = [{
      assetPath: "orphan.png",
      pngPath,
      webpPath,
      hasWebp: false
    }];

    const result = await cleanupPng(images, new Set(), { dryRun: false, forceClean: true });

    assert.equal(result.deleted, 0);
    assert.ok(result.kept.some((k) => k.path === "orphan.png" && k.reason === "no_webp"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ─── collectRemainingPngRefs ──────────────────────────────────────────────────

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
