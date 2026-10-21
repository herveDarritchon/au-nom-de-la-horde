import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_VERSION,
  SKIP_REASONS,
  buildManifestEntry,
  hashBuffer,
  isUpToDate,
  mergeManifest,
  normalizeSettings,
  settingsSignature
} from "./conversionManifest.mjs";

const SETTINGS = { profile: "icon", quality: null, lossless: true, effort: 4 };

// settingsSignature

test("settingsSignature distingue qualité, mode et effort", () => {
  const base = settingsSignature(SETTINGS);

  assert.notEqual(base, settingsSignature({ ...SETTINGS, quality: 90 }));
  assert.notEqual(base, settingsSignature({ ...SETTINGS, lossless: false }));
  assert.notEqual(base, settingsSignature({ ...SETTINGS, effort: 6 }));
  assert.notEqual(base, settingsSignature({ ...SETTINGS, profile: "token" }));
});

test("settingsSignature est stable pour des réglages équivalents", () => {
  assert.equal(
    settingsSignature({ ...SETTINGS, quality: undefined }),
    settingsSignature(SETTINGS)
  );
});

test("normalizeSettings complète les valeurs manquantes", () => {
  assert.deepEqual(
    normalizeSettings({ profile: "default", quality: 85, lossless: false }),
    { profile: "default", quality: 85, lossless: false, effort: 4 }
  );
});

// buildManifestEntry

test("buildManifestEntry porte les réglages, la source et les tailles", () => {
  const entry = buildManifestEntry({
    assetPath: "assets/images/icons/soin.png",
    settings: SETTINGS,
    sourceHash: "abcdef0123456789",
    pngBytes: 100,
    webpBytes: 40,
    reason: SKIP_REASONS.CONVERTED
  });

  assert.equal(entry.assetPath, "assets/images/icons/soin.png");
  assert.equal(entry.profile, "icon");
  assert.equal(entry.settings.effort, 4);
  assert.equal(entry.signature, settingsSignature(SETTINGS));
  assert.equal(entry.sourceHash, "abcdef0123456789");
  assert.equal(entry.pngBytes, 100);
  assert.equal(entry.webpBytes, 40);
  assert.equal(entry.reason, SKIP_REASONS.CONVERTED);
  assert.ok(entry.convertedAt);
});

// isUpToDate

test("isUpToDate est vrai à réglages et source identiques", () => {
  const entry = buildManifestEntry({
    assetPath: "assets/x.png",
    settings: SETTINGS,
    sourceHash: "hash-1",
    pngBytes: 1,
    webpBytes: 1,
    reason: SKIP_REASONS.CONVERTED
  });

  assert.equal(isUpToDate(entry, SETTINGS, "hash-1"), true);
});

test("isUpToDate est faux si les réglages ont changé", () => {
  const entry = buildManifestEntry({
    assetPath: "assets/x.png",
    settings: SETTINGS,
    sourceHash: "hash-1",
    pngBytes: 1,
    webpBytes: 1,
    reason: SKIP_REASONS.CONVERTED
  });

  assert.equal(isUpToDate(entry, { ...SETTINGS, effort: 6 }, "hash-1"), false);
  assert.equal(isUpToDate(entry, { ...SETTINGS, quality: 90 }, "hash-1"), false);
});

test("isUpToDate est faux si la source a changé", () => {
  const entry = buildManifestEntry({
    assetPath: "assets/x.png",
    settings: SETTINGS,
    sourceHash: "hash-1",
    pngBytes: 1,
    webpBytes: 1,
    reason: SKIP_REASONS.CONVERTED
  });

  assert.equal(isUpToDate(entry, SETTINGS, "hash-2"), false);
});

test("isUpToDate est faux sans entrée de manifeste", () => {
  assert.equal(isUpToDate(null, SETTINGS, "hash-1"), false);
});

test("isUpToDate reste vrai sans empreinte de source", () => {
  const entry = buildManifestEntry({
    assetPath: "assets/x.png",
    settings: SETTINGS,
    sourceHash: null,
    pngBytes: 1,
    webpBytes: 1,
    reason: SKIP_REASONS.CONVERTED
  });

  assert.equal(isUpToDate(entry, SETTINGS, null), true);
});

// mergeManifest

test("mergeManifest crée un manifeste versionné", () => {
  const manifest = mergeManifest(null, [], { module: "warbound-campaign-content" });

  assert.equal(manifest.version, MANIFEST_VERSION);
  assert.equal(manifest.module, "warbound-campaign-content");
  assert.deepEqual(manifest.assets, {});
  assert.ok(manifest.generatedAt);
});

test("mergeManifest conserve les entrées précédentes", () => {
  const previous = mergeManifest(null, [
    buildManifestEntry({
      assetPath: "assets/a.png",
      settings: SETTINGS,
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 1,
      reason: SKIP_REASONS.CONVERTED
    })
  ]);

  const merged = mergeManifest(previous, [
    buildManifestEntry({
      assetPath: "assets/b.png",
      settings: SETTINGS,
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 1,
      reason: SKIP_REASONS.CONVERTED
    })
  ]);

  assert.deepEqual(Object.keys(merged.assets).sort(), ["assets/a.png", "assets/b.png"]);
});

test("mergeManifest remplace l'entrée d'un asset retraité", () => {
  const previous = mergeManifest(null, [
    buildManifestEntry({
      assetPath: "assets/a.png",
      settings: SETTINGS,
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 1,
      reason: SKIP_REASONS.CONVERTED
    })
  ]);

  const merged = mergeManifest(previous, [
    buildManifestEntry({
      assetPath: "assets/a.png",
      settings: { ...SETTINGS, effort: 6 },
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 2,
      reason: SKIP_REASONS.REENCODED
    })
  ]);

  assert.equal(Object.keys(merged.assets).length, 1);
  assert.equal(merged.assets["assets/a.png"].reason, SKIP_REASONS.REENCODED);
  assert.equal(merged.assets["assets/a.png"].settings.effort, 6);
});

test("mergeManifest élague les assets disparus quand pruneTo est fourni", () => {
  const previous = mergeManifest(null, [
    buildManifestEntry({
      assetPath: "assets/a.png",
      settings: SETTINGS,
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 1,
      reason: SKIP_REASONS.CONVERTED
    }),
    buildManifestEntry({
      assetPath: "assets/b.png",
      settings: SETTINGS,
      sourceHash: "h",
      pngBytes: 1,
      webpBytes: 1,
      reason: SKIP_REASONS.CONVERTED
    })
  ]);

  const merged = mergeManifest(previous, [], { pruneTo: new Set(["assets/a.png"]) });

  assert.deepEqual(Object.keys(merged.assets), ["assets/a.png"]);
});

// hashBuffer

test("hashBuffer est stable et distingue deux contenus", () => {
  const a = hashBuffer(Buffer.from("contenu"));
  const b = hashBuffer(Buffer.from("contenu"));
  const c = hashBuffer(Buffer.from("autre"));

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 16);
});
