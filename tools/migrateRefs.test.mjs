import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { run, parseArgs } from "./migrateRefs.mjs";

const PREFIX = "modules/warbound-campaign-content/";
const ROOT = "/repo";

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-migrate-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function toRef(filePath) {
  return {
    filePath,
    fileDir: path.dirname(filePath),
    relativePath: path.basename(filePath)
  };
}

test("run migre les refs .png → .webp en mode write", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "test.yml");
    const content = `img: ${PREFIX}assets/hero.png\ntoken: ${PREFIX}assets/token.png`;
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], true, { root: dir });

    assert.equal(result.migrated, 1);
    assert.equal(result.replacements, 2);
    assert.equal(result.errors.length, 0);

    const updated = await fs.readFile(yamlPath, "utf8");
    assert.ok(updated.includes(`${PREFIX}assets/hero.webp`));
    assert.ok(updated.includes(`${PREFIX}assets/token.webp`));
    assert.ok(!updated.includes(".png"));
  });
});

test("run migre les refs vidéo .mp4/.mov → .webm", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "scene.yml");
    const content = [
      `intro: ${PREFIX}assets/intro.mp4`,
      `outro: ${PREFIX}assets/outro.mov`,
      `external: https://example.test/remote.mp4`
    ].join("\n");
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], true, {
      root: dir,
      extensions: [".mp4", ".mov"],
      targetExtension: ".webm",
      migratableAssets: new Set(["assets/intro.mp4", "assets/outro.mov"])
    });

    assert.equal(result.replacements, 2);
    const updated = await fs.readFile(yamlPath, "utf8");
    assert.ok(updated.includes("assets/intro.webm"));
    assert.ok(updated.includes("assets/outro.webm"));
    assert.ok(updated.includes("remote.mp4"));
  });
});

test("run est idempotent (refs déjà .webp → skipped)", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "test.yml");
    const content = `img: ${PREFIX}assets/hero.webp`;
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], true, { root: dir });

    assert.equal(result.skipped, 1);
    assert.equal(result.migrated, 0);
    assert.equal(result.replacements, 0);

    assert.equal(await fs.readFile(yamlPath, "utf8"), content);
  });
});

test("run ne modifie aucun fichier en mode dry-run", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "test.yml");
    const content = `img: ${PREFIX}assets/hero.png`;
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], false, { root: dir });

    assert.equal(result.migrated, 1);
    assert.equal(result.replacements, 1);

    assert.equal(await fs.readFile(yamlPath, "utf8"), content);
  });
});

test("run migre une référence relative de feuille de style", async () => {
  await withTmpDir(async (dir) => {
    const stylesDir = path.join(dir, "styles");
    await fs.mkdir(stylesDir, { recursive: true });

    const cssPath = path.join(stylesDir, "warbound.css");
    const content = 'body { background: url("../assets/ui/paper.png"); }';
    await fs.writeFile(cssPath, content, "utf8");

    const result = await run([toRef(cssPath)], true, { root: dir });

    assert.equal(result.migrated, 1);
    assert.equal(result.replacements, 1);

    const updated = await fs.readFile(cssPath, "utf8");
    assert.ok(updated.includes('url("../assets/ui/paper.webp")'));
  });
});

test("run migre une référence de template littéral JS", async () => {
  await withTmpDir(async (dir) => {
    const jsPath = path.join(dir, "warbound.mjs");
    const content = "logo: `modules/${MODULE_ID}/assets/ui/logo.png`";
    await fs.writeFile(jsPath, content, "utf8");

    const result = await run([toRef(jsPath)], true, { root: dir });

    assert.equal(result.migrated, 1);

    const updated = await fs.readFile(jsPath, "utf8");
    assert.ok(updated.includes("assets/ui/logo.webp"));
  });
});

test("run ignore les assets absents de migratableAssets", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "test.yml");
    const content = `img: ${PREFIX}assets/hero.png`;
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], true, {
      root: dir,
      migratableAssets: new Set(["assets/autre.png"])
    });

    assert.equal(result.migrated, 0);
    assert.equal(await fs.readFile(yamlPath, "utf8"), content);
  });
});

test("run migre les champs YAML et le HTML uniquement pour les assets de la table", async () => {
  await withTmpDir(async (dir) => {
    const yamlPath = path.join(dir, "journal.yml");
    const content = [
      `img: ${PREFIX}assets/hero.png`,
      `prototypeToken:\n  texture:\n    src: ${PREFIX}assets/token.png`,
      `background:\n  src: ${PREFIX}assets/map.png`,
      `path: ${PREFIX}assets/audio.png`,
      `thumb: ${PREFIX}assets/thumb.png`,
      `text: '<img src="${PREFIX}assets/portrait.png"><video src="${PREFIX}assets/cinematic.png">'`,
      `other: ${PREFIX}assets/not-in-table.png`
    ].join("\n");
    await fs.writeFile(yamlPath, content, "utf8");

    const result = await run([toRef(yamlPath)], true, {
      root: dir,
      migratableAssets: new Set([
        "assets/hero.png",
        "assets/token.png",
        "assets/map.png",
        "assets/audio.png",
        "assets/thumb.png",
        "assets/portrait.png",
        "assets/cinematic.png"
      ])
    });

    assert.equal(result.replacements, 7);

    const updated = await fs.readFile(yamlPath, "utf8");
    assert.ok(updated.includes("assets/hero.webp"));
    assert.ok(updated.includes("assets/token.webp"));
    assert.ok(updated.includes("assets/map.webp"));
    assert.ok(updated.includes("assets/audio.webp"));
    assert.ok(updated.includes("assets/thumb.webp"));
    assert.ok(updated.includes("assets/portrait.webp"));
    assert.ok(updated.includes("assets/cinematic.webp"));
    assert.ok(updated.includes("assets/not-in-table.png"));
  });
});

test("run retourne errors si la lecture échoue", async () => {
  const result = await run(
    [toRef("/nonexistent/path/test.yml")],
    true,
    { root: ROOT }
  );

  assert.equal(result.errors.length, 1);
});

test("parseArgs retourne write=false par défaut", () => {
  const result = parseArgs([]);

  assert.equal(result.write, false);
  assert.equal(result.help, false);
  assert.equal(result.error, null);
});

test("parseArgs reconnaît --write", () => {
  const result = parseArgs(["--write"]);

  assert.equal(result.write, true);
  assert.equal(result.error, null);
});

test("parseArgs reconnaît --dry-run", () => {
  const result = parseArgs(["--dry-run"]);

  assert.equal(result.write, false);
  assert.equal(result.error, null);
});

test("parseArgs reconnaît --help", () => {
  const result = parseArgs(["--help"]);

  assert.equal(result.help, true);
  assert.equal(result.error, null);
});

test("parseArgs reconnaît -h", () => {
  const result = parseArgs(["-h"]);

  assert.equal(result.help, true);
});

test("parseArgs retourne error sur option inconnue", () => {
  const result = parseArgs(["--unknown"]);

  assert.ok(result.error !== null);
  assert.ok(result.error.includes("--unknown"));
});
