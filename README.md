## 🚀 Processus de release

Les releases du module Warbound sont construites automatiquement par GitHub Actions.

### Principe

Les fichiers YAML présents dans `compendiums/` constituent la **source de vérité** des compendiums Foundry.

Les bases LevelDB présentes dans `packs/` sont uniquement des **artefacts générés** :

```text
compendiums/*.yml
        ↓
   GitHub Actions
        ↓
   audit des sources
        ↓
 suppression de packs/
        ↓
   build YAML → LDB
        ↓
       packs/
        ↓
     module.zip
        ↓
   GitHub Release

---

## 🐉 Importateur de rencontres COF2

Le module intègre un wizard d'import pour créer rapidement un acteur **Rencontre** à partir d'un statblock COF2 copié-collé (Livre des règles, Bestiaire, PDF compatible).

### Lancer le wizard

Deux points d'entrée :

- **Onglet Acteurs** — un bouton **« Importer une rencontre COF2 »** est ajouté automatiquement dans l'en-tête du répertoire d'acteurs (réservé aux GMs).
- **Paramètres du module** — `Configuration` → module `warbound-campaign-content` → **« Ouvrir l'importateur »**.
- **Console Foundry** — `game.modules.get("warbound-campaign-content").api.cof2.openCof2ImportWizard()`.

### Les 4 étapes

| Étape | Ce qu'on fait |
|---|---|
| **1. Source** | Coller le statblock brut dans la zone de texte, puis cliquer **Analyser**. |
| **2. Prévisualisation** | Vérifier et corriger les données extraites : nom, NC, caractéristiques, attaques, capacités, diagnostics. |
| **3. Options** | Choisir si on crée l'acteur, si on réutilise les objets existants, si on ouvre la fiche à la fin. |
| **4. Résultat** | L'acteur est créé dans le répertoire d'acteurs. Cliquer **Ouvrir la rencontre** pour afficher la fiche. |

### Indicateurs de confiance

- **✓** — donnée extraite avec certitude ou capacité trouvée dans le compendium officiel `cof2-base`.
- **⚠** — donnée à vérifier (ambiguïté ou variante reconnue).
- **✕** — donnée non reconnue (à renseigner manuellement ou nouvelle capacité).

---

## 📋 Importateur Warbound Markdown

Le module intègre un importateur pour créer un **JournalEntry** (avec pages par entrée) et une **RollTable** pondérée à partir d'un fichier Markdown Warbound.

### Format du fichier `.md`

```markdown
---
warbound:
  schema: 1
  id: durotar-tauren-rumors
  title: Rumeurs taurènes — Durotar
  type: rumor
---

# Rumeurs taurènes — Durotar

## Contexte

Texte contextuel visible dans la page « Contexte » du journal.

<!-- warbound:table:start -->

## Table aléatoire

| Index | ID              | Titre                | Aperçu               | Poids | Actif |
|------:|-----------------|----------------------|----------------------|------:|-------|
| 1     | stonehoof-convoi | Le convoi Stonehoof | Une cargaison pillée. | 1    | oui   |
| 2     | thunderhorn      | Les bêtes migrent   | Migrations inhabituelles. | 2 | oui   |
| 3     | grimtotem        | Les Grimtotem       | Des rumeurs circulent. | 1   | non   |

<!-- warbound:table:end -->

# Entrées

<!-- warbound:entry id="stonehoof-convoi" -->

## Le convoi Stonehoof

Contenu détaillé de l'entrée.

<!-- warbound:entry:end -->

<!-- warbound:entry id="thunderhorn" -->

## Les bêtes migrent

Contenu détaillé.

<!-- warbound:entry:end -->

<!-- warbound:entry id="grimtotem" -->

## Les Grimtotem

Contenu détaillé — page créée mais absente de la RollTable (Actif = non).

<!-- warbound:entry:end -->
```

**Règles clés :**
- `id` (front matter) — identifiant stable de la collection, utilisé pour détecter les doublons.
- `Actif = non` — la page Journal est créée, mais l'entrée est exclue de la RollTable.
- `Poids` — détermine les plages de la RollTable (`1d{somme des poids actifs}`).

### Lancer l'import

Trois points d'entrée :

- **Onglet Journaux** — bouton **« Importer un document Warbound »** ajouté automatiquement dans l'en-tête (GM uniquement).
- **Paramètres du module** — `Paramètres de partie` → `Paramètres des modules` → `warbound-campaign-content` → **« Ouvrir l'importateur »**.
- **Console Foundry** — `game.modules.get("warbound-campaign-content").api.warbound.openWarboundMarkdownImporter()`.

### Étapes dans l'interface

1. Sélectionner le fichier `.md` — parse et validation automatiques.
2. Si valide, choisir un **dossier Journal** et un **dossier Table** (optionnels — laisser vide pour la racine).
3. Cliquer **Importer** → le journal et la table sont créés.
4. L'interface affiche le nom du journal et de la table créés.

### Validation manuelle après import

#### 1. JournalEntry

- Ouvrir **Journaux** → vérifier qu'un journal portant le `title` du front matter est créé.
- Ouvrir le journal → vérifier la présence de la page **Contexte** (première page) et d'une page par entrée (y compris les inactives).
- Console Foundry → vérifier les flags :
  ```javascript
  game.journal.getName("Rumeurs taurènes — Durotar")
    .flags["warbound-campaign-content"].markdownImport
  // { schema: 1, collectionId: "durotar-tauren-rumors" }
  ```

#### 2. RollTable

- Ouvrir **Tables de résultats** → vérifier qu'une table portant le même nom que le journal est créée.
- Vérifier la **formule** : `1d3` pour poids `[1, 2]` (entrée inactive exclue), `1d4` pour `[1, 2, 1]` toutes actives.
- Vérifier les **plages** :

  | Entrée | Poids | Plage attendue |
  |--------|------:|---------------|
  | A      | 1     | 1             |
  | B      | 2     | 2–3           |
  | C (inactif) | — | absent   |

- Vérifier que **l'entrée inactive** (`Actif = non`) n'apparaît pas dans la liste des résultats.
- Cliquer **Tirer** → le résultat doit afficher le titre et l'aperçu de l'entrée.

#### 3. Liens UUID

- Dans la table, ouvrir un résultat → vérifier que le champ **Document lié** pointe vers la bonne `JournalEntryPage`.
- Console Foundry → vérifier l'UUID d'un résultat :
  ```javascript
  const table = game.tables.getName("Rumeurs taurènes — Durotar");
  table.results.contents.forEach(r =>
    console.log(r.name, "→", r.documentUuid)
  );
  // Chaque UUID doit être de la forme :
  // JournalEntry.<journalId>.JournalEntryPage.<pageId>
  ```
- Cliquer le lien UUID dans un résultat → la page détaillée du journal s'ouvre.

#### 4. Absence de doublons

- Relancer l'import avec le même fichier → **aucun** nouveau journal ni nouvelle table ne doit être créé (fonctionnalité de synchronisation, issue #26 — pas encore implémentée : à ce stade un second import créera un doublon, comportement attendu).