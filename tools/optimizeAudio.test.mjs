import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import { detectEncoders, ffmpegAvailable, probeMedia, run } from "./optimizeAudio.mjs";
import { AUDIO_CONFIG, AUDIO_PROFILES } from "./media.config.mjs";
import { selectAudioProfile } from "../src/tools/mediaAudio.mjs";

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      resolve({ code, stderr });
    });
  });
}

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-audio-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

const hasFfmpeg = await ffmpegAvailable();

async function createOgg(filePath, encoder) {
  const args = [
    "-v", "error",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=10:sample_rate=48000",
    "-ac", "2",
    "-c:a", encoder.name
  ];

  if (encoder.experimental) args.push("-strict", "-2");

  args.push("-b:a", "160k", "-y", filePath);

  const { code, stderr } = await exec("ffmpeg", args);

  assert.equal(code, 0, `ffmpeg a échoué : ${stderr}`);
}

test(
  "probeMedia lit le codec, le bitrate et la balise d'optimisation",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const encoders = await detectEncoders();
      const encoder =
        encoders.get("libopus") ? { name: "libopus", experimental: false } :
        encoders.get("opus") ? { name: "opus", experimental: true } :
        null;

      assert.ok(encoder, "aucun encodeur Opus disponible");

      const filePath = path.join(dir, "ambiance.ogg");
      await createOgg(filePath, encoder);

      const probe = await probeMedia(filePath);

      assert.equal(probe.codec, "opus");
      assert.ok(probe.bitrate > 0);
      assert.ok(probe.duration > 4);
      assert.equal(probe.marker, null);
    });
  }
);

test(
  "run ré-encode un fichier au-dessus de la cible puis est idempotent",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const encoders = await detectEncoders();
      const encoder =
        encoders.get("libopus") ? { name: "libopus", experimental: false } :
        encoders.get("opus") ? { name: "opus", experimental: true } :
        null;

      assert.ok(encoder, "aucun encodeur Opus disponible");

      const filePath = path.join(dir, "ambiance.ogg");
      await createOgg(filePath, encoder);

      const audio = [{ assetPath: "assets/ambiance.ogg", filePath }];

      const before = await probeMedia(filePath);

      const first = await run(audio, true);

      assert.equal(first.errors.length, 0);
      assert.equal(first.optimized, 1);
      assert.equal(first.skipped, 0);

      const after = await probeMedia(filePath);
      const expectedProfile = selectAudioProfile("assets/ambiance.ogg", AUDIO_PROFILES);
      assert.equal(
        after.marker,
        `${AUDIO_CONFIG.markerPrefix}:${expectedProfile.bitrate}`
      );
      assert.ok(
        after.bitrate < before.bitrate,
        `le bitrate devrait diminuer (${before.bitrate} → ${after.bitrate})`
      );

      const second = await run(audio, true);

      assert.equal(second.errors.length, 0);
      assert.equal(second.optimized, 0);
      assert.equal(second.skipped, 1);
    });
  }
);

test(
  "run applique le profil ambient (128k) pour un chemin assets/musics/ambient/",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const encoders = await detectEncoders();
      const encoder =
        encoders.get("libopus") ? { name: "libopus", experimental: false } :
        encoders.get("opus") ? { name: "opus", experimental: true } :
        null;

      assert.ok(encoder, "aucun encodeur Opus disponible");

      const filePath = path.join(dir, "rain.ogg");
      await createOgg(filePath, encoder);

      const audio = [{ assetPath: "assets/musics/ambient/rain.ogg", filePath }];

      const result = await run(audio, true);

      assert.equal(result.errors.length, 0);
      assert.equal(result.optimized, 1);

      const after = await probeMedia(filePath);
      assert.equal(
        after.marker,
        `${AUDIO_CONFIG.markerPrefix}:128k`
      );
    });
  }
);

test(
  "run ne modifie aucun fichier en mode dry-run",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const encoders = await detectEncoders();
      const encoder =
        encoders.get("libopus") ? { name: "libopus", experimental: false } :
        encoders.get("opus") ? { name: "opus", experimental: true } :
        null;

      assert.ok(encoder, "aucun encodeur Opus disponible");

      const filePath = path.join(dir, "ambiance.ogg");
      await createOgg(filePath, encoder);

      const before = await fs.readFile(filePath);

      const result = await run(
        [{ assetPath: "assets/ambiance.ogg", filePath }],
        false
      );

      assert.equal(result.optimized, 1);
      assert.equal(result.errors.length, 0);

      assert.deepEqual(await fs.readFile(filePath), before);
    });
  }
);
