import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  collectAssetRefs,
  collectPngAssetRefs,
  pngToWebpPath,
  resolveAssetRef,
  resolveImageProfile,
  rewriteAssetRefs
} from "./mediaPaths.mjs";

const MODULE_ID = "warbound-campaign-content";
const PREFIX = `modules/${MODULE_ID}/`;
const ROOT = "/repo";
const CONTEXT = {
  root: ROOT,
  fileDir: path.join(ROOT, "compendiums", "actors"),
  moduleId: MODULE_ID
};

// pngToWebpPath

test("pngToWebpPath remplace l'extension .png par .webp", () => {
  assert.equal(
    pngToWebpPath("assets/images/hero.png"),
    "assets/images/hero.webp"
  );
});

test("pngToWebpPath est insensible à la casse de l'extension", () => {
  assert.equal(
    pngToWebpPath("assets/images/HERO.PNG"),
    "assets/images/HERO.webp"
  );
});

test("pngToWebpPath ne modifie pas un chemin déjà en .webp", () => {
  const p = "assets/images/hero.webp";
  assert.equal(pngToWebpPath(p), p);
});

test("pngToWebpPath ne modifie pas un chemin sans extension image", () => {
  const p = "assets/sounds/hero.ogg";
  assert.equal(pngToWebpPath(p), p);
});

// resolveAssetRef

test("resolveAssetRef résout une référence préfixée par le module", () => {
  assert.equal(
    resolveAssetRef(`${PREFIX}assets/images/hero.png`, CONTEXT),
    "assets/images/hero.png"
  );
});

test("resolveAssetRef résout une référence à module via template littéral", () => {
  assert.equal(
    resolveAssetRef("modules/${MODULE_ID}/assets/ui/logo.png", CONTEXT),
    "assets/ui/logo.png"
  );
});

test("resolveAssetRef résout une référence relative à la racine", () => {
  assert.equal(
    resolveAssetRef("assets/images/hero.png", CONTEXT),
    "assets/images/hero.png"
  );
});

test("resolveAssetRef résout une référence relative au fichier source", () => {
  const context = { ...CONTEXT, fileDir: path.join(ROOT, "styles") };

  assert.equal(
    resolveAssetRef("../assets/ui/paper.png", context),
    "assets/ui/paper.png"
  );
});

test("resolveAssetRef rejette une référence monde", () => {
  assert.equal(
    resolveAssetRef("worlds/ma-ville/assets/images/hero.png", CONTEXT),
    null
  );
});

test("resolveAssetRef rejette une référence vers un autre module", () => {
  assert.equal(
    resolveAssetRef("modules/autre-module/assets/images/hero.png", CONTEXT),
    null
  );
});

test("resolveAssetRef rejette une référence vers un autre système", () => {
  assert.equal(
    resolveAssetRef("systems/co2/assets/images/hero.png", CONTEXT),
    null
  );
});

test("resolveAssetRef rejette une URL distante", () => {
  assert.equal(
    resolveAssetRef("https://exemple.test/assets/images/hero.png", CONTEXT),
    null
  );
});

test("resolveAssetRef rejette une data-URI", () => {
  assert.equal(resolveAssetRef("data:image/png;base64,AAAA", CONTEXT), null);
});

test("resolveAssetRef rejette un chemin de module hors assets", () => {
  assert.equal(
    resolveAssetRef(`${PREFIX}styles/warbound.css`, CONTEXT),
    null
  );
});

test("resolveAssetRef décode une référence encodée en pourcentage", () => {
  assert.equal(
    resolveAssetRef(
      `${PREFIX}assets/images/icons/sang-froid%20.png`,
      CONTEXT
    ),
    "assets/images/icons/sang-froid .png"
  );
});

test("resolveAssetRef rejette une référence relative hors du dossier assets", () => {
  const context = { ...CONTEXT, fileDir: path.join(ROOT, "styles") };

  assert.equal(resolveAssetRef("../styles/autre.png", context), null);
});

// rewriteAssetRefs

test("rewriteAssetRefs remplace les références PNG du module", () => {
  const content = `img: ${PREFIX}assets/images/hero.png\ntoken: ${PREFIX}assets/images/token.png`;
  const { updated, count } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(count, 2);
  assert.ok(updated.includes(`${PREFIX}assets/images/hero.webp`));
  assert.ok(updated.includes(`${PREFIX}assets/images/token.webp`));
});

test("rewriteAssetRefs est idempotent (déjà .webp → count 0)", () => {
  const content = `img: ${PREFIX}assets/images/hero.webp`;
  const { updated, count } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(count, 0);
  assert.equal(updated, content);
});

test("rewriteAssetRefs ne touche pas les références hors module", () => {
  const content = "img: worlds/ma-ville/assets/images/hero.png";
  const { updated, count } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(count, 0);
  assert.equal(updated, content);
});

test("rewriteAssetRefs migre une référence relative de feuille de style", () => {
  const context = { ...CONTEXT, fileDir: path.join(ROOT, "styles") };
  const content = 'body { background: url("../assets/ui/paper.png"); }';
  const { updated, count } = rewriteAssetRefs(content, context);

  assert.equal(count, 1);
  assert.ok(updated.includes('url("../assets/ui/paper.webp")'));
});

test("rewriteAssetRefs migre une référence de template littéral JS", () => {
  const content = "logo: `modules/${MODULE_ID}/assets/ui/logo.png`";
  const { updated, count } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(count, 1);
  assert.ok(updated.includes("assets/ui/logo.webp"));
});

test("rewriteAssetRefs préserve l'encodage pourcentage de la référence", () => {
  const content = `img: ${PREFIX}assets/images/icons/sang-froid%20.png`;
  const { updated, count } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(count, 1);
  assert.ok(updated.includes("sang-froid%20.webp"));
  assert.ok(!updated.includes("%20.png"));
});

test("rewriteAssetRefs ignore les assets non listés par isKnownAsset", () => {
  const content = `img: ${PREFIX}assets/images/hero.png`;
  const { updated, count } = rewriteAssetRefs(content, {
    ...CONTEXT,
    isKnownAsset: () => false
  });

  assert.equal(count, 0);
  assert.equal(updated, content);
});

test("rewriteAssetRefs traite un contenu vide sans erreur", () => {
  const { updated, count } = rewriteAssetRefs("", CONTEXT);

  assert.equal(count, 0);
  assert.equal(updated, "");
});

test("rewriteAssetRefs expose les assets réécrits", () => {
  const content = `img: ${PREFIX}assets/images/hero.png`;
  const { rewritten } = rewriteAssetRefs(content, CONTEXT);

  assert.equal(rewritten.length, 1);
  assert.equal(rewritten[0].assetPath, "assets/images/hero.png");
});

// collectPngAssetRefs

test("collectPngAssetRefs liste les assets PNG référencés", () => {
  const content = `a: ${PREFIX}assets/images/hero.png\nb: ${PREFIX}assets/images/hero.png\nc: ${PREFIX}assets/images/token.png`;
  const found = collectPngAssetRefs(content, CONTEXT);

  assert.equal(found.size, 2);
  assert.ok(found.has("assets/images/hero.png"));
  assert.ok(found.has("assets/images/token.png"));
});

test("collectPngAssetRefs ignore les références déjà WebP", () => {
  const content = `a: ${PREFIX}assets/images/hero.webp`;
  const found = collectPngAssetRefs(content, CONTEXT);

  assert.equal(found.size, 0);
});

// collectAssetRefs

test("collectAssetRefs liste les assets de toutes les extensions demandées", () => {
  const content = [
    `a: ${PREFIX}assets/images/hero.png`,
    `b: ${PREFIX}assets/musics/ambiance.ogg`,
    `c: ${PREFIX}assets/scenes/thumb-1.webp`
  ].join("\n");

  const found = collectAssetRefs(content, CONTEXT, [".png", ".ogg", ".webp"]);

  assert.equal(found.size, 3);
  assert.ok(found.has("assets/images/hero.png"));
  assert.ok(found.has("assets/musics/ambiance.ogg"));
  assert.ok(found.has("assets/scenes/thumb-1.webp"));
});

test("collectAssetRefs ignore les extensions non demandées", () => {
  const content = `a: ${PREFIX}assets/images/hero.png\nb: ${PREFIX}assets/musics/ambiance.ogg`;
  const found = collectAssetRefs(content, CONTEXT, [".png"]);

  assert.equal(found.size, 1);
  assert.ok(found.has("assets/images/hero.png"));
});

test("collectAssetRefs détecte une référence suivie d'un point de fin de phrase", () => {
  const content = `description: voir ${PREFIX}assets/images/hero.png.`;
  const found = collectAssetRefs(content, CONTEXT, [".png"]);

  assert.deepEqual([...found], ["assets/images/hero.png"]);
});

test("collectAssetRefs ne confond pas une extension suivi d'un suffixe", () => {
  const content = `a: ${PREFIX}assets/images/hero.pngx`;
  const found = collectAssetRefs(content, CONTEXT, [".png"]);

  assert.equal(found.size, 0);
});

test("collectAssetRefs détecte un template littéral JavaScript", () => {
  const content = "img: `modules/${MODULE_ID}/assets/ui/logo.png`";
  const found = collectAssetRefs(content, CONTEXT, [".png"]);

  assert.deepEqual([...found], ["assets/ui/logo.png"]);
});

// resolveImageProfile

test("resolveImageProfile renvoie le profil par défaut hors règle", () => {
  const rules = [{ profile: "icon", match: /^assets\/images\/icons\// }];

  assert.equal(resolveImageProfile("assets/images/items/epée.png", rules), "default");
});

test("resolveImageProfile renvoie le premier profil correspondant", () => {
  const rules = [
    { profile: "icon", match: /^assets\/images\/icons\// },
    { profile: "token", match: /^assets\/images\// }
  ];

  assert.equal(
    resolveImageProfile("assets/images/icons/soin.png", rules),
    "icon"
  );
});
