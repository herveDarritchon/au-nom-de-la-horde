import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import { ffmpegAvailable, probeMedia, run } from "./convertVideos.mjs";
import { VIDEO_CONFIG, VIDEO_PROFILES } from "./media.config.mjs";
import { selectVideoProfile, buildVideoMarker } from "../src/tools/mediaVideo.mjs";

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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wb-video-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

const hasFfmpeg = await ffmpegAvailable();

/**
 * Crée un fichier MP4 de test via FFmpeg (vidéo de synthèse, 3 secondes).
 * @param {string} filePath
 */
async function createMp4(filePath) {
  const args = [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=blue:s=320x240:d=3:r=25",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-y", filePath
  ];

  const { code, stderr } = await exec("ffmpeg", args);

  assert.equal(code, 0, `ffmpeg a échoué lors de la création du MP4 : ${stderr}`);
}

// ─── Tests sans FFmpeg ───────────────────────────────────────────────────────

test("run avec 0 vidéo retourne des compteurs nuls et aucune erreur", async () => {
  const result = await run([], false);

  assert.equal(result.converted, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.savedBytes, 0);
  assert.equal(result.errors.length, 0);
});

test("run avec uniquement des WebM retourne converted=0 et skipped=N", async () => {
  const videos = [
    { assetPath: "assets/videos/intro.webm", filePath: "/fake/intro.webm" },
    { assetPath: "assets/videos/outro.webm", filePath: "/fake/outro.webm" }
  ];

  const result = await run(videos, false);

  assert.equal(result.converted, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.errors.length, 0);
});

// ─── Tests avec FFmpeg ───────────────────────────────────────────────────────

test(
  "probeMedia lit le codec, le bitrate et la durée d'un MP4",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const filePath = path.join(dir, "test.mp4");
      await createMp4(filePath);

      const probe = await probeMedia(filePath);

      assert.equal(probe.codec, "h264");
      assert.ok(probe.duration > 0, "la durée doit être positive");
      assert.equal(probe.marker, null);
    });
  }
);

test(
  "run convertit un MP4 en WebM VP9 et est idempotent",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const mp4Path = path.join(dir, "assets/videos/scenes/test.mp4");
      await fs.mkdir(path.dirname(mp4Path), { recursive: true });
      await createMp4(mp4Path);

      const assetPath = "assets/videos/scenes/test.mp4";
      const videos = [{ assetPath, filePath: mp4Path }];
      const webmPath = mp4Path.replace(/\.mp4$/i, ".webm");

      const first = await run(videos, true);

      assert.equal(first.errors.length, 0, `Erreurs inattendues : ${JSON.stringify(first.errors)}`);
      assert.equal(first.converted, 1);
      assert.equal(first.skipped, 0);

      const probe = await probeMedia(webmPath);
      assert.equal(probe.codec, "vp9");

      const expectedProfile = selectVideoProfile(assetPath, VIDEO_PROFILES);
      const expectedMarker = buildVideoMarker(VIDEO_CONFIG.markerPrefix, expectedProfile.crf);
      assert.equal(probe.marker, expectedMarker);

      const second = await run(videos, true);

      assert.equal(second.errors.length, 0);
      assert.equal(second.converted, 0);
      assert.equal(second.skipped, 1);
    });
  }
);

test(
  "run dry-run recense les candidats sans créer de WebM",
  { skip: hasFfmpeg ? false : "FFmpeg indisponible" },
  async () => {
    await withTmpDir(async (dir) => {
      const mp4Path = path.join(dir, "assets/videos/tokens/goblin.mp4");
      await fs.mkdir(path.dirname(mp4Path), { recursive: true });
      await createMp4(mp4Path);

      const videos = [{ assetPath: "assets/videos/tokens/goblin.mp4", filePath: mp4Path }];
      const webmPath = mp4Path.replace(/\.mp4$/i, ".webm");

      const result = await run(videos, false);

      assert.equal(result.converted, 1);
      assert.equal(result.skipped, 0);
      assert.equal(result.errors.length, 0);

      let webmExists = false;
      try {
        await fs.access(webmPath);
        webmExists = true;
      } catch { /* attendu */ }

      assert.equal(webmExists, false, "le WebM ne doit pas être créé en dry-run");
    });
  }
);
