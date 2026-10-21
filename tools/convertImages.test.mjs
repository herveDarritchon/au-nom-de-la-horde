import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { run } from "./convertImages.mjs";

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
