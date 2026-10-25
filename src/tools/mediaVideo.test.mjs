import { test } from "node:test";
import assert from "node:assert/strict";

import { buildVideoMarker, selectVideoProfile, shouldConvertVideo } from "./mediaVideo.mjs";

// selectVideoProfile

const TEST_PROFILES = [
  { profile: "scene",   match: /^assets\/videos\/scenes\//, crf: 28, tileColumns: 2, threads: 4 },
  { profile: "token",   match: /^assets\/videos\/tokens\//, crf: 33, tileColumns: 1, threads: 2 },
  { profile: "default", match: /^/,                         crf: 33, tileColumns: 1, threads: 2 }
];

test("selectVideoProfile retourne le profil scene pour un chemin scenes/", () => {
  const profile = selectVideoProfile("assets/videos/scenes/intro.mp4", TEST_PROFILES);

  assert.equal(profile.profile, "scene");
  assert.equal(profile.crf, 28);
});

test("selectVideoProfile retourne le profil token pour un chemin tokens/", () => {
  const profile = selectVideoProfile("assets/videos/tokens/goblin.mov", TEST_PROFILES);

  assert.equal(profile.profile, "token");
  assert.equal(profile.crf, 33);
});

test("selectVideoProfile retourne le profil default pour un chemin inconnu", () => {
  const profile = selectVideoProfile("assets/videos/cutscene.mp4", TEST_PROFILES);

  assert.equal(profile.profile, "default");
  assert.equal(profile.crf, 33);
});

test("selectVideoProfile retourne le dernier profil si aucun ne correspond (sans default /^/)", () => {
  const profiles = [
    { profile: "scene", match: /^assets\/videos\/scenes\//, crf: 28, tileColumns: 2, threads: 4 },
    { profile: "token", match: /^assets\/videos\/tokens\//, crf: 33, tileColumns: 1, threads: 2 }
  ];
  const profile = selectVideoProfile("assets/videos/other.mp4", profiles);

  assert.equal(profile.profile, "token");
});

// shouldConvertVideo

test("shouldConvertVideo retourne true pour un fichier .mp4", () => {
  assert.equal(shouldConvertVideo("assets/videos/intro.mp4"), true);
});

test("shouldConvertVideo retourne true pour un fichier .mov", () => {
  assert.equal(shouldConvertVideo("assets/videos/capture.mov"), true);
});

test("shouldConvertVideo retourne true pour une extension en majuscules (.MP4)", () => {
  assert.equal(shouldConvertVideo("assets/videos/INTRO.MP4"), true);
});

test("shouldConvertVideo retourne false pour un fichier .webm (déjà cible)", () => {
  assert.equal(shouldConvertVideo("assets/videos/intro.webm"), false);
});

test("shouldConvertVideo retourne false pour un fichier .m4v (hors périmètre)", () => {
  assert.equal(shouldConvertVideo("assets/videos/intro.m4v"), false);
});

test("shouldConvertVideo retourne false pour un fichier audio .ogg", () => {
  assert.equal(shouldConvertVideo("assets/musics/ambient/rain.ogg"), false);
});

// buildVideoMarker

test("buildVideoMarker compose la balise VP9 avec le CRF", () => {
  assert.equal(
    buildVideoMarker("warbound-media-optimize", 28),
    "warbound-media-optimize:vp9:28"
  );
});

test("buildVideoMarker compose la balise VP9 avec un CRF différent", () => {
  assert.equal(
    buildVideoMarker("warbound-media-optimize", 33),
    "warbound-media-optimize:vp9:33"
  );
});
