import { test } from "node:test";
import assert from "node:assert/strict";

import { planCapacityResolution } from "./capacityPlan.mjs";

test("EXACT_REUSE devient REUSE_OFFICIAL", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "EXACT_REUSE" }), { status: "REUSE_OFFICIAL" });
});

test("TEMPLATE_VARIANT devient CREATE_FROM_TEMPLATE", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "TEMPLATE_VARIANT" }), { status: "CREATE_FROM_TEMPLATE" });
});

test("AMBIGUOUS devient MANUAL_REVIEW", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "AMBIGUOUS" }), { status: "MANUAL_REVIEW", reason: "ambiguous-official" });
});

test("NOT_FOUND avec réutilisation en bibliothèque devient REUSE_IMPORTED", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "NOT_FOUND", libraryOutcome: { reused: true } }), { status: "REUSE_IMPORTED" });
});

test("NOT_FOUND avec variante de nom en bibliothèque devient MANUAL_REVIEW", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "NOT_FOUND", libraryOutcome: { variant: true } }), {
    status: "MANUAL_REVIEW",
    reason: "library-name-variant",
  });
});

test("NOT_FOUND sans correspondance en bibliothèque devient CREATE_NEW", () => {
  assert.deepEqual(planCapacityResolution({ resolverStatus: "NOT_FOUND" }), { status: "CREATE_NEW" });
  assert.deepEqual(planCapacityResolution({ resolverStatus: "NOT_FOUND", libraryOutcome: {} }), { status: "CREATE_NEW" });
});

test("un statut inconnu lève une erreur explicite", () => {
  assert.throws(() => planCapacityResolution({ resolverStatus: "SOMETHING_ELSE" }), /Statut de résolution inconnu/);
});
