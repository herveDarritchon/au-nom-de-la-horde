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