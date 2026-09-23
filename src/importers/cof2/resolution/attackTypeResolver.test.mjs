import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeWeaponName, makeAttackTypeResolver, resolveAttackKind } from "./attackTypeResolver.mjs";

test("normalizeWeaponName retire les accents, la casse et les espaces parasites", () => {
  assert.equal(normalizeWeaponName("Arc long"), "arc long");
  assert.equal(normalizeWeaponName("ARC LONG"), "arc long");
  assert.equal(normalizeWeaponName(" Arc   long"), "arc long");
  assert.equal(normalizeWeaponName("Arbalète légère"), "arbalete legere");
});

const weaponTypeByName = new Map([
  ["arc long", "ranged"],
  ["arc court", "ranged"],
  ["arbalete legere", "ranged"],
  ["arbalete lourde", "ranged"],
  ["fronde", "ranged"],
  ["javelot", "ranged"],
  ["mousquet", "ranged"],
  ["epee longue", "melee"],
]);

test("makeAttackTypeResolver retrouve le type via le nom normalisé", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName });
  assert.equal(resolve("Arc long"), "ranged");
  assert.equal(resolve("ARC LONG"), "ranged");
  assert.equal(resolve("arc long"), "ranged");
  assert.equal(resolve("Arc   long"), "ranged");
});

test("makeAttackTypeResolver renvoie null pour une arme absente du référentiel (jamais un guess)", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName });
  assert.equal(resolve("Sabots"), null);
});

test("makeAttackTypeResolver résout un alias typographique vers son nom canonique", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName, aliases: { "arbalete legere ": "Arbalète légère" } });
  assert.equal(resolve("arbalete legere "), "ranged");
});

test("makeAttackTypeResolver couvre les groupes d'armes de l'issue", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName });
  for (const name of ["Arc long", "Arc court", "Arbalète légère", "Arbalète lourde", "Fronde", "Javelot", "Mousquet"]) {
    assert.equal(resolve(name), "ranged", name);
  }
  assert.equal(resolve("Épée longue"), "melee");
});

test("resolveAttackKind laisse un kind explicite inchangé (portée/préfixe déjà résolus par le parseur)", () => {
  assert.equal(resolveAttackKind({ name: "Jet de pierre", kind: "ranged" }, makeAttackTypeResolver({ weaponTypeByName: new Map() })), "ranged");
  assert.equal(resolveAttackKind({ name: "Souffle", kind: "magical" }, makeAttackTypeResolver({ weaponTypeByName: new Map() })), "magical");
});

test("resolveAttackKind comble le fallback melee via le resolver quand l'arme est connue", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName });
  assert.equal(resolveAttackKind({ name: "Arc long", kind: "melee" }, resolve), "ranged");
});

test("resolveAttackKind conserve le fallback melee pour une attaque naturelle inconnue, sans erreur", () => {
  const resolve = makeAttackTypeResolver({ weaponTypeByName });
  assert.equal(resolveAttackKind({ name: "Sabots", kind: "melee" }, resolve), "melee");
  assert.equal(resolveAttackKind({ name: "Griffes", kind: "melee" }, resolve), "melee");
});

test("resolveAttackKind conserve le fallback melee sans resolver fourni (non-régression)", () => {
  assert.equal(resolveAttackKind({ name: "Arc long", kind: "melee" }, undefined), "melee");
  assert.equal(resolveAttackKind({ name: "Arc long", kind: "melee" }, null), "melee");
});
