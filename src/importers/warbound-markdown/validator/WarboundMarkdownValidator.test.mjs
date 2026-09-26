import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateWarboundModel } from "./WarboundMarkdownValidator.mjs";
import { parseWarboundMarkdown } from "../parser/WarboundMarkdownParser.mjs";

// ── Fixture de référence (document valide) ─────────────────────────────────────

const VALID_RAW = `---
warbound:
  schema: 1
  id: durotar-tauren-rumors
  title: Rumeurs taurènes — Durotar
  type: rumor
---

# Rumeurs taurènes — Durotar

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | stonehoof-convoi | Le convoi Stonehoof | Une cargaison pillée. | 1 | oui |
| 2 | thunderhorn-migration | Les bêtes quittent les crêtes | Des migrations inhabituelles. | 2 | oui |
| 3 | grimtotem-presence | Les Grimtotem seraient là | Des propos hostiles circulent. | 1 | non |

<!-- warbound:table:end -->

<!-- warbound:entry id="stonehoof-convoi" -->

## Le convoi Stonehoof

Trois kodos sont arrivés de Thunder Bluff.

<!-- warbound:entry:end -->

<!-- warbound:entry id="thunderhorn-migration" -->

## Les bêtes quittent les crêtes

Un Thunderhorn a constaté des migrations.

<!-- warbound:entry:end -->
`;

function makeModel(raw) {
  return parseWarboundMarkdown(raw);
}

function validate(raw) {
  return validateWarboundModel(makeModel(raw), raw);
}

// ── Document valide ────────────────────────────────────────────────────────────

describe("document valide", () => {
  test("aucune erreur, aucun warning pour document complet", () => {
    const { errors, warnings } = validate(VALID_RAW);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  test("retourne un objet avec errors et warnings", () => {
    const result = validate(VALID_RAW);
    assert.ok(Array.isArray(result.errors));
    assert.ok(Array.isArray(result.warnings));
  });
});

// ── Erreurs bloquantes — front matter ─────────────────────────────────────────

describe("erreur : front matter absent", () => {
  test("sans front matter → erreur missing-front-matter", () => {
    const raw = `# Pas de front matter\n\n<!-- warbound:table:start -->\n<!-- warbound:table:end -->`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-front-matter"));
  });

  test("sans front matter → une seule erreur retournée (arrêt anticipé)", () => {
    const raw = `# Pas de front matter`;
    const { errors } = validate(raw);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "missing-front-matter");
  });
});

describe("erreur : schema absent ou non supporté", () => {
  test("schema absent → erreur missing-schema", () => {
    const raw = `---
warbound:
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-schema"));
  });

  test("schema non supporté → erreur unsupported-schema", () => {
    const raw = `---
warbound:
  schema: 99
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "unsupported-schema"));
  });
});

describe("erreur : id et title absents", () => {
  test("warbound.id absent → erreur missing-id", () => {
    const raw = `---
warbound:
  schema: 1
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-id"));
  });

  test("warbound.title absent → erreur missing-title", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-title"));
  });
});

// ── Erreurs bloquantes — structure de la table ────────────────────────────────

describe("erreur : table absente", () => {
  test("aucun marqueur table → erreur missing-table", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---

Pas de table.
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-table"));
  });

  test("table absente → arrêt anticipé (pas d'autres erreurs de table)", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---

Pas de table.
`;
    const { errors } = validate(raw);
    const tableCodes = ["duplicate-id-table", "invalid-weight", "invalid-actif", "missing-block-for-active-entry"];
    assert.ok(!tableCodes.some((c) => errors.some((e) => e.code === c)));
  });
});

describe("erreur : plusieurs tables", () => {
  test("deux blocs table → erreur multiple-tables", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "multiple-tables"));
  });
});

describe("erreur : colonne manquante", () => {
  test("colonne Poids absente → erreur missing-column", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Actif |
|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "missing-column" && e.message.includes("Poids")));
  });
});

// ── Erreurs bloquantes — contenu de la table ──────────────────────────────────

describe("erreur : ID dupliqué dans la table", () => {
  test("deux lignes avec le même ID → erreur duplicate-id-table", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
| 2 | entry-a | Titre B | Aperçu B | 1 | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    const dup = errors.find((e) => e.code === "duplicate-id-table");
    assert.ok(dup);
    assert.equal(dup.id, "entry-a");
  });
});

describe("erreur : ID dupliqué dans les blocs", () => {
  test("deux blocs avec le même ID → erreur duplicate-id-block", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
<!-- warbound:table:end -->
<!-- warbound:entry id="entry-a" -->
Contenu A.
<!-- warbound:entry:end -->
<!-- warbound:entry id="entry-a" -->
Contenu dupliqué.
<!-- warbound:entry:end -->
`;
    const { errors } = validate(raw);
    const dup = errors.find((e) => e.code === "duplicate-id-block");
    assert.ok(dup);
    assert.equal(dup.id, "entry-a");
  });
});

describe("erreur : entrée active sans bloc détaillé", () => {
  test("entrée active sans bloc → erreur missing-block-for-active-entry", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | oui |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    const missing = errors.find((e) => e.code === "missing-block-for-active-entry");
    assert.ok(missing);
    assert.equal(missing.id, "entry-a");
  });

  test("entrée inactive sans bloc → pas d'erreur", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(!errors.some((e) => e.code === "missing-block-for-active-entry"));
  });
});

describe("erreur : poids invalide", () => {
  test("poids 0 → erreur invalid-weight", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 0 | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "invalid-weight" && e.id === "entry-a"));
  });

  test("poids négatif → erreur invalid-weight", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | -1 | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "invalid-weight"));
  });

  test("poids décimal → erreur invalid-weight", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1.5 | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "invalid-weight"));
  });

  test("poids texte → erreur invalid-weight", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | abc | non |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "invalid-weight"));
  });

  test("poids valide 1 → pas d'erreur", () => {
    const { errors } = validate(VALID_RAW);
    assert.ok(!errors.some((e) => e.code === "invalid-weight"));
  });

  test("poids valide 2 → pas d'erreur", () => {
    const { errors } = validate(VALID_RAW);
    assert.ok(!errors.some((e) => e.code === "invalid-weight"));
  });
});

describe("erreur : Actif invalide", () => {
  test("Actif 'yes' → erreur invalid-actif", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | yes |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    const actifErr = errors.find((e) => e.code === "invalid-actif");
    assert.ok(actifErr);
    assert.equal(actifErr.id, "entry-a");
  });

  test("Actif 'true' → erreur invalid-actif", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | true |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    assert.ok(errors.some((e) => e.code === "invalid-actif"));
  });

  test("Actif 'oui' → pas d'erreur", () => {
    const { errors } = validate(VALID_RAW);
    assert.ok(!errors.some((e) => e.code === "invalid-actif"));
  });

  test("Actif 'non' → pas d'erreur", () => {
    const { errors } = validate(VALID_RAW);
    assert.ok(!errors.some((e) => e.code === "invalid-actif"));
  });
});

// ── Warnings ───────────────────────────────────────────────────────────────────

describe("warning : bloc orphelin", () => {
  test("bloc non référencé dans la table → warning orphan-block", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
<!-- warbound:table:end -->
<!-- warbound:entry id="entry-a" -->
Contenu A.
<!-- warbound:entry:end -->
<!-- warbound:entry id="entry-orphelin" -->
Contenu orphelin.
<!-- warbound:entry:end -->
`;
    const { errors, warnings } = validate(raw);
    assert.deepEqual(errors, []);
    const orphan = warnings.find((w) => w.code === "orphan-block");
    assert.ok(orphan);
    assert.equal(orphan.id, "entry-orphelin");
  });
});

describe("warning : trous dans les Index", () => {
  test("Index 1, 2, 4 → warning index-gap pour 3", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
| 2 | entry-b | Titre B | Aperçu B | 1 | non |
| 4 | entry-c | Titre C | Aperçu C | 1 | non |
<!-- warbound:table:end -->
`;
    const { warnings } = validate(raw);
    const gap = warnings.find((w) => w.code === "index-gap");
    assert.ok(gap);
    assert.ok(gap.message.includes("3"));
  });

  test("Index consécutifs → pas de warning index-gap", () => {
    const { warnings } = validate(VALID_RAW);
    assert.ok(!warnings.some((w) => w.code === "index-gap"));
  });
});

describe("warning : aucune entrée active", () => {
  test("toutes entrées inactives → warning no-active-entry", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A | Aperçu A | 1 | non |
| 2 | entry-b | Titre B | Aperçu B | 1 | non |
<!-- warbound:table:end -->
`;
    const { warnings } = validate(raw);
    assert.ok(warnings.some((w) => w.code === "no-active-entry"));
  });

  test("au moins une entrée active → pas de warning no-active-entry", () => {
    const { warnings } = validate(VALID_RAW);
    assert.ok(!warnings.some((w) => w.code === "no-active-entry"));
  });
});

describe("warning : aperçu vide", () => {
  test("aperçu vide → warning empty-summary", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Titre A |  | 1 | non |
<!-- warbound:table:end -->
`;
    const { warnings } = validate(raw);
    assert.ok(warnings.some((w) => w.code === "empty-summary" && w.id === "entry-a"));
  });

  test("tous les aperçus remplis → pas de warning empty-summary", () => {
    const { warnings } = validate(VALID_RAW);
    assert.ok(!warnings.some((w) => w.code === "empty-summary"));
  });
});

describe("warning : titres dupliqués", () => {
  test("deux entrées avec le même titre → warning duplicate-title", () => {
    const raw = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-a | Même titre | Aperçu A | 1 | non |
| 2 | entry-b | Même titre | Aperçu B | 1 | non |
<!-- warbound:table:end -->
`;
    const { warnings } = validate(raw);
    assert.ok(warnings.some((w) => w.code === "duplicate-title"));
  });

  test("titres uniques → pas de warning duplicate-title", () => {
    const { warnings } = validate(VALID_RAW);
    assert.ok(!warnings.some((w) => w.code === "duplicate-title"));
  });
});

// ── Codes d'erreur et messages §17 ────────────────────────────────────────────

describe("messages d'erreur §17", () => {
  test("missing-block-for-active-entry mentionne l'ID et le bloc attendu", () => {
    const raw = `---
warbound:
  schema: 1
  id: ma-collection
  title: Ma Collection
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
| 1 | entry-manquant | Titre | Aperçu | 1 | oui |
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    const e = errors.find((e) => e.code === "missing-block-for-active-entry");
    assert.ok(e.message.includes("entry-manquant"));
    assert.ok(e.message.includes("ma-collection"));
    assert.ok(e.message.includes('warbound:entry id="entry-manquant"'));
  });

  test("chaque erreur a un code, un message", () => {
    const raw = `---
warbound:
  schema: 99
  id: test
  title: Test
---
<!-- warbound:table:start -->
| Index | ID | Titre | Aperçu | Poids | Actif |
|---|---|---|---|---|---|
<!-- warbound:table:end -->
`;
    const { errors } = validate(raw);
    for (const e of errors) {
      assert.ok(typeof e.code === "string" && e.code.length > 0, `code manquant dans ${JSON.stringify(e)}`);
      assert.ok(typeof e.message === "string" && e.message.length > 0, `message manquant dans ${JSON.stringify(e)}`);
    }
  });
});
