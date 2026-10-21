import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { scan } from "./mediaScanner.mjs";

const MODULE_PREFIX = "modules/warbound-campaign-content/";

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-scan-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function buildFixture(root) {
  await write(path.join(root, "assets/images/hero.png"), "fake-png");
  await write(path.join(root, "assets/images/icons/icon.png"), "fake-png");
  await write(path.join(root, "assets/images/deja.webp"), "fake-webp");
  await write(path.join(root, "assets/musics/ambiance.ogg"), "fake-ogg");
  await write(
    path.join(root, "compendiums/items/arme.yml"),
    `img: ${MODULE_PREFIX}assets/images/hero.png`
  );
  await write(
    path.join(root, "compendiums/items/invulnérable.yml"),
    `img: ${MODULE_PREFIX}assets/images/deja.webp`
  );
  await write(
    path.join(root, "styles/warbound.css"),
    'body { background: url("../assets/images/hero.png"); }'
  );
  await write(
    path.join(root, "scripts/warbound.mjs"),
    "logo: `modules/${MODULE_ID}/assets/images/hero.png`"
  );
  await write(
    path.join(root, "src/tools/fixture.test.mjs"),
    `const ref = "${MODULE_PREFIX}assets/images/hero.png";`
  );
}

test("scan inventorie les images, l'audio et les références", async () => {
  await withTmpDir(async (root) => {
    await buildFixture(root);

    const result = await scan(root);

    assert.equal(result.images.length, 2);
    assert.equal(result.audio.length, 1);
    assert.equal(result.videos.length, 0);

    const hero = result.images.find((i) => i.assetPath === "assets/images/hero.png");
    assert.equal(hero.hasWebp, false);
    assert.equal(hero.profile, "default");

    const icon = result.images.find((i) => i.assetPath === "assets/images/icons/icon.png");
    assert.equal(icon.profile, "icon");
  });
});

test("scan signale les images disposant déjà d'un WebP", async () => {
  await withTmpDir(async (root) => {
    await buildFixture(root);
    await write(path.join(root, "assets/images/hero.webp"), "fake-webp");

    const result = await scan(root);

    const hero = result.images.find((i) => i.assetPath === "assets/images/hero.png");
    assert.equal(hero.hasWebp, true);
  });
});

test("scan relève les fichiers sources contenant des références PNG", async () => {
  await withTmpDir(async (root) => {
    await buildFixture(root);

    const result = await scan(root);
    const files = result.refs.map((r) => r.relativePath).sort();

    assert.ok(files.includes("compendiums/items/arme.yml"));
    assert.ok(files.includes("styles/warbound.css"));
    assert.ok(files.includes("scripts/warbound.mjs"));
    assert.ok(!files.includes("compendiums/items/invulnérable.yml"));
  });
});

test("scan exclut les fixtures de test de la migration", async () => {
  await withTmpDir(async (root) => {
    await buildFixture(root);

    const result = await scan(root);
    const files = result.refs.map((r) => r.relativePath);

    assert.ok(!files.some((f) => f.endsWith(".test.mjs")));
  });
});

test("scan ne remonte aucune référence pour un dépôt vide", async () => {
  await withTmpDir(async (root) => {
    const result = await scan(root);

    assert.equal(result.images.length, 0);
    assert.equal(result.audio.length, 0);
    assert.equal(result.refs.length, 0);
  });
});
