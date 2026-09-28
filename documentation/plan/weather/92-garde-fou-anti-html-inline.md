# Plan d'implémentation — chore(ci): ajouter le garde-fou anti-HTML-inline et nettoyer les helpers obsolètes

**Issue** : [#92 — chore(ci): ajouter le garde-fou anti-HTML-inline et nettoyer les helpers obsolètes](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/92)
**Dépendances** : #88, #89, #90, #91 (toutes fusionnées)

---

## 1. Objectif

Après migration complète vers HBS :
1. Supprimer la fonction `esc()` orpheline dans `scripts/importers/cof2/itemFactory.mjs`.
2. Documenter les 2 exceptions DOM conservées (`cof2ImportWizard.mjs:362`, `WarboundMarkdownImporterApp.mjs:318`).
3. Ajouter `tools/check-inline-html.sh` — script CI bash qui détecte le HTML inline dans les template literals JS.
4. Intégrer le script dans `package.json` sous `check:html-inline`.

---

## 2. Périmètre

### Inclus

- Suppression de `const esc = …` dans `scripts/importers/cof2/itemFactory.mjs` (ligne 10)
- Commentaires inline sur les 2 exceptions DOM légitimes
- Création de `tools/check-inline-html.sh`
- Ajout de `"check:html-inline"` dans `package.json`

### Hors périmètre

- Modification de la logique métier des importeurs
- Migration des exceptions DOM vers HBS (hors scope #92)
- Modification des tests existants

---

## 3. État existant

### `esc()` orpheline

```
scripts/importers/cof2/itemFactory.mjs:10
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
```

Aucun appel résiduel détecté dans les fichiers migrés (`cof2ImportWizard.mjs`, `WarboundMarkdownImporterApp.mjs`, `cof2Debug.mjs`).

### Exceptions DOM légitimes

| Fichier | Ligne | Contenu |
|---|---|---|
| `scripts/importers/cof2ImportWizard.mjs` | 362 | `button.innerHTML = '<i class="fa-solid fa-dragon"></i> Importer une rencontre COF2'` |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | 318 | `button.innerHTML = '<i class="fa-solid fa-file-import"></i> Importer un document Warbound'` |

Ces 2 cas sont des boutons FontAwesome injectés programmatiquement dans le DOM — non extractibles en HBS sans refonte complète de la construction du bouton.

### `package.json` — scripts existants

```json
"packs:build": "node ./tools/pullYAMLtoLDB.mjs",
"packs:extract": "node ./tools/pushLDBtoYAML.mjs",
"packs:audit": "node ./tools/auditAssets.mjs",
"build": "pnpm packs:audit && pnpm packs:build",
"test": "node --test"
```

---

## 4. Décisions d'architecture

**Périmètre du script CI** : détecter les template literals (backtick) contenant des balises HTML structurantes (`<div`, `<section`, `<form`, `<button`, `<ul`, `<li`, `<p`, `<h1`–`<h6`, `<table`) dans les fichiers `.mjs` sous `scripts/`. Exclure les fichiers `.test.mjs`.

**Liste d'exceptions dans le script** : les 2 lignes DOM légitimes sont référencées par chemin relatif + numéro de ligne pour que le script les ignore explicitement. Cela force une mise à jour consciente si le fichier évolue.

**Pas de modification de `build`** : `check:html-inline` reste un script optionnel/CI séparé. La cible `build` n'est pas alourdie.

---

## 5. Plan de travail

### 5.1 Supprimer `esc()` dans `itemFactory.mjs`

Retirer la ligne 10 : `const esc = (s) => …`

Vérifier par grep qu'aucun appel `esc(` ne subsiste dans le fichier.

### 5.2 Documenter les exceptions DOM

Dans `cof2ImportWizard.mjs` ligne 362, ajouter avant la ligne :
```js
// EXCEPTION DOM : bouton FontAwesome injecté programmatiquement — non migrable en HBS sans refonte du point d'injection
```

Dans `WarboundMarkdownImporterApp.mjs` ligne 318, même commentaire adapté.

### 5.3 Créer `tools/check-inline-html.sh`

```bash
#!/usr/bin/env bash
# Détecte le HTML inline dans les template literals JS.
# Exceptions légitimes listées explicitement ci-dessous.

EXCEPTIONS=(
  "scripts/importers/cof2ImportWizard.mjs:362"
  "scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs:318"
)

PATTERN='`[^`]*<(div|section|form|button|ul|li|p|h[1-6]|table)'
FOUND=0

while IFS= read -r match; do
  file=$(echo "$match" | cut -d: -f1)
  line=$(echo "$match" | cut -d: -f2)
  ref="${file}:${line}"
  skip=0
  for exc in "${EXCEPTIONS[@]}"; do
    [[ "$exc" == "$ref" ]] && skip=1 && break
  done
  if [[ $skip -eq 0 ]]; then
    echo "ERREUR HTML inline détecté : $match"
    FOUND=1
  fi
done < <(grep -rn --include="*.mjs" --exclude="*.test.mjs" -P "$PATTERN" scripts/)

if [[ $FOUND -eq 1 ]]; then
  echo "Corrigez le HTML inline ou ajoutez une exception documentée dans tools/check-inline-html.sh"
  exit 1
fi
echo "OK — aucun HTML inline non autorisé détecté."
```

### 5.4 Intégrer dans `package.json`

Ajouter dans `"scripts"` :
```json
"check:html-inline": "bash tools/check-inline-html.sh"
```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/importers/cof2/itemFactory.mjs` | Supprimer ligne `const esc` |
| `scripts/importers/cof2ImportWizard.mjs` | Ajouter commentaire exception DOM |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | Ajouter commentaire exception DOM |
| `tools/check-inline-html.sh` | Créer |
| `package.json` | Ajouter `"check:html-inline"` |

---

## 7. Tests attendus

- `grep -n "const esc" scripts/importers/cof2/itemFactory.mjs` → vide.
- `pnpm check:html-inline` → `OK — aucun HTML inline non autorisé détecté.`
- Introduire un template literal HTML dans un `.mjs` de test → script retourne exit 1.
- `pnpm test` → aucune régression.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `esc()` utilisée ailleurs (non détecté) | `grep -rn "esc(" scripts/` avant suppression |
| Script bash incompatible macOS/Linux | Utiliser `#!/usr/bin/env bash` + éviter les extensions GNU (`grep -P` disponible sur macOS via homebrew grep si besoin) |
| Numéros de ligne des exceptions obsolètes après refactor | Les commentaires inline rendent la localisation robuste même si le script rate |

---

## 9. Critères d'arrêt

- `grep -n "const esc" scripts/importers/cof2/itemFactory.mjs` retourne vide
- `pnpm check:html-inline` passe (exit 0) sur le code actuel
- `pnpm check:html-inline` échoue (exit 1) si HTML inline introduit hors exceptions
- `pnpm test` passe sans régression
