# Audit du parseur COF2 — Hypothèses implicites et fragilités

> Répertoire analysé : `src/importers/cof2/parsing/`
> Fichiers principaux : `statblockParser.mjs`, `textReconstruction.mjs`, `textUtils.mjs`, `capacityAutomation.mjs`
> Fixtures : `__fixtures__/` (10 fichiers)

---

## Partie 1 — Analyse des fixtures

### `centaure.txt` — cas de base propre

| Champ                  | Valeur                                                            |
|------------------------|-------------------------------------------------------------------|
| NC                     | Présent (`\| NC 3`)                                               |
| Position des capacités | Après les attaques                                                |
| Format des attaques    | `Nom +bonus · DM dés` (ligne complète)                            |
| Bruit PDF              | Aucun                                                             |
| Particularités         | Golden path — tous les patterns exercés dans leur forme canonique |

Structure : nom seul (ligne 1) → `| NC 3` (ligne 2) → type/taille (ligne 3) → 7 caractéristiques sur une ligne →
DEF/PV/Init sur 3 lignes distinctes avec préfixes textuels complets (`S Défense`, `V Points de vigueur`,
`I Initiative`) → 3 attaques complètes → 4 capacités avec type d'action `(L)`, `(A)`.

**Ce qui le distingue :** C'est le seul fixture sans aucune variation ni bruit. L'arc long `+4 · DM 1d8` est classé
`kind = "melee"` (pas de portée `(Nm)` dans le nom) — comportement documenté comme attendu.

---

### `centaure-pdf-brut.txt` — bruit PDF typique

| Champ               | Valeur                                                                                     |
|---------------------|--------------------------------------------------------------------------------------------|
| NC                  | Présent                                                                                    |
| Format des attaques | `Sabots +7 ·` / `DM 1d8+6` — coupée sur deux lignes                                        |
| Bruit PDF           | Lourd : numéro de page (`0`, `1`), titre courant (`BESTIAIRE - CENTAURE`), mot-clé `INTRO` |
| Particularités      | Césure intra-mot : `pié-` / `tine violemment`                                              |

Structure identique à `centaure.txt` mais avec 4 lignes de bruit PDF avant le contenu réel, une attaque coupée et une
césure à reconstruire.

**Ce qui le distingue :** Teste les quatre mécanismes de `textReconstruction.mjs` — filtrage bruit par
`NOISE_PAGE_NUMBER_RE`, `NOISE_RUNNING_TITLE_RE`, `NOISE_KEYWORD_RE` ; réparation de césure par `repairHyphenation` ;
fusion DM par `mergeDmContinuation`. Seul fixture avec un titre courant PDF.

---

### `centaure-sans-nc.txt` — format OCR alternatif, NC absent

| Champ               | Valeur                                                                                                                                                                  |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NC                  | Absent                                                                                                                                                                  |
| Format des attaques | Coupées sur deux lignes : `Sabots +7 ·` / `DM 1d8+6`                                                                                                                    |
| Bruit PDF           | Aucun                                                                                                                                                                   |
| Particularités      | Tout en majuscules ; attributs en tableau à deux lignes avec pipes ; DEF/PV/Init collés sur une seule ligne ; `FOR +6 (+3)` avec modificateur racial ; pas de capacités |

Structure : `CENTAURE` (caps) → `CRÉATURE VIVANTE (HUMANOÏDE) TAILLE GRANDE` →
`| AGI +3 | CON +6* | FOR +6 (+3) | PER +1* |` / `| CHA +0 | INT -1 | VOL +0 |` → `(S)DEF 15 (V)PV 30 (I)Init. 14` → 3
attaques coupées → aucune capacité.

**Ce qui le distingue :** Seul fixture sans NC et sans capacités. Seul avec `FOR +6 (+3)` — le `(+3)` (modificateur
racial) est silencieusement perdu car `ABILITY_RE` capture `FOR +6` et ignore la parenthèse. Seul format où
`(HUMANOÏDE)` est entre parenthèses plutôt qu'après `·`.

---

### `scorpion-geant.txt` — profil de groupe avec section commune

| Champ                  | Valeur                                                                                                              |
|------------------------|---------------------------------------------------------------------------------------------------------------------|
| NC                     | Présent, loin dans le texte                                                                                         |
| Position des capacités | Avant le NC (section commune éditoriale)                                                                            |
| Format des attaques    | Coupées deux lignes ; DM du Dard fragmenté sur 3 lignes supplémentaires                                             |
| Bruit PDF              | Lourd : pictogrammes `W ARTHROPODE (MOYEN)`, `W`                                                                    |
| Particularités         | Paragraphe narratif introductif ; `Capacités communes` en titre éditorial ; DM complexe avec parenthèse multi-ligne |

Structure : `SCORPION GÉANT` → description narrative → `Capacités communes` → 3 capacités (`VERMINE :`, `CUIRASSÉ :`,
`POISON :`) → `W ARTHROPODE (MOYEN)` / `W` → `CRÉATURE VIVANTE TAILLE MOYENNE` → `| NC 3` → attributs en tableau avec
pipes → DEF/PV/Init préfixés → `Pinces +6 · DM 2d6+3` → `Dard +6 ·` / `DM 1d4 + poison (2d6, difficulté 12` /
`pour ½ ·` / `DM)`.

**Ce qui le distingue :** Cas le plus complexe. Le DM du Dard est reconstruit par une heuristique d'équilibrage de
parenthèses : `extra` final = `"+ poison (2d6, difficulté 12 pour ½ · DM)"`. Aucun diagnostic émis pour ce DM malformé.

---

### `scorpion-geant-capacites-avant-nc.txt` — capacités avant NC, format propre

| Champ                  | Valeur                                                                                       |
|------------------------|----------------------------------------------------------------------------------------------|
| NC                     | Présent                                                                                      |
| Position des capacités | Avant le NC, sans bruit pictogramme                                                          |
| Format des attaques    | Complètes sur une ligne (`· DM`)                                                             |
| Bruit PDF              | Minimal (`Capacités communes`)                                                               |
| Particularités         | Attributs sur une ligne sans pipes ; DEF/PV/Init avec préfixes courts (`DEF`, `PV`, `Init.`) |

**Ce qui le distingue :** Version propre du scorpion sans bruit pictogramme. Seul fixture qui active explicitement la
branche `preNcHasCapacity = true` dans la logique de sélection du nom (→ `nameIndex = 0`), sans le bruit de
`scorpion-geant.txt`.

---

### `archer-distance.txt` — attaque à distance avec portée

| Champ               | Valeur                                                                    |
|---------------------|---------------------------------------------------------------------------|
| NC                  | Présent                                                                   |
| Format des attaques | `Arc court (20m) +5 · DM 1d6`                                             |
| Bruit PDF           | Aucun                                                                     |
| Particularités      | Portée `(20m)` dans le nom de l'attaque → `kind = "ranged"`, `range = 20` |

**Ce qui le distingue :** Seul fixture où `rangeMatch` est activé dans `parseAttackLine`. Teste la détection du type
`ranged` via la portée parenthésée.

---

### `dragon-taille.txt` — taille colossale

| Champ               | Valeur                                                                          |
|---------------------|---------------------------------------------------------------------------------|
| NC                  | Présent (NC 12)                                                                 |
| Format des attaques | Standard                                                                        |
| Bruit PDF           | Aucun                                                                           |
| Particularités      | `taille colossale` — valeur maximale de `SIZES` ; catégorie `living` par défaut |

**Ce qui le distingue :** Seul fixture testant `size = "colossal"`. La créature n'est ni humanoïde, ni non-vivante, ni
végétale → catégorie `living` par défaut.

---

### `golem-rd.txt` — réduction des dégâts

| Champ               | Valeur                                                                               |
|---------------------|--------------------------------------------------------------------------------------|
| NC                  | Présent                                                                              |
| Format des attaques | Standard                                                                             |
| Bruit PDF           | Aucun                                                                                |
| Particularités      | `S Défense 18 (RD 5)` — RD sur la ligne Défense ; `non-vivante` → catégorie `undead` |

**Ce qui le distingue :** Seul fixture testant la capture de `damageReduction` via le `tail` regex après la valeur de
Défense, et la catégorie `undead`.

---

### `ombre-avertissements.txt` — bruit éditorial et diagnostics

| Champ               | Valeur                                                                                           |
|---------------------|--------------------------------------------------------------------------------------------------|
| NC                  | Présent                                                                                          |
| Format des attaques | Aucune attaque                                                                                   |
| Bruit PDF           | Non-PDF : `Notes du MJ` (bruit éditorial), `Un murmure parcourt la salle.` (texte atmosphérique) |
| Particularités      | `Notes du MJ` avant le nom ; capacité avec test de VOL                                           |

Structure : `Notes du MJ` (ligne 0) → `Ombre errante` (ligne 1) → `| NC 2` → type/taille → attributs →
`Un murmure parcourt la salle.` → `Toucher glacial :` avec description.

**Ce qui le distingue :** Seul fixture avec bruit éditorial *non-PDF* avant le nom. `"Notes du MJ"` passe dans
`scanPreNcLines` et atterrit silencieusement dans `result.notes` — sans diagnostic. Or le test assert
`byMessage(result.diagnostics, /Notes du MJ/)` : **discordance entre code et spécification de test** (voir fragilité
F9).

---

### `statblock-une-ligne.txt` — tout sur une seule ligne

| Champ               | Valeur                                                                        |
|---------------------|-------------------------------------------------------------------------------|
| NC                  | Présent (`NC 1/2`)                                                            |
| Format des attaques | Sur la seule ligne                                                            |
| Bruit PDF           | Aucun                                                                         |
| Particularités      | NC fractionné `1/2` → `nc = 0.5` ; tout reconstruit par `reconstructSegments` |

**Ce qui le distingue :** Stress-test de `reconstructSegments` — les trois fonctions `splitHeaderFields`,
`splitAttackChunks`, `splitTitleChunks` s'appliquent en cascade sur une seule ligne d'entrée.

---

## Partie 2 — Fragilités et hypothèses implicites du parseur

### F1 — `NC_LINE_RE` exige `|` si le nom est sur la même ligne

**Fichier :** `statblockParser.mjs` ligne 29 **Regex :** `NC_LINE_RE = /^(?:(.*?)\s*\|\s*)?NC\s*(\d+...)\b/`

Le groupe optionnel `(?:(.*?)\s*\|\s*)?` ne peut capturer un nom inline que si le `|` est présent. `Centaure NC 3` (sans
pipe) : le groupe avec `\|` échoue, la regex tente `^NC\s*3` sur une ligne qui commence par `C` → pas de match.
Résultat : la ligne entière est ignorée, la créature n'a pas de NC détecté.

**Point de rupture :** tout format Bestiaire qui place le NC sur la même ligne que le nom sans `|`.

---

### F2 — La sélection du nom suppose qu'il est à `ncIndex - 1`

**Fichier :** `statblockParser.mjs` lignes 68–70

```javascript
const nameIndex = preNcHasCapacity ? 0 : ncIndex - 1;
const nameLine = inlineName || lines[nameIndex];
```

Quand NC est présent sans nom inline et sans capacités structurées avant NC, le nom est supposé être la ligne
immédiatement avant `| NC X`. Si une ligne de type, de note ou de bruit se glisse entre le vrai nom et la ligne NC, le
mauvais texte est pris comme nom sans aucun diagnostic d'erreur.

**Point de rupture :** tout Bestiaire qui insère le type/taille ou une note entre le nom et la ligne NC.

---

### F3 — `ABILITY_RE` ignore silencieusement les modificateurs raciaux `(+N)`

**Fichier :** `statblockParser.mjs` ligne 30 ; visible dans `centaure-sans-nc.txt`

`| FOR +6 (+3) |` : `ABILITY_RE` capture `FOR +6`, le `(+3)` est ignoré sans trace. Aucun diagnostic
`UNSUPPORTED_AUTOMATION` n'est émis. L'information du modificateur racial disparaît.

**Point de rupture :** formats de Bestiaire qui affichent le bonus racial entre parenthèses après la valeur de base.

---

### F4 — Valeurs d'attribut sans signe non reconnues

**Fichier :** `statblockParser.mjs` ligne 30

`ABILITY_RE = /\b(FOR|AGI|...)\s*([+\-−–]\s*\d+)\s*(\*)?/g`

Le signe `+` ou `-` est obligatoire. `FOR 6` (sans signe) ne serait pas capturé → `MISSING_ABILITY` pour FOR.

---

### F5 — `ATTACK_RE` classe tout par défaut comme `melee`

**Fichier :** `statblockParser.mjs` lignes 186–193

La détection `ranged` exige soit `(Nm)` dans le nom, soit que le nom commence exactement par `attaque à distance`.
`magical` exige `attaque magique` en début de nom. Tout le reste est `melee` : arcs sans portée explicite, arbalètes,
javelots, haches de lancer, souffles à distance. L'arc long du Centaure est classé `melee` — documenté dans le test
comme comportement attendu, mais toute refactorisation de la classification casserait les assertions existantes.

---

### F6 — `mergeDmContinuation` exige exactement `DM` en début de ligne suivante

**Fichier :** `textReconstruction.mjs` ligne 68

`/^DM\b/i.test(next.trim())` — si les dégâts sont écrits `Dégâts 1d8`, `Dmg 2d6`, `Dommages 1d6` ou avec tout autre
libellé, la fusion n'a pas lieu. La ligne DM reste seule et `parseAttackLine("DM 1d8+6")` retourne `null` (aucun nom
avant le bonus) → la ligne est traitée comme bruit.

---

### F7 — DMs complexes multi-lignes reconstruits par décompte de parenthèses

**Fichier :** `statblockParser.mjs` lignes 133–136

La continuation d'une attaque s'appuie sur le décompte brut de `(` vs `)` dans `last.extra`. Pour le Dard du scorpion
avec `extra = "+ poison (2d6, difficulté 12"`, les lignes suivantes sont absorbées jusqu'à équilibrage. Si une ligne de
capacité suit immédiatement une attaque avec parenthèse non fermée, elle serait absorbée dans l'`extra` sans être
reconnue comme nouvelle capacité. Le résultat final (`extra = "+ poison (2d6, difficulté 12 pour ½ · DM)"`) contient
l'artefact PDF `DM)` sans diagnostic.

---

### F8 — `TITLE_RE` exclut les points, `!`, `?`, `\`, `[`, `@` des noms de capacité et limite à 7 mots

**Fichier :** `statblockParser.mjs` ligne 36

```javascript
TITLE_RE = /^([A-ZÀ-ÖØ-Þ][^:.!?\[@]{0,60}?)\s*:\s*(.*)$/
```

- `C.A.C. :`, `1 fois/combat :`, tout titre contenant un point dans le nom : non reconnu.
- Un titre de plus de 7 mots (`m[1].trim().split(/\s+/).length > 7`) est rejeté silencieusement (ligne 204).

---

### F9 — `scanPreNcLines` est asymétrique avec la boucle body pour le bruit générique

**Fichier :** `statblockParser.mjs` lignes 220–252

Dans la boucle body (section 4), toute ligne non reconnue génère `pdfNoiseRemoved(line, "warning")`. Dans
`scanPreNcLines`, les lignes non reconnues vont silencieusement dans `result.notes` — sauf `Capacités communes` qui a un
cas explicite. Le bruit éditorial pré-NC (`Notes du MJ`, textes introductifs) est invisible dans les diagnostics.

Cette asymétrie constitue aussi une **discordance code/test** : `statblockParser.test.mjs` assert
`byMessage(result.diagnostics, /Notes du MJ/)`, mais le code actuel pousse `"Notes du MJ"` dans `result.notes` sans
diagnostic.

---

### F10 — Détection de la catégorie incomplète

**Fichier :** `statblockParser.mjs` lignes 113–119

Seulement 3 catégories reconnues : `undead` (`non[- ]vivant`), `humanoid` (`humano`), `plant` (`végétal|plante`). Tout
le reste est `living` par défaut. Des créatures comme dragon, fée, élémentaire, démon, mort-vivant (si orthographié
autrement que `non-vivant`) seront toutes classées `living`.

---

### F11 — `NOISE_RUNNING_TITLE_RE` peut éliminer un nom de créature en caps avec tiret

**Fichier :** `textReconstruction.mjs` ligne 9

```javascript
NOISE_RUNNING_TITLE_RE = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 ]*\s-\s[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 ]*$/
```

`ARAIGNÉE GÉANTE - VARIANTE`, `LOUP-GAROU - ALPHA` — ces noms matcheraient le pattern et seraient **silencieusement
supprimés** avant même d'atteindre le parseur. Aucun diagnostic émis pour les suppressions de `stripPdfNoise`.

---

### F12 — `WORD_SHAPE` dans `ATTACK_START_RE` ne reconnaît pas les noms d'attaque en tout-majuscules

**Fichier :** `textReconstruction.mjs` ligne 17

```javascript
WORD_SHAPE = "[\\p{Lu}][\\p{Ll}'']*(?:\\s[\\p{Ll}][\\p{Ll}'']*)*"
```

Exige que seule la première lettre soit majuscule, les suivantes minuscules. `MORSURE +12`, `COUP DE PATTE +8` — non
détectés par `splitAttackChunks`. Si deux attaques en caps sont collées sur une ligne, elles ne sont pas séparées. Elles
restent détectables par `ATTACK_RE` si elles sont seules sur leur ligne, mais la reconstruction de lignes collées échoue
pour les formats tout-caps.

---

### F13 — `TITLE_START_RE` exclut les tirets et chiffres des noms de titre

**Fichier :** `textReconstruction.mjs` ligne 19

```javascript
TITLE_START_RE = /(?<=^|\s)([\p{Lu}][\p{L}' ]{0,40}?)\s*:(?=\s|$)/gu
```

`[\p{L}' ]` exclut `-` et `\d`. `Demi-tour :`, `Attaque 2 :`, `Corps-à-corps :` : non détectés par `splitTitleChunks` si
collés à une autre ligne.

---

### F14 — `splitHeaderFields` utilise `.match()` (premier match uniquement) par type de champ

**Fichier :** `textReconstruction.mjs` lignes 88–103

Chaque `HEADER_FIELD_MARKERS` est appliqué avec `.match()` — première occurrence uniquement. Si le même type de champ
apparaît deux fois dans la portion `rest` après NC (contenu collé mélangé), le second cut-point n'est pas détecté et le
champ reste fusionné au segment précédent.

---

### F15 — Capacité sans description absorbe le titre suivant

**Fichier :** `statblockParser.mjs` ligne 145

```javascript
const title = current && !current.description ? null : matchTitle(line);
```

Si une capacité n'a pas encore de description, `matchTitle` n'est pas tenté. Deux titres de capacité consécutifs sans
texte intermédiaire : le second est absorbé comme description du premier sous forme de texte brut. Certaines capacités
standardisées du Bestiaire pourraient ne pas avoir de description répétée dans le profil individuel.

---

### F16 — La RD est capturée uniquement au format `(RD N)` sur la ligne Défense

**Fichier :** `statblockParser.mjs` lignes 108–110

La RD doit apparaître immédiatement après la valeur de Défense sur la même ligne au format `(RD 5)`. Une RD sur une
ligne séparée, dans une capacité, ou avec un autre libellé (`résistance aux dommages 5`) n'est pas capturée dans
`result.damageReduction`.

---

### F17 — `FREQUENCY_RE` reconnaît seulement deux fréquences

**Fichier :** `capacityAutomation.mjs` ligne 9

`/\b1\s*fois\s*(?:\/|par)\s*(combat|jour)\b/i` — uniquement `1 fois/combat` et `1 fois/jour`. Les fréquences
`2 fois/combat`, `1 fois/round`, `1 fois par scène`, `1 fois par repos`, `X fois/jour` sont non reconnues →
`frequency = null` sans diagnostic.

---

### F18 — Duplication silencieuse d'attribut

**Fichier :** `statblockParser.mjs` lignes 97–99

`result.abilities[m[1].toLowerCase()] = ...` — si `ABILITY_RE` trouve le même attribut deux fois (collage accidentel de
deux blocs de stats), la seconde valeur écrase la première sans diagnostic.

---

### F19 — `cleanName` retire les préfixes d'une seule lettre majuscule

**Fichier :** `textUtils.mjs` ligne 16

```javascript
const cleanName = (raw) => tidyCase(raw.replace(/^(?:[A-Z]\s+)+(?=\S{2,})/, "").trim());
```

Un nom qui commencerait légitimement par une initiale (`A. Something`) verrait son préfixe retiré. En pratique les noms
COF2 n'utilisent pas d'initiales, mais c'est une hypothèse implicite non vérifiée.

---

### F20 — `preNcHasCapacity` n'est actif que pour les titres structurés avec `:`

**Fichier :** `statblockParser.mjs` ligne 68

```javascript
const preNcHasCapacity = lines.slice(1, ncIndex).some((line) => matchTitle(line));
```

Si des capacités avant NC ne contiennent pas de `:` dans leur titre (noms de capacité sans description inline), elles ne
sont pas reconnues par `matchTitle` → `preNcHasCapacity = false` → `nameIndex = ncIndex - 1`. Le nom serait alors la
description de la dernière capacité avant NC.

---

## Synthèse — Hypothèses implicites les plus risquées

| #   | Hypothèse implicite                                   | Conséquence si violée                    | Fixtures testant ce cas                |
|-----|-------------------------------------------------------|------------------------------------------|----------------------------------------|
| F1  | `\| NC X` toujours avec pipe                          | NC non détecté, nom manquant             | Aucune                                 |
| F2  | Nom toujours à `ncIndex - 1`                          | Mauvais nom sans diagnostic              | Aucune                                 |
| F3  | Pas de modificateur racial `(+N)`                     | Information perdue silencieusement       | `centaure-sans-nc.txt` (non testé)     |
| F9  | Bruit pré-NC visible dans diagnostics                 | Discordance test/code pour `Notes du MJ` | `ombre-avertissements.txt`             |
| F11 | Titres courants ≠ noms de créature en caps avec ` - ` | Nom supprimé silencieusement             | Aucune                                 |
| F12 | Noms d'attaque jamais en tout-majuscules              | Attaques collées non séparées            | Aucune                                 |
| F7  | Parenthèses dans DMs complexes équilibrées rapidement | `extra` corrompu ; capacité absorbée     | `scorpion-geant.txt` (partiel)         |
| F15 | Chaque capacité a toujours une description            | Deux titres consécutifs fusionnés        | Aucune                                 |
| F5  | Toute arme avec portée a `(Nm)` dans le nom           | Classification `kind` incorrecte         | `centaure.txt` (arc = melee documenté) |
| F10 | Seules 3 catégories à identifier                      | Dragons, fées, démons classés `living`   | `dragon-taille.txt` (living = OK ici)  |
