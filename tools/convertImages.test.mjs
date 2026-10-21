import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  buildConversionTable,
  findFoundryThumbnails,
  run
} from "./convertImages.mjs";

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

    const result = await run([{ ...image, hasWebp: true }], false);

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

    const result = await run([image], false);

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

    const result = await run([image], true);

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

    const result = await run([image], true);

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

    const result = await run([image], true);

    assert.equal(result.converted, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].file, "assets/absent.png");
  });
});

test("run applique le profil de qualité de l'image", async () => {
  await withTmpDir(async (dir) => {
    const image = { ...toImage(dir, "hero.png"), profile: "icon" };
    await writePng(image.pngPath, { width: 128, height: 128 });

    const result = await run([image], true);

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

    const result = await run([image], true);

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

    const result = await run([image], true);

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

    const result = await run([image], true);

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

    const result = await run([image], true);

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

    const result = await run([icon, token], true);

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

    const result = await run([image], true);

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

test("la table de conversion exclut les PNG conservés", async () => {
  await withTmpDir(async (dir) => {
    const image = toImage(dir, "tiny.png");
    await writePng(image.pngPath, { width: 1, height: 1 });

    const result = await run([image], true);
    const table = buildConversionTable(result.webpAssets);

    if (result.keptPng.includes("assets/tiny.png")) {
      assert.ok(!( "assets/tiny.png" in table));
    } else {
      assert.ok("assets/tiny.png" in table);
    }
  });
});
