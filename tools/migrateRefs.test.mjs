import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { run } from "./migrateRefs.mjs";

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

test("run retourne errors si la lecture échoue", async () => {
  const result = await run(
    [toRef("/nonexistent/path/test.yml")],
    true,
    { root: ROOT }
  );

  assert.equal(result.errors.length, 1);
});
