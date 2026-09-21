import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeUnicode, stripPdfNoise, repairHyphenation, reconstructSegments, reconstructText } from "./textReconstruction.mjs";

test("normalizeUnicode remplace les espaces insécables par des espaces normaux", () => {
  assert.equal(normalizeUnicode("S Défense 13"), "S Défense 13");
});

test("normalizeUnicode uniformise les tirets Unicode en tiret simple", () => {
  assert.equal(normalizeUnicode("non‑vivant – test − valeur"), "non-vivant - test - valeur");
});

test("normalizeUnicode uniformise les apostrophes courbes", () => {
  assert.equal(normalizeUnicode("d’au moins"), "d'au moins");
});

test("normalizeUnicode déligature fi et fl", () => {
  assert.equal(normalizeUnicode("ﬁnﬂamme"), "finflamme");
});

test("normalizeUnicode retire les caractères de contrôle sans toucher aux retours à la ligne", () => {
  assert.equal(normalizeUnicode("a\u0000b\nc\u007Fd"), "ab\ncd");
});

test("stripPdfNoise retire un numéro de page isolé", () => {
  assert.deepEqual(stripPdfNoise(["Centaure", "1", "| NC 3"]), ["Centaure", "| NC 3"]);
});

test("stripPdfNoise retire un titre courant « BESTIAIRE - ... »", () => {
  assert.deepEqual(stripPdfNoise(["BESTIAIRE - CENTAURE", "Centaure"]), ["Centaure"]);
});

test("stripPdfNoise retire le mot-clé INTRO", () => {
  assert.deepEqual(stripPdfNoise(["INTRO", "Centaure"]), ["Centaure"]);
});

test("stripPdfNoise retire des lettres isolées de pictogramme", () => {
  assert.deepEqual(stripPdfNoise(["W W", "Centaure"]), ["Centaure"]);
});

test("stripPdfNoise ne retire pas une ligne de contenu réelle", () => {
  const lines = ["Centaure", "| NC 3", "S Défense 15"];
  assert.deepEqual(stripPdfNoise(lines), lines);
});

test("repairHyphenation répare une césure sans fusionner un mot composé (majuscule à la suite)", () => {
  assert.equal(repairHyphenation("La créature pié-\ntine violemment."), "La créature piétine violemment.");
  assert.equal(repairHyphenation("Grand-\nDuc arrive."), "Grand-\nDuc arrive.");
});

test("reconstructSegments rejoint une attaque et son DM porté par la ligne suivante", () => {
  assert.deepEqual(reconstructSegments(["Sabots +7 ·", "DM 1d8+6"]), ["Sabots +7 · DM 1d8+6"]);
});

test("reconstructSegments ne fusionne pas la ligne des caractéristiques avec la ligne suivante", () => {
  const lines = ["AGI +3 CON +6* FOR +6 PER +1* CHA +0 INT -1 VOL +0", "S Défense 15"];
  assert.deepEqual(reconstructSegments(lines), lines);
});

test("reconstructSegments sépare plusieurs attaques collées sur une seule ligne", () => {
  assert.deepEqual(reconstructSegments(["Sabots +7 · DM 1d8+6 Épée longue +7 · DM 1d8+3"]), ["Sabots +7 · DM 1d8+6", "Épée longue +7 · DM 1d8+3"]);
});

test("reconstructSegments sépare les caractéristiques collées à une attaque sur la même ligne", () => {
  const line = "AGI +3 CON +2 FOR -3 PER +4 CHA +0 INT -4 VOL +0 Serres +3 · DM 1d4";
  assert.deepEqual(reconstructSegments([line]), ["AGI +3 CON +2 FOR -3 PER +4 CHA +0 INT -4 VOL +0", "Serres +3 · DM 1d4"]);
});

test("reconstructSegments laisse intacte une capacité déjà répartie sur plusieurs lignes", () => {
  const lines = ["Charge (L) :", "Si la créature se déplace d'au moins 6 mètres.", "La cible fait un test de FOR."];
  assert.deepEqual(reconstructSegments(lines), lines);
});

test("reconstructSegments segmente un statblock entièrement collé sur une seule ligne", () => {
  const line =
    "Aigle commun | NC 1/2 taille petite AGI +3* CON +2 FOR -3 PER +4* CHA +0 INT -4 VOL +0 S Défense 13 V Points de vigueur 3 I Initiative 16 Serres +3 · DM 1d4 Vol rapide : La créature obtient une action.";
  assert.deepEqual(reconstructSegments([line]), [
    "Aigle commun | NC 1/2",
    "taille petite",
    "AGI +3* CON +2 FOR -3 PER +4* CHA +0 INT -4 VOL +0",
    "S Défense 13",
    "V Points de vigueur 3",
    "I Initiative 16",
    "Serres +3 · DM 1d4",
    "Vol rapide : La créature obtient une action.",
  ]);
});

test("reconstructSegments documente la limite connue sur deux colonnes mal extraites (pas de fusion ni de perte)", () => {
  // Deux colonnes entrelacées ligne à ligne : aucune heuristique dédiée (hors scope), le contenu est conservé tel quel.
  const lines = ["Centaure", "Golem de pierre", "| NC 3", "| NC 5"];
  assert.deepEqual(reconstructSegments(lines), lines);
});

test("reconstructText conserve rawText et normalizedText séparément", () => {
  const raw = "Centaure\n| NC 3\n";
  const { rawText, normalizedText } = reconstructText(raw);
  assert.equal(rawText, raw);
  assert.equal(normalizedText, "Centaure\n| NC 3");
});
