import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyPath } from "./assetPolicy.mjs";

const config = {
  modulePrefix: "modules/warbound-campaign-content/",
  systemPrefix: "systems/co2/",
  excludedPatterns: [/^worlds\/[^/]+\/vaults-cache\//]
};

test("classifyPath bloque une référence worlds/", () => {
  const result = classifyPath("worlds/my-world/assets/img.webp", config);
  assert.equal(result.type, "WORLD_REFERENCE");
  assert.equal(result.verdict, "error");
});

test("classifyPath exclut une référence worlds/ matchant un pattern d'exclusion", () => {
  const result = classifyPath("worlds/my-world/vaults-cache/img.webp", config);
  assert.equal(result.type, "EXCLUDED");
  assert.equal(result.verdict, "ok");
});

test("classifyPath accepte une référence vers le module propre et délègue la vérification de fichier", () => {
  const result = classifyPath("modules/warbound-campaign-content/assets/img.webp", config);
  assert.equal(result.type, "MODULE");
  assert.equal(result.verdict, "ok");
  assert.equal(result.requiresFileCheck, true);
});

test("classifyPath accepte avec warning une référence vers un autre module", () => {
  const result = classifyPath("modules/other-module/img.webp", config);
  assert.equal(result.type, "EXTERNAL_MODULE_REFERENCE");
  assert.equal(result.verdict, "warning");
});

test("classifyPath accepte une référence vers le système co2", () => {
  const result = classifyPath("systems/co2/icons/skill.webp", config);
  assert.equal(result.type, "SYSTEM_COF2");
  assert.equal(result.verdict, "ok");
});

test("classifyPath accepte avec warning une référence vers un autre système", () => {
  const result = classifyPath("systems/dnd5e/icons/skill.webp", config);
  assert.equal(result.type, "EXTERNAL_SYSTEM_REFERENCE");
  assert.equal(result.verdict, "warning");
});

test("classifyPath accepte icons/ (Foundry Core)", () => {
  const result = classifyPath("icons/svg/mystery-man.svg", config);
  assert.equal(result.type, "FOUNDRY_CORE");
  assert.equal(result.verdict, "ok");
});

test("classifyPath accepte ui/ (Foundry Core)", () => {
  const result = classifyPath("ui/banners/welcome.webp", config);
  assert.equal(result.type, "FOUNDRY_CORE");
  assert.equal(result.verdict, "ok");
});

test("classifyPath accepte une URL externe http(s)", () => {
  assert.equal(classifyPath("https://example.com/img.webp", config).type, "REMOTE");
  assert.equal(classifyPath("http://example.com/img.webp", config).type, "REMOTE");
});

test("classifyPath accepte une data: URI", () => {
  const result = classifyPath("data:image/png;base64,AAAA", config);
  assert.equal(result.type, "DATA_URI");
  assert.equal(result.verdict, "ok");
});

test("classifyPath signale un warning pour une référence non reconnue", () => {
  const result = classifyPath("assets/random/img.webp", config);
  assert.equal(result.type, "UNCLASSIFIED_REFERENCE");
  assert.equal(result.verdict, "warning");
});
