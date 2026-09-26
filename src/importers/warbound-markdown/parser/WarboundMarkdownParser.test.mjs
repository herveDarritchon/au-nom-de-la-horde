import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWarboundMarkdown } from "./WarboundMarkdownParser.mjs";

// ── Fixture §50 du cadrage ─────────────────────────────────────────────────────
const REFERENCE = `---
warbound:
  schema: 1
  id: durotar-tauren-rumors
  title: Rumeurs taurènes — Durotar
  type: rumor
---

# Rumeurs taurènes — Durotar

## Contexte

Les Taurens traversent régulièrement Durotar et donnent au MJ
une façon simple de faire sentir que la Horde dépasse les frontières
de la zone.

## Utilisation

À chaque retour important à Razor Hill, choisir une rumeur adaptée
ou utiliser la table aléatoire.

<!-- warbound:table:start -->

## Table aléatoire

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | stonehoof-convoi | Le convoi Stonehoof | Une cargaison destinée à Orgrimmar a été pillée de façon très précise. | 1 | oui |
| 2 | thunderhorn-migration | Les bêtes quittent les crêtes | Plusieurs espèces quittent les hauteurs du nord. | 1 | oui |
| 3 | grimtotem-presence | Les Grimtotem seraient à Durotar | Personne n'a vu de Grimtotem, mais tout le monde connaît déjà le coupable. | 1 | non |

<!-- warbound:table:end -->

# Entrées

<!-- warbound:entry id="stonehoof-convoi" -->

## Le convoi Stonehoof

Trois kodos sont arrivés de Thunder Bluff avec une lourde cargaison.

### Ce que l'on raconte

> « Ils ont laissé l'or. Ils ont laissé les armes. Ils ont pris les outils. »

### Ce qui se passe réellement

Les voleurs ciblent uniquement le matériel permettant de creuser,
renforcer ou soutenir des galeries.

### Si les PJ s'y intéressent

Ils peuvent examiner le convoi, interroger les convoyeurs,
remonter les commandes ou pister les voleurs.

### Si personne n'agit

Une nouvelle livraison technique est attaquée plus tard.

<!-- warbound:entry:end -->

<!-- warbound:entry id="thunderhorn-migration" -->

## Les bêtes quittent les crêtes

Un Thunderhorn et un Runetotem ont constaté séparément
des migrations inhabituelles.

### Ce qui se passe réellement

Le phénomène est réel mais aucun des deux n'en connaît la cause.

<!-- warbound:entry:end -->

<!-- warbound:entry id="grimtotem-presence" -->

## Les Grimtotem seraient à Durotar

Des propos hostiles circulent à Razor Hill.

### Ce qui se passe réellement

Aucune preuve ne confirme la présence d'un Grimtotem.

<!-- warbound:entry:end -->
`;

// ── Front matter ───────────────────────────────────────────────────────────────

describe("front matter", () => {
  test("schema parsé comme entier", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.schema, 1);
  });

  test("collectionId extrait", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.collectionId, "durotar-tauren-rumors");
  });

  test("title avec accents et tiret cadratin", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.title, "Rumeurs taurènes — Durotar");
  });

  test("type extrait", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.type, "rumor");
  });

  test("type absent → undefined, pas d'erreur", () => {
    const md = `---
warbound:
  schema: 1
  id: test-id
  title: Test
---

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | entry-a | Entrée A | Aperçu A. | 1 | oui |

<!-- warbound:table:end -->

<!-- warbound:entry id="entry-a" -->

## Entrée A

Contenu.

<!-- warbound:entry:end -->
`;
    const result = parseWarboundMarkdown(md);
    assert.equal(result.type, undefined);
    assert.equal(result.schema, 1);
  });
});

// ── Contexte ──────────────────────────────────────────────────────────────────

describe("contexte", () => {
  test("markdown brut non vide", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.context.markdown.length > 0);
    assert.ok(result.context.markdown.includes("Rumeurs taurènes"));
  });

  test("HTML contient des balises de titre", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.context.html.includes("<h1>"));
    assert.ok(result.context.html.includes("<h2>"));
  });

  test("HTML contient des paragraphes", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.context.html.includes("<p>"));
  });

  test("accents préservés dans le HTML", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.context.html.includes("régulièrement"));
    assert.ok(result.context.html.includes("frontières"));
  });

  test("contexte n'inclut pas le marqueur de table", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(!result.context.markdown.includes("warbound:table"));
  });
});

// ── Table ─────────────────────────────────────────────────────────────────────

describe("table", () => {
  test("3 entrées parsées", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries.length, 3);
  });

  test("index numérique", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[0].index, 1);
    assert.equal(result.entries[1].index, 2);
    assert.equal(result.entries[2].index, 3);
  });

  test("id extrait", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[0].id, "stonehoof-convoi");
    assert.equal(result.entries[1].id, "thunderhorn-migration");
  });

  test("titre avec accents", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[0].title, "Le convoi Stonehoof");
    assert.equal(result.entries[2].title, "Les Grimtotem seraient à Durotar");
  });

  test("aperçu avec apostrophes", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.entries[2].summary.includes("n'a vu"));
  });

  test("poids = 1 par défaut", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[0].weight, 1);
  });

  test("entrée active → true", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[0].active, true);
    assert.equal(result.entries[1].active, true);
  });

  test("entrée inactive → false", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.equal(result.entries[2].active, false);
  });
});

// ── Entrées détaillées ────────────────────────────────────────────────────────

describe("entrées détaillées", () => {
  test("markdown brut non vide pour entrée active", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.entries[0].markdown.length > 0);
    assert.ok(result.entries[0].markdown.includes("Le convoi Stonehoof"));
  });

  test("HTML généré pour entrée active", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.entries[0].html.includes("<h2>"));
    assert.ok(result.entries[0].html.includes("<p>"));
  });

  test("blockquote converti en HTML", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.entries[0].html.includes("<blockquote>"));
    assert.ok(result.entries[0].html.includes("Ils ont laissé l"));
  });

  test("multi-paragraphes → plusieurs balises <p>", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    const count = (result.entries[0].html.match(/<p>/g) ?? []).length;
    assert.ok(count >= 2, `attendu >= 2 <p>, obtenu ${count}`);
  });

  test("accents et apostrophes dans le HTML", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    assert.ok(result.entries[0].html.includes("kodos"));
    assert.ok(result.entries[0].html.includes("l'or"));
  });

  test("entrée inactive a bien markdown et html", () => {
    const result = parseWarboundMarkdown(REFERENCE);
    const inactive = result.entries[2];
    assert.ok(inactive.markdown.length > 0);
    assert.ok(inactive.html.length > 0);
  });
});

// ── Poids > 1 ─────────────────────────────────────────────────────────────────

describe("poids", () => {
  test("poids 3 parsé correctement", () => {
    const md = `---
warbound:
  schema: 1
  id: test-poids
  title: Test poids
---

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | rare-event | Événement rare | Cela arrive rarement. | 3 | oui |

<!-- warbound:table:end -->

<!-- warbound:entry id="rare-event" -->

## Événement rare

Description.

<!-- warbound:entry:end -->
`;
    const result = parseWarboundMarkdown(md);
    assert.equal(result.entries[0].weight, 3);
  });
});

// ── Tableau interne à une entrée ──────────────────────────────────────────────

describe("tableau Markdown dans une entrée", () => {
  test("table GFM dans le corps d'une entrée → <table>", () => {
    const md = `---
warbound:
  schema: 1
  id: test-table
  title: Test table interne
---

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | entry-table | Entrée avec table | Aperçu. | 1 | oui |

<!-- warbound:table:end -->

<!-- warbound:entry id="entry-table" -->

## Récompenses possibles

| Objet | Quantité |
|---|---:|
| Or | 10 |
| Gemme | 2 |

<!-- warbound:entry:end -->
`;
    const result = parseWarboundMarkdown(md);
    assert.ok(result.entries[0].html.includes("<table>"));
    assert.ok(result.entries[0].html.includes("<th>"));
    assert.ok(result.entries[0].html.includes("Or"));
  });
});

// ── Cas limites ───────────────────────────────────────────────────────────────

describe("cas limites", () => {
  test("entrée de table sans bloc détaillé → markdown et html vides, pas de crash", () => {
    const md = `---
warbound:
  schema: 1
  id: test-orphan
  title: Test orphan
---

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | missing-entry | Entrée sans bloc | Pas de bloc détaillé. | 1 | oui |

<!-- warbound:table:end -->
`;
    const result = parseWarboundMarkdown(md);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].markdown, "");
    assert.equal(result.entries[0].html, "");
  });

  test("multi-lignes dans paragraphe joinées avec espace", () => {
    const md = `---
warbound:
  schema: 1
  id: test-multiline
  title: Test
---

<!-- warbound:table:start -->

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | entry-ml | Entrée | Aperçu. | 1 | oui |

<!-- warbound:table:end -->

<!-- warbound:entry id="entry-ml" -->

## Titre

Première ligne du paragraphe
deuxième ligne du même paragraphe.

<!-- warbound:entry:end -->
`;
    const result = parseWarboundMarkdown(md);
    assert.ok(result.entries[0].html.includes("Première ligne du paragraphe deuxième ligne du même paragraphe."));
  });
});
