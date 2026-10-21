/**
 * Warbound — Media Report — tests
 *
 * Runner : `node --test src/tools/mediaReport.test.mjs`
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMediaReport,
  formatMediaReportSummary,
  indexRefsByAsset
} from "./mediaReport.mjs";

test("indexRefsByAsset indexe chaque asset par ses sources référentes", () => {
  const index = indexRefsByAsset([
    { relativePath: "compendiums/a.yml", assets: ["assets/x.png"] },
    { relativePath: "compendiums/b.yml", assets: ["assets/x.png", "assets/y.ogg"] }
  ]);

  assert.deepEqual(index.get("assets/x.png"), [
    "compendiums/a.yml",
    "compendiums/b.yml"
  ]);
  assert.deepEqual(index.get("assets/y.ogg"), ["compendiums/b.yml"]);
});

test("indexRefsByAsset déduplique les sources répétées", () => {
  const index = indexRefsByAsset([
    { relativePath: "compendiums/a.yml", assets: ["assets/x.png"] },
    { relativePath: "compendiums/a.yml", assets: ["assets/x.png"] }
  ]);

  assert.deepEqual(index.get("assets/x.png"), ["compendiums/a.yml"]);
});

test("buildMediaReport compte les PNG, WebP, OGG et vidéos", () => {
  const report = buildMediaReport(
    {
      images: [
        { assetPath: "assets/a.png", sizeBytes: 100, hasWebp: false, profile: "illustration" },
        { assetPath: "assets/b.png", sizeBytes: 200, hasWebp: true, profile: "token" }
      ],
      audio: [{ assetPath: "assets/sound.ogg", sizeBytes: 300 }],
      videos: [],
      webp: [{ assetPath: "assets/scenes/thumb-1.webp", sizeBytes: 50 }],
      refs: []
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" }
  );

  assert.equal(report.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(report.summary.png, 1, "1 PNG sans WebP");
  assert.equal(report.summary.webp, 2, "1 PNG converti + 1 WebP autonome");
  assert.equal(report.summary.webpStandalone, 1);
  assert.equal(report.summary.ogg, 1);
  assert.equal(report.summary.video, 0);
  assert.equal(report.summary.totalSizeBytes, 650);
  assert.equal(report.summary.referencedAssets, 0);
});

test("buildMediaReport classe les WebP sans PNG jumeau comme autonomes", () => {
  const report = buildMediaReport({
    images: [{ assetPath: "assets/from-png.png", sizeBytes: 10, hasWebp: true }],
    webp: [
      { assetPath: "assets/from-png.webp", sizeBytes: 5 },
      { assetPath: "assets/scenes/thumb-1.webp", sizeBytes: 7 }
    ],
    refs: []
  });

  assert.deepEqual(
    report.standaloneWebp.map((entry) => entry.assetPath),
    ["assets/scenes/thumb-1.webp"]
  );
  assert.equal(report.standaloneWebp[0].sizeBytes, 7);
});

test("buildMediaReport rattache les sources référentes à chaque asset", () => {
  const report = buildMediaReport({
    images: [{ assetPath: "assets/a.png", sizeBytes: 10, hasWebp: false }],
    audio: [{ assetPath: "assets/sound.ogg", sizeBytes: 20 }],
    webp: [],
    refs: [
      { relativePath: "compendiums/a.yml", assets: ["assets/a.png"] },
      { relativePath: "compendiums/b.yml", assets: ["assets/sound.ogg"] }
    ]
  });

  assert.deepEqual(report.images[0].referencedBy, ["compendiums/a.yml"]);
  assert.deepEqual(report.audio[0].referencedBy, ["compendiums/b.yml"]);
  assert.equal(report.summary.referencedAssets, 2);
});

test("buildMediaReport liste les actifs sans référence", () => {
  const report = buildMediaReport({
    images: [
      { assetPath: "assets/referenced.png", sizeBytes: 10, hasWebp: false },
      { assetPath: "assets/orphan.png", sizeBytes: 20, hasWebp: false }
    ],
    audio: [{ assetPath: "assets/sound.ogg", sizeBytes: 30 }],
    webp: [],
    refs: [{ relativePath: "compendiums/a.yml", assets: ["assets/referenced.png"] }]
  });

  assert.deepEqual(report.unreferenced, [
    "assets/orphan.png",
    "assets/sound.ogg"
  ]);
});

test("buildMediaReport trie les entrées par chemin d'asset", () => {
  const report = buildMediaReport({
    images: [
      { assetPath: "assets/zeta.png", sizeBytes: 1, hasWebp: false },
      { assetPath: "assets/alpha.png", sizeBytes: 1, hasWebp: false }
    ],
    refs: []
  });

  assert.deepEqual(
    report.images.map((entry) => entry.assetPath),
    ["assets/alpha.png", "assets/zeta.png"]
  );
});

test("buildMediaReport tolère une taille manquante", () => {
  const report = buildMediaReport({
    images: [{ assetPath: "assets/a.png", hasWebp: false }],
    refs: []
  });

  assert.equal(report.images[0].sizeBytes, null);
  assert.equal(report.summary.totalSizeBytes, 0);
});

test("formatMediaReportSummary produit les deux lignes de résumé", () => {
  const report = buildMediaReport({
    images: [{ assetPath: "assets/a.png", sizeBytes: 1024 * 1024, hasWebp: false }],
    audio: [],
    webp: [],
    refs: []
  });

  const lines = formatMediaReportSummary(report);

  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("PNG: 1"));
  assert.ok(lines[0].includes("OGG: 0"));
  assert.ok(lines[1].includes("1.0 MB"));
  assert.ok(lines[1].includes("sans référence dans les sources : 1"));
});
