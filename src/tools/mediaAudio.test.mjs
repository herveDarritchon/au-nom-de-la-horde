import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAudioMarker,
  parseBitrate,
  parseEncoders,
  selectEncoder,
  shouldOptimizeAudio
} from "./mediaAudio.mjs";

// parseBitrate

test("parseBitrate convertit une chaîne avec suffixe k", () => {
  assert.equal(parseBitrate("96k"), 96000);
});

test("parseBitrate convertit une chaîne avec suffixe m", () => {
  assert.equal(parseBitrate("1.5M"), 1500000);
});

test("parseBitrate accepte une chaîne sans suffixe", () => {
  assert.equal(parseBitrate("128000"), 128000);
});

test("parseBitrate accepte un nombre", () => {
  assert.equal(parseBitrate(96000), 96000);
});

test("parseBitrate renvoie null sur une valeur invalide", () => {
  assert.equal(parseBitrate("beaucoup"), null);
});

// parseEncoders

const ENCODERS_OUTPUT = `
 Encoders:
 V..... = Video
 A..... = Audio
 A..X.D = Audio (experimental)
 ------
 A....D libopus            libopus Opus (codec opus)
 A..X.D opus               Opus
 A....D libvorbis          libvorbis
 A..X.D vorbis             Vorbis
`;

test("parseEncoders liste les encodeurs avec leur état expérimental", () => {
  const encoders = parseEncoders(ENCODERS_OUTPUT);

  assert.equal(encoders.size, 4);
  assert.equal(encoders.get("libopus").experimental, false);
  assert.equal(encoders.get("opus").experimental, true);
  assert.equal(encoders.get("libvorbis").experimental, false);
  assert.equal(encoders.get("vorbis").experimental, true);
});

test("parseEncoders renvoie une table vide sur une sortie vide", () => {
  assert.equal(parseEncoders("").size, 0);
});

// selectEncoder

test("selectEncoder privilégie le premier candidat disponible", () => {
  const encoders = parseEncoders(ENCODERS_OUTPUT);

  assert.deepEqual(selectEncoder(encoders, "opus", ["libopus", "opus"]), {
    name: "libopus",
    experimental: false
  });
});

test("selectEncoder se replie sur le candidat suivant", () => {
  const encoders = parseEncoders(ENCODERS_OUTPUT);

  assert.deepEqual(selectEncoder(encoders, "opus", ["absent", "opus"]), {
    name: "opus",
    experimental: true
  });
});

test("selectEncoder renvoie null si aucun encodeur n'est disponible", () => {
  const encoders = parseEncoders(ENCODERS_OUTPUT);

  assert.equal(selectEncoder(encoders, "opus", ["absent"]), null);
});

// buildAudioMarker

test("buildAudioMarker compose la balise d'optimisation", () => {
  assert.equal(
    buildAudioMarker("warbound-media-optimize", "96k"),
    "warbound-media-optimize:96k"
  );
});

// shouldOptimizeAudio

const BASE_STATE = {
  currentBitrate: 134719,
  currentMarker: null,
  targetBitrate: 96000,
  targetLabel: "96k",
  markerPrefix: "warbound-media-optimize"
};

test("shouldOptimizeAudio ré-encode un fichier au-dessus de la cible", () => {
  assert.equal(shouldOptimizeAudio(BASE_STATE), true);
});

test("shouldOptimizeAudio ignore un fichier déjà marqué à la cible", () => {
  assert.equal(
    shouldOptimizeAudio({
      ...BASE_STATE,
      currentMarker: "warbound-media-optimize:96k"
    }),
    false
  );
});

test("shouldOptimizeAudio ré-encode un fichier marqué pour une autre cible", () => {
  assert.equal(
    shouldOptimizeAudio({
      ...BASE_STATE,
      currentMarker: "warbound-media-optimize:128k"
    }),
    true
  );
});

test("shouldOptimizeAudio ignore un fichier déjà plus efficace que la cible", () => {
  assert.equal(
    shouldOptimizeAudio({ ...BASE_STATE, currentBitrate: 80000 }),
    false
  );
});

test("shouldOptimizeAudio ré-encode un fichier de bitrate inconnu", () => {
  assert.equal(
    shouldOptimizeAudio({ ...BASE_STATE, currentBitrate: null }),
    true
  );
});
