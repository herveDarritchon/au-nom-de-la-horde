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