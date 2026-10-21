import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  buildConversionTable,
  findFoundryThumbnails,
  run,
  sharpOptions
} from "./convertImages.mjs";

import { buildManifestEntry, mergeManifest } from "../src/tools/conversionManifest.mjs";

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-convert-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function writePng(filePath, { width = 64, height = 64 } = {}) {
  const sharp = (await import("sharp")).default;
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 30, b: 200 }
    }
  })
    .png()
    .toFile(filePath);
}

/** PNG RGBA semi-transparent, pour vérifier la conservation du canal alpha. */
async function writePngWithAlpha(filePath, { width = 64, height = 64 } = {}) {
  const sharp = (await import("sharp")).default;
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toFile(filePath);
}

function toImage(dir, name) {
  const pngPath = path.join(dir, name);
  const webpPath = pngPath.replace(/\.png$/i, ".webp");

  return {
    assetPath: `assets/${name}`,
    pngPath,
    webpPath,
    profile: "default",
    hasWebp: false
  };
}

test("run ignore une image dont le WebP existe déjà (idempotence)", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await fs.writeFile(image.pngPath, "fake-png", "utf8");
    await fs.writeFile(image.webpPath, "fake-webp", "utf8");

    const result = await run([{ ...image, hasWebp: true }], { write: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.converted, 0);
    assert.equal(result.errors.length, 0);
    assert.ok(result.webpAssets.has("assets/hero.png"));
  });
});

test("run compte une conversion en dry-run sans écrire", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath);

    const result = await run([image], { write: false });

    assert.equal(result.converted, 1);
    assert.equal(result.written, 0);
    assert.equal(result.errors.length, 0);

    await assert.rejects(() => fs.access(image.webpPath));
  });
});

test("run convertit réellement le PNG en WebP en mode write", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 256, height: 256 });

    const result = await run([image], { write: true });

    assert.equal(result.converted, 1);
    assert.equal(result.written, 1);
    assert.equal(result.errors.length, 0);

    const webp = await fs.readFile(image.webpPath);
    assert.equal(webp.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(webp.subarray(8, 12).toString("ascii"), "WEBP");

    assert.ok(result.webpAssets.has("assets/hero.png"));
    assert.ok(result.sizes.webpBytes > 0);
  });
});

test("run conserve le PNG lorsque le WebP produit est plus lourd", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 1, height: 1 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);

    if (result.keptPng.includes("assets/hero.png")) {
      assert.ok(!result.webpAssets.has("assets/hero.png"));
      await assert.rejects(() => fs.access(image.webpPath));
      await fs.access(image.pngPath);
    } else {
      assert.ok(result.webpAssets.has("assets/hero.png"));
    }
  });
});

test("run rapporte une erreur si le fichier source est introuvable", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "absent.png");

    const result = await run([image], { write: true });

    assert.equal(result.converted, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].file, "assets/absent.png");
  });
});

test("run applique le profil de qualité de l'image", async () => {
  await withTmpDir(async (dir) => {
    const image = { ...toImage(dir, "hero.png"), profile: "icon" };
    await writePng(image.pngPath, { width: 128, height: 128 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);
    assert.equal(result.written, 1);
  });
});

// Dimensions et canal alpha

test("run préserve les dimensions d'origine (battlemaps)", async () => {
  await withTmpDir(async (dir) => {
    const sharp = (await import("sharp")).default;
    const image = { ...toImage(dir, "map.png"), profile: "map" };
    await writePng(image.pngPath, { width: 1024, height: 512 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);
    assert.equal(result.converted, 1);

    const before = await sharp(image.pngPath).metadata();
    const after = await sharp(image.webpPath).metadata();

    assert.equal(after.width, before.width, "la largeur doit être préservée");
    assert.equal(after.height, before.height, "la hauteur doit être préservée");
  });
});

test("run préserve le canal alpha (tokens)", async () => {
  await withTmpDir(async (dir) => {
    const sharp = (await import("sharp")).default;
    const image = { ...toImage(dir, "token.png"), profile: "token" };
    await writePngWithAlpha(image.pngPath, { width: 64, height: 64 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);
    assert.equal(result.converted, 1);

    const after = await sharp(image.webpPath).metadata();

    assert.equal(after.hasAlpha, true, "le canal alpha doit être conservé");

    // Le pixel transparent du PNG le reste après conversion.
    const { data } = await sharp(image.webpPath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.equal(data[3], 0, "la transparence doit être conservée");
  });
});

test("run conserve les dimensions et l'alpha en profil lossless", async () => {
  await withTmpDir(async (dir) => {
    const sharp = (await import("sharp")).default;
    const image = { ...toImage(dir, "icon.png"), profile: "icon" };
    await writePngWithAlpha(image.pngPath, { width: 48, height: 24 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);

    const after = await sharp(image.webpPath).metadata();

    assert.equal(after.width, 48);
    assert.equal(after.height, 24);
    assert.equal(after.hasAlpha, true);
  });
});

// Signalement des WebP plus lourds que l'original

test("run signale les WebP plus lourds que l'original", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "tiny.png");
    await writePng(image.pngPath, { width: 1, height: 1 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);

    if (!result.keptPng.includes("assets/tiny.png")) {
      // Un PNG de 1×1 est incompressible : le WebP ne peut pas être plus léger.
      return;
    }

    assert.equal(result.keptPngDetails.length, 1);

    const detail = result.keptPngDetails[0];

    assert.equal(detail.assetPath, "assets/tiny.png");
    assert.equal(detail.profile, "default");
    assert.ok(detail.pngBytes > 0, "la taille du PNG doit être rapportée");
    assert.ok(
      detail.webpBytes >= detail.pngBytes,
      "le WebP signalé doit être plus lourd que le PNG"
    );
    assert.ok(!result.webpAssets.has("assets/tiny.png"));
  });
});

test("run répartit les conversions par profil", async () => {
  await withTmpDir(async (dir) => {
    const icon = { ...toImage(dir, "icon.png"), profile: "icon" };
    const token = { ...toImage(dir, "token.png"), profile: "token" };

    await writePng(icon.pngPath, { width: 32, height: 32 });
    await writePng(token.pngPath, { width: 32, height: 32 });

    const result = await run([icon, token], { write: true });

    assert.equal(result.byProfile.icon.candidates, 1);
    assert.equal(result.byProfile.token.candidates, 1);
    assert.equal(result.byProfile.icon.converted, 1);
    assert.equal(result.byProfile.token.converted, 1);
  });
});

// Vignettes Foundry

test("run ignore les vignettes de scènes générées par Foundry", async () => {
  await withTmpDir(async (dir) => {
    const image = {
      ...toImage(dir, "thumb-abc.png"),
      assetPath: "assets/scenes/thumb-abc.png"
    };
    await writePng(image.pngPath, { width: 32, height: 32 });

    const result = await run([image], { write: true });

    assert.equal(result.thumbnailsSkipped, 1);
    assert.equal(result.converted, 0);
    assert.equal(result.written, 0);
    assert.equal(result.errors.length, 0);

    await assert.rejects(() => fs.access(image.webpPath));
  });
});

test("findFoundryThumbnails liste les vignettes de scènes", async () => {
  await withTmpDir(async (dir) => {
    const scenesDir = path.join(dir, "assets", "scenes");
    await fs.mkdir(scenesDir, { recursive: true });
    await fs.writeFile(path.join(scenesDir, "thumb-abc.webp"), "x", "utf8");
    await fs.writeFile(path.join(scenesDir, "thumb-def.webp"), "x", "utf8");
    await fs.writeFile(path.join(scenesDir, "scene-map.png"), "x", "utf8");

    const found = await findFoundryThumbnails(dir);

    assert.deepEqual(found, [
      "assets/scenes/thumb-abc.webp",
      "assets/scenes/thumb-def.webp"
    ]);
  });
});

test("findFoundryThumbnails renvoie une liste vide si le dossier est absent", async () => {
  await withTmpDir(async (dir) => {
    assert.deepEqual(await findFoundryThumbnails(dir), []);
  });
});

// Table de conversion

test("buildConversionTable ne contient que les conversions réussies", () => {
  const table = buildConversionTable([
    "assets/images/avatar/portrait.png",
    "assets/images/icons/icone.png"
  ]);

  assert.deepEqual(table, {
    "assets/images/avatar/portrait.png": "assets/images/avatar/portrait.webp",
    "assets/images/icons/icone.png": "assets/images/icons/icone.webp"
  });
});

test("buildConversionTable est vide quand aucune conversion n'a réussi", () => {
  assert.deepEqual(buildConversionTable(new Set()), {});
});

// qualityOverride

test("run respecte qualityOverride en mode write", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 128, height: 128 });

    const result = await run([image], { write: true, quality: 50 });

    assert.equal(result.errors.length, 0);
    assert.equal(result.written, 1);
  });
});

test("run avec qualityOverride=null utilise le profil par défaut", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 128, height: 128 });

    const result = await run([image], { write: true, quality: null });

    assert.equal(result.errors.length, 0);
    assert.equal(result.written, 1);
  });
});

test("outcomes contient les tailles pour une conversion réussie", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 256, height: 256 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);
    assert.equal(result.outcomes.length, 1);

    const detail = result.outcomes[0];

    assert.equal(detail.assetPath, "assets/hero.png");
    assert.equal(detail.reason, "CONVERTED");
    assert.ok(detail.pngBytes > 0);
    assert.ok(detail.webpBytes > 0);
    assert.equal(typeof detail.savingsPct, "number");
  });
});

test("keptPngDetails contient reason SKIP_LARGER", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "tiny.png");
    await writePng(image.pngPath, { width: 1, height: 1 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);

    if (!result.keptPng.includes("assets/tiny.png")) {
      return;
    }

    assert.equal(result.keptPngDetails.length, 1);
    assert.equal(result.keptPngDetails[0].reason, "SKIP_LARGER");
  });
});

test("la table de conversion exclut les PNG conservés", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "tiny.png");
    await writePng(image.pngPath, { width: 1, height: 1 });

    const result = await run([image], { write: true });
    const table = buildConversionTable(result.webpAssets);

    if (result.keptPng.includes("assets/tiny.png")) {
      assert.ok(!( "assets/tiny.png" in table));
    } else {
      assert.ok("assets/tiny.png" in table);
    }
  });
});

// Profils, override de qualité et effort d'encodage

test("l'override de qualité s'applique à tous les profils", async () => {
  await withTmpDir(async (dir) => {
    const icon = { ...toImage(dir, "icon.png"), profile: "icon" };
    const token = { ...toImage(dir, "token.png"), profile: "token" };

    await writePng(icon.pngPath, { width: 32, height: 32 });
    await writePng(token.pngPath, { width: 32, height: 32 });

    const result = await run([icon, token], { write: true, quality: 42 });

    assert.equal(result.errors.length, 0);
    assert.equal(result.manifestEntries.length, 2);

    for (const entry of result.manifestEntries) {
      assert.equal(entry.settings.quality, 42, "la qualité override doit primer");
    }

    assert.equal(result.manifestEntries[0].settings.lossless, true);
  });
});

test("sharpOptions traduit les réglages du profil", () => {
  assert.deepEqual(sharpOptions({ quality: 85, lossless: false, effort: 4 }), {
    quality: 85,
    lossless: false,
    effort: 4
  });

  // Une qualité absente n'est pas transmise à Sharp (il applique son défaut).
  assert.deepEqual(sharpOptions({ quality: null, lossless: true, effort: 6 }), {
    lossless: true,
    effort: 6
  });
});

test("l'encodeur reçoit les réglages du profil de chaque image", async () => {
  await withTmpDir(async (dir) => {
    const icon = { ...toImage(dir, "icon.png"), profile: "icon" };
    const token = { ...toImage(dir, "token.png"), profile: "token" };

    await writePng(icon.pngPath, { width: 32, height: 32 });
    await writePng(token.pngPath, { width: 32, height: 32 });

    const seen = [];
    const encode = async (source, settings) => {
      seen.push(settings);
      return Buffer.alloc(Math.max(1, Math.floor(source.length / 2)));
    };

    await run([icon, token], { write: true, encode });

    assert.equal(seen.length, 2);
    assert.equal(seen[0].profile, "icon");
    assert.equal(seen[0].lossless, true);
    assert.equal(seen[0].quality, null);
    assert.equal(seen[0].effort, 4);
    assert.equal(seen[1].profile, "token");
    assert.equal(seen[1].quality, 87);
    assert.equal(seen[1].lossless, false);
  });
});

test("les réglages du profil sont repris dans le manifeste", async () => {
  await withTmpDir(async (dir) => {
    const image = { ...toImage(dir, "map.png"), profile: "map" };
    await writePng(image.pngPath, { width: 32, height: 32 });

    const result = await run([image], { write: true });

    assert.equal(result.manifestEntries.length, 1);

    const entry = result.manifestEntries[0];

    assert.equal(entry.profile, "map");
    assert.equal(entry.settings.quality, 88);
    assert.equal(entry.settings.lossless, false);
    assert.equal(entry.settings.effort, 4);
    assert.equal(entry.reason, "CONVERTED");
    assert.ok(entry.sourceHash);
  });
});

// Manifeste et idempotence

test("relancer au même profil ne modifie pas les WebP produits", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });

    const first = await run([image], { write: true });
    const manifest = mergeManifest(null, first.manifestEntries);

    const second = await run(
      [{ ...image, hasWebp: true }],
      { write: true, manifest }
    );

    assert.equal(second.converted, 0);
    assert.equal(second.written, 0);
    assert.equal(second.reencoded, 0);
    assert.equal(second.byReason.SKIP_OPTIMIZED, 1);
    assert.equal(second.byReason.CONVERTED, 0);
    assert.ok(second.webpAssets.has("assets/hero.png"));
  });
});

test("changer la qualité réencode les WebP existants", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });

    const first = await run([image], { write: true });
    const manifest = mergeManifest(null, first.manifestEntries);

    const second = await run(
      [{ ...image, hasWebp: true }],
      { write: true, quality: 20, manifest }
    );

    assert.equal(second.reencoded, 1);
    assert.equal(second.written, 1);
    assert.equal(second.byReason.REENCODED, 1);
    assert.equal(second.byReason.SKIP_OPTIMIZED, 0);
  });
});

test("un WebP sans trace dans le manifeste est laissé intact", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });
    await fs.writeFile(image.webpPath, "webp-existant", "utf8");

    const result = await run([{ ...image, hasWebp: true }], { write: true });

    assert.equal(result.converted, 0);
    assert.equal(result.written, 0);
    assert.equal(result.byReason.SKIP_EXISTING, 1);

    const content = await fs.readFile(image.webpPath, "utf8");
    assert.equal(content, "webp-existant", "le WebP existant doit être intact");
  });
});

test("un WebP antérieur survit à un réencodage plus lourd", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });
    await fs.writeFile(image.webpPath, "webp-antérieur", "utf8");

    // Un manifeste dont la signature ne correspond plus force le réencodage.
    const manifest = mergeManifest(null, [
      buildManifestEntry({
        assetPath: image.assetPath,
        settings: { profile: "default", quality: 10, lossless: false, effort: 4 },
        sourceHash: "0000000000000000",
        pngBytes: 1,
        webpBytes: 1,
        reason: "CONVERTED"
      })
    ]);

    // Un encodeur qui produit un WebP plus lourd que le PNG source.
    const encode = async (source) => Buffer.alloc(source.length * 2, 7);

    const result = await run(
      [{ ...image, hasWebp: true }],
      { write: true, manifest, encode }
    );

    const content = await fs.readFile(image.webpPath, "utf8");
    assert.equal(content, "webp-antérieur", "le WebP antérieur ne doit pas être détruit");
    assert.equal(result.byReason.SKIP_LARGER, 1);
    assert.equal(result.converted, 0);
    assert.ok(result.keptPng.includes("assets/hero.png"));
    assert.ok(!result.webpAssets.has("assets/hero.png"));
  });
});

test("un WebP plus lourd n'est pas écrit et le PNG est conservé", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });

    const encode = async (source) => Buffer.alloc(source.length * 2, 7);

    const result = await run([image], { write: true, encode });

    assert.equal(result.byReason.SKIP_LARGER, 1);
    assert.equal(result.converted, 0);
    assert.equal(result.written, 0);
    assert.ok(result.keptPng.includes("assets/hero.png"));
    assert.ok(!result.webpAssets.has("assets/hero.png"));
    assert.equal(result.keptPngDetails[0].reason, "SKIP_LARGER");
    assert.ok(result.keptPngDetails[0].webpBytes > result.keptPngDetails[0].pngBytes);

    await assert.rejects(() => fs.access(image.webpPath));
    await fs.access(image.pngPath);
  });
});

test("le rapport expose l'économie totale et les motifs de décision", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "hero.png");
    await writePng(image.pngPath, { width: 64, height: 64 });

    const result = await run([image], { write: true });

    assert.equal(result.errors.length, 0);
    assert.ok(result.sizes.pngBytes > 0);
    assert.ok(result.sizes.webpBytes > 0);
    assert.equal(result.byReason.CONVERTED, 1);
    assert.equal(result.outcomes.length, 1);
  });
});
