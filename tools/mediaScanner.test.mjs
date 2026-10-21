import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { scan } from "./mediaScanner.mjs";

// Construit une arborescence temporaire pour les tests
async function buildFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wb-scan-test-"));

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content ?? "", "utf8");
  }

  return root;
}

async function removeFixture(root) {
  await fs.rm(root, { recursive: true, force: true });
}

test("scan() retourne les champs attendus", async () => {
  const root = await buildFixture({
    "assets/images/hero.png": "",
    "assets/sounds/ambient.ogg": "",
    "compendiums/actors_Warrior_abc.yml": `img: modules/warbound-campaign-content/assets/images/hero.png`
  });

  try {
    const result = await scan(root);

    assert.ok(Array.isArray(result.images), "images doit être un tableau");
    assert.ok(Array.isArray(result.audio), "audio doit être un tableau");
    assert.ok(Array.isArray(result.videos), "videos doit être un tableau");
    assert.ok(Array.isArray(result.webp), "webp doit être un tableau");
    assert.ok(Array.isArray(result.sources), "sources doit être un tableau");
    assert.ok(Array.isArray(result.refs), "refs doit être un tableau");
    assert.ok(result.assets instanceof Set, "assets doit être un Set");
  } finally {
    await removeFixture(root);
  }
});

test("scan() détecte les PNG sans WebP correspondant", async () => {
  const root = await buildFixture({
    "assets/images/only-png.png": "",
    "assets/images/has-webp.png": "",
    "assets/images/has-webp.webp": ""
  });

  try {
    const { images } = await scan(root);

    const onlyPng = images.find((i) => i.assetPath.includes("only-png.png"));
    const hasWebp = images.find((i) => i.assetPath.includes("has-webp.png"));

    assert.ok(onlyPng, "only-png.png doit être dans images");
    assert.equal(onlyPng.hasWebp, false, "only-png.png ne doit pas avoir de WebP");

    assert.ok(hasWebp, "has-webp.png doit être dans images");
    assert.equal(hasWebp.hasWebp, true, "has-webp.png doit avoir un WebP");
  } finally {
    await removeFixture(root);
  }
});

test("scan() remonte les références YAML vers les PNG", async () => {
  const root = await buildFixture({
    "assets/images/hero.png": "",
    "compendiums/actors_Hero_001.yml": "img: modules/warbound-campaign-content/assets/images/hero.png\nname: Hero"
  });

  try {
    const { refs } = await scan(root);

    assert.ok(refs.length > 0, "au moins une référence doit être trouvée");
    const ref = refs[0];
    assert.ok(ref.assets.some((a) => a.includes("hero.png")), "la ref doit pointer vers hero.png");
  } finally {
    await removeFixture(root);
  }
});

test("scan() remonte les références YAML vers les OGG", async () => {
  const root = await buildFixture({
    "assets/musics/ambiance.ogg": "",
    "compendiums/playlists_Ambiance_001.yml":
      "sounds:\n  - path: modules/warbound-campaign-content/assets/musics/ambiance.ogg\n"
  });

  try {
    const { refs } = await scan(root);

    const referenced = refs.flatMap((r) => r.assets);

    assert.ok(
      referenced.includes("assets/musics/ambiance.ogg"),
      "l'OGG doit être attribué à sa playlist"
    );
  } finally {
    await removeFixture(root);
  }
});

test("scan() remonte les références YAML vers les WebP existants", async () => {
  const root = await buildFixture({
    "assets/scenes/thumb-abc.webp": "",
    "compendiums/scenes_Accueil_001.yml":
      "thumb: modules/warbound-campaign-content/assets/scenes/thumb-abc.webp\n"
  });

  try {
    const { webp, refs } = await scan(root);

    assert.equal(webp.length, 1, "le WebP doit être inventorié");
    assert.ok(
      refs.flatMap((r) => r.assets).includes("assets/scenes/thumb-abc.webp"),
      "le WebP doit être attribué à sa scène"
    );
  } finally {
    await removeFixture(root);
  }
});

test("scan() distingue les WebP autonomes de ceux adossés à un PNG", async () => {
  const root = await buildFixture({
    "assets/images/from-png.png": "",
    "assets/images/from-png.webp": "",
    "assets/scenes/thumb-abc.webp": ""
  });

  try {
    const { images, webp } = await scan(root);

    const pngAssetPaths = new Set(images.map((i) => i.assetPath));
    const standalone = webp.filter(
      (w) => !pngAssetPaths.has(w.assetPath.replace(/\.webp$/i, ".png"))
    );

    assert.equal(webp.length, 2, "2 WebP inventoriés");
    assert.deepEqual(
      standalone.map((w) => w.assetPath),
      ["assets/scenes/thumb-abc.webp"],
      "seul le thumbnail est autonome"
    );
  } finally {
    await removeFixture(root);
  }
});

test("scan() ne modifie aucun fichier (dry-run)", async () => {
  const pngContent = "fake-png-data";
  const root = await buildFixture({
    "assets/images/test.png": pngContent,
    "compendiums/actors_Test_001.yml": "img: modules/warbound-campaign-content/assets/images/test.png"
  });

  try {
    await scan(root);

    const pngPath = path.join(root, "assets/images/test.png");
    const content = await fs.readFile(pngPath, "utf8");
    assert.equal(content, pngContent, "le PNG ne doit pas être modifié");

    const ymlPath = path.join(root, "compendiums/actors_Test_001.yml");
    const ymlContent = await fs.readFile(ymlPath, "utf8");
    assert.ok(ymlContent.includes("test.png"), "le YAML ne doit pas être modifié");
  } finally {
    await removeFixture(root);
  }
});

test("summary: png exclut les PNG avec WebP, webp les compte", async () => {
  const root = await buildFixture({
    "assets/images/a.png": "",
    "assets/images/b.png": "",
    "assets/images/b.webp": "",
    "assets/sounds/track.ogg": ""
  });

  try {
    const { images, audio } = await scan(root);

    const pngCount = images.filter((i) => !i.hasWebp).length;
    const webpCount = images.filter((i) => i.hasWebp).length;

    assert.equal(pngCount, 1, "1 PNG sans WebP");
    assert.equal(webpCount, 1, "1 PNG avec WebP");
    assert.equal(audio.length, 1, "1 OGG");
  } finally {
    await removeFixture(root);
  }
});
