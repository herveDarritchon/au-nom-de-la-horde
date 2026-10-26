# Au Nom de la Horde — Warbound pour Foundry VTT

Documentation du module Foundry `warbound-campaign-content` : publication des compendiums, gestion de la bibliothèque musicale externe, outils MJ (météo) et importateurs COF2/Warbound. Les sources des compendiums sont dans `compendiums/` ; les packs dans `packs/` sont générés.

## Sommaire

- [Processus de release](#-processus-de-release)
- [Bibliothèque musicale externalisée et migration hors de Git LFS](#-bibliothèque-musicale-externalisée-et-migration-hors-de-git-lfs)
- [Pipeline d'optimisation des images](#-pipeline-doptimisation-des-images)
- [Générateur de météo](#️-générateur-de-météo)
- [Importateur de rencontres COF2](#-importateur-de-rencontres-cof2)
- [Importateur Warbound Markdown](#-importateur-warbound-markdown)

---

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
```

> **À distinguer de la bibliothèque musicale :** cette chaîne concerne la release du module principal. La bibliothèque OGG est publiée séparément comme ressource du module `au-nom-de-la-horde-audio`.

---

## 🎵 Bibliothèque musicale externalisée et migration hors de Git LFS

Cette section documente la distribution des musiques utilisées par **Au Nom de la Horde**. L'objectif est de conserver les pistes musicales disponibles dans Foundry VTT tout en évitant de les intégrer au dépôt Git et aux archives de mise à jour du module principal.

### Architecture et conventions

| Élément | Valeur |
|---|---|
| Dépôt principal | `warbound-campaign-content` |
| ID Foundry principal | `warbound-campaign-content` |
| Dépôt audio | [`herveDarritchon/au-nom-de-la-horde-audio`](https://github.com/herveDarritchon/au-nom-de-la-horde-audio) |
| ID Foundry audio | `au-nom-de-la-horde-audio` |
| Bibliothèque musicale | `assets/musics/ambient/` (`durotar/` et `official/`) |
| Contenu au moment de la migration | 56 OGG, environ 555 Mio |
| Release audio initiale | [`v1.0.0`](https://github.com/herveDarritchon/au-nom-de-la-horde-audio/releases/tag/v1.0.0) |
| Manifeste de distribution | [`module.json` de la dernière release audio](https://github.com/herveDarritchon/au-nom-de-la-horde-audio/releases/latest/download/module.json) |

Deux modules Foundry coexistent :

```text
Dépôt principal                              Dépôt audio
warbound-campaign-content/                   au-nom-de-la-horde-audio/
├── module.json (requires → module audio)    ├── module.json (dans la release)
├── compendiums/ (YAML, sources de vérité)    ├── assets/musics/ambient/ (sources locales ignorées par Git)
├── packs/ (LevelDB généré)                  ├── tools/releaseAudio.mjs
└── tools/                                    └── dist/audio-release/ (archives locales ignorées par Git)
       │                                                │
       └── release Warbound (code + packs)               └── GitHub Release audio (ZIP + manifeste)
                         └──────── installation des deux modules dans Foundry ────────┘
```

Les chemins musicaux contenus dans les compendiums sources doivent pointer vers le module audio :

```text
Avant : modules/warbound-campaign-content/assets/musics/ambient/official/012-durotar-original-wow-music.ogg
Après : modules/au-nom-de-la-horde-audio/assets/musics/ambient/official/012-durotar-original-wow-music.ogg
```

Le nom du fichier et les sous-répertoires `durotar/` et `official/` ne changent pas. Le fichier `module.json` du module principal doit déclarer **`au-nom-de-la-horde-audio` dans `relationships.requires`**, tandis que `co2` reste dans `systems` et `item-piles` dans `recommends`.

### Prérequis de développement

- Node.js et pnpm configurés conformément au projet (`packageManager` : `pnpm@11.24.0` dans le `package.json` fourni).
- Les scripts du dépôt principal `tools/auditMusicPaths.mjs`, `tools/checkMusicIntegration.mjs` et `tools/checkMusicLfs.mjs` doivent être présents pour les commandes décrites ci-dessous.
- Pour vérifier l'existence réelle des pistes, le dépôt audio doit être accessible par défaut à `../au-nom-de-la-horde-audio` ; sinon, renseigner explicitement son emplacement.
- Pour publier les releases audio : GitHub CLI (`gh`) authentifié, dans le **dépôt audio**. Aucun accès réseau n'est nécessaire pour les contrôles locaux du dépôt principal.

### Catalogue des commandes `pnpm` du dépôt principal

Les **18 scripts existants** sont conservés ; les **9 commandes suivantes** complètent le `package.json` enrichi :

| Commande | Action | Modifie des fichiers ? |
|---|---|---|
| `pnpm media:music:refs:audit` | Recherche les anciens chemins `modules/warbound-campaign-content/assets/musics/ambient/` dans les fichiers texte éligibles | Non |
| `pnpm media:music:refs:check` | Même recherche, avec **code de sortie non nul** si une ancienne référence est détectée (utile en CI) | Non |
| `pnpm media:music:refs:write` | Remplace les anciennes références par `modules/au-nom-de-la-horde-audio/assets/musics/ambient/` | **Oui**, fichiers texte |
| `pnpm media:music:module:check` | Contrôle le manifeste Foundry et vérifie les OGG référencés si le dépôt audio voisin est présent | Non |
| `pnpm media:music:module:fix` | Déplace/maintient l'entrée audio dans `relationships.requires` sans enlever `co2` ni `item-piles` | **Oui**, `module.json` |
| `pnpm media:music:assets:check` | Exige la présence du dépôt audio local et vérifie les fichiers OGG référencés par les sources | Non |
| `pnpm media:music:lfs:status` | Affiche l'état du suivi Git/LFS des musiques ; aucune suppression | Non |
| `pnpm media:music:verify` | Enchaîne `refs:check` puis `module:check` | Non |
| `pnpm build:verified` | Enchaîne `media:music:verify`, `build` et `test` | **Oui**, packs générés par `build` |

**Nuance importante :** `media:music:module:check` et `media:music:verify` peuvent réussir **sans dépôt audio voisin**, avec un avertissement : les OGG ne sont alors pas vérifiés sur disque. Utiliser `media:music:assets:check` lorsqu'une validation stricte de la présence des fichiers est souhaitée. Ces commandes ne contactent pas GitHub pour vérifier les assets de release distants.

Les commandes historiques continuent de fonctionner. Parmi les plus utiles :

| Commande existante | Usage |
|---|---|
| `pnpm packs:audit` | Audit des chemins de ressources du projet |
| `pnpm packs:build` | Compilation YAML → LevelDB (`packs/`) |
| `pnpm build` | `packs:audit` puis `packs:build` |
| `pnpm test` | Exécution des tests Node.js |
| `pnpm media:scan` | Inventaire des médias |
| `pnpm media:optimize:audio` | Simulation d'optimisation audio, sans écriture |
| `pnpm media:optimize:audio:write` | Optimisation audio avec écriture : contrôler les fichiers modifiés |

### Parcours de validation — dépôt principal

Exécuter depuis la racine de `warbound-campaign-content` :

```bash
# 1. Vérifier qu'aucun ancien chemin vers le module principal ne subsiste.
pnpm media:music:refs:check

# 2. Corriger, si nécessaire, la dépendance audio du manifeste (opération d'écriture).
pnpm media:music:module:fix

# 3. Vérifier les références musicales et leur présence dans le dépôt voisin.
pnpm media:music:assets:check

# 4. Compiler les compendiums et exécuter les tests.
pnpm build:verified

# 5. Inspecter les différences produites et le suivi des fichiers.
git status --short
git diff --stat
git diff -- module.json package.json compendiums/

# 6. Consulter l'état de la migration LFS (lecture seule).
pnpm media:music:lfs:status
```

Si l'audit des chemins trouve encore des références obsolètes, examiner son rapport puis lancer `pnpm media:music:refs:write` et contrôler `git diff`. L'ancienne migration a identifié **trois références** réparties entre le codex de campagne et deux playlists (`Durotar voyage`, `Landing page`) ; un nouvel audit après correction avait trouvé **zéro occurrence résiduelle**. Ce résultat concerne uniquement les sources textuelles examinées.

Pour vérifier les fichiers audio situés ailleurs que dans le dossier voisin par défaut :

```bash
node tools/checkMusicIntegration.mjs \
  --audio-root /chemin/vers/au-nom-de-la-horde-audio \
  --require-audio-root
```

**Compilation et données Foundry :** `compendiums/` contient les sources YAML ; `packs/` est régénéré par `pnpm packs:build`. Une modification du YAML ne met **pas** à jour une playlist déjà importée dans un monde Foundry : tester sur une copie de monde, puis migrer les documents déjà importés séparément.

**Limite des audits :** `pnpm packs:audit` est un script historique distinct. S'il signale les chemins du module audio comme fichiers manquants dans le dépôt principal, il faudra mettre à jour sa logique de résolution des références externes, sans supprimer globalement ces contrôles.

### Publier une version musicale — dépôt audio exclusivement

Les commandes ci-dessous s'exécutent depuis `au-nom-de-la-horde-audio` et **non** depuis le dépôt principal :

```bash
# Contrôler les sources musicales locales.
node tools/releaseAudio.mjs --check

# Construire localement une NOUVELLE version de l'archive.
node tools/releaseAudio.mjs --version 1.0.1

# Vérifier le ZIP et le manifeste générés.
unzip -tq dist/audio-release/v1.0.1/au-nom-de-la-horde-audio.zip
unzip -p dist/audio-release/v1.0.1/au-nom-de-la-horde-audio.zip module.json | jq .

# Publier seulement après validation technique et des droits de distribution.
node tools/releaseAudio.mjs --version 1.0.1 --publish

# Confirmer les deux assets de la release sur GitHub.
gh release view v1.0.1 \
  --repo herveDarritchon/au-nom-de-la-horde-audio \
  --json assets --jq '.assets[] | [.name, .size] | @tsv'
```

La version audio **`v1.0.0` a déjà été publiée**, selon le journal de publication. Ne pas republier ce tag pour une nouvelle évolution. Le script conserve une archive locale existante lorsque son contrôle la juge réutilisable ; les tags de release doivent rester cohérents avec la version et l'URL `download` de leur manifeste.

Dans le dépôt audio, exclure de Git les sources musicales locales et les archives de distribution :

```gitignore
/assets/musics/ambient/
/dist/audio-release/
```

**Note sur la redistribution :** les noms de fichiers fournis suggèrent des musiques originales de *World of Warcraft*. Une publication publique doit être couverte par les autorisations ou licences nécessaires ; une release techniquement valide n'établit pas ces droits.

### Finaliser le retrait de Git LFS — après les tests Foundry

Avant toute suppression de l'index Git, vérifier dans Foundry que le module audio s'installe depuis son manifeste, que Warbound reconnaît la dépendance, que les packs reconstruits pointent vers les nouveaux chemins et que les playlists fonctionnent réellement. Tester également une copie de monde contenant des playlists anciennement importées.

Puis, **uniquement dans le dépôt principal** :

```bash
# État du suivi avant modification.
pnpm media:music:lfs:status

# Ajouter cette règle à .gitignore, si elle n'existe pas déjà :
# /assets/musics/ambient/

# Examiner .gitattributes et retirer/adapter les règles LFS qui ne sont plus utiles
# sans casser les éventuels autres fichiers encore suivis par LFS.

# Retirer les musiques de l'index Git, sans les effacer du disque local.
git rm -r --cached -- assets/musics/ambient/

# Vérifier explicitement les suppressions indexées.
git status --short
git diff --cached --stat

# Vérifier qu'aucune musique n'est encore suivie.
git ls-files assets/musics/ambient/
git lfs ls-files
```

**Ne pas committer à l'aveugle :** vérifier les chemins listés par `git lfs ls-files`, préserver les autres fichiers utilisant LFS et s'assurer que `.gitignore` et `.gitattributes` ont bien été adaptés. Un `git rm --cached` n'efface pas les anciens objets LFS déjà conservés côté GitHub et ne réduit donc pas automatiquement le stockage historique facturé.

**Contrôler les releases du module principal :** des fichiers ignorés par Git peuvent rester présents dans le répertoire de travail et être inclus par un `zip`/`tar` exécuté sans filtrage. Inspecter le workflow GitHub Actions et vérifier que l'archive `module.zip` du module principal n'embarque plus `assets/musics/ambient/`. Les releases audio demeurent indépendantes des releases de code.

```bash
rg -n 'lfs:|git lfs|assets/musics/ambient|upload-artifact|zip|tar' .github/workflows tools package.json
```

### Diagnostic rapide

| Symptôme | Vérification |
|---|---|
| `media:music:refs:check` échoue | Lancer `refs:audit`, corriger les YAML/scripts, puis relancer le contrôle |
| `media:music:module:check` échoue | Inspecter `module.json`, utiliser `module:fix` puis relire le diff |
| `media:music:assets:check` indique des OGG manquants | Vérifier le dépôt audio voisin, le chemin `--audio-root` et les noms exacts |
| `pnpm build:verified` échoue au stade `packs:audit` | Examiner l'auditeur des ressources externes avant de le modifier |
| Les packs sont corrects mais une playlist de monde reste cassée | La playlist importée possède encore l'ancien chemin ; la migrer dans le monde |
| Le ZIP principal reste volumineux | Vérifier l'empaquetage du workflow, pas seulement `.gitignore` |
| Les alertes Git LFS persistent | Vérifier la facturation et les anciens objets côté GitHub ; le retrait de l'index ne purge pas l'historique |

---

## 🖼️ Pipeline d'optimisation des images

Le module intègre un pipeline de conversion et d'optimisation des assets médias : PNG → WebP, OGG (ré-encodage), MP4/MOV → WebM. L'ensemble est idempotent : relancer deux fois ne produit aucune modification supplémentaire.

### Architecture du pipeline

```text
assets/ (PNG, OGG, MP4/MOV)
        ↓
   pnpm media:scan         # inventaire des médias
        ↓
   convertImages           # PNG → WebP (Sharp)
        ↓
   optimizeAudio           # OGG ré-encodé via FFmpeg
        ↓
   convertVideos           # MP4/MOV → WebM VP9
        ↓
   migrateRefs             # mise à jour des références YAML/CSS/JS
        ↓
   pnpm build              # recompilation packs LevelDB
        ↓
   cleanupPng              # suppression PNG devenus inutiles
```

### Profils de qualité WebP

Les profils sont définis dans `tools/media.config.mjs` et attribués automatiquement selon le chemin de l'asset :

| Répertoire | Profil | Qualité |
|---|---|---|
| `assets/ui/` | `ui` | 92, avec perte |
| `assets/images/icons/` | `icon` | sans perte (lossless) |
| `assets/images/tokens/`, `frames/` | `token` | 87, avec perte |
| `assets/images/avatar/` | `portrait` | 85, avec perte |
| `assets/images/illustrations/`, `elements/`, `pages/` | `illustration` | 82, avec perte |
| `assets/images/battlemaps/`, `maps/`, `landing-page/maps/` | `map` | 88, avec perte |
| autres | `default` | 85, avec perte |

**Garde-fou :** si le WebP produit est plus lourd que le PNG source, le PNG est conservé et rien n'est écrit.

Les vignettes de scènes Foundry (`assets/scenes/thumb-*.webp`) sont détectées et systématiquement ignorées.

### Catalogue des commandes `pnpm`

| Commande | Action | Modifie des fichiers ? |
|---|---|---|
| `pnpm media:scan` | Inventaire complet des médias (images, audio, vidéo, références) | Non |
| `pnpm media:optimize` | Dry-run global : projette les conversions sans écrire | Non |
| `pnpm media:optimize:dry-run` | Identique à `media:optimize` | Non |
| `pnpm media:convert:images` | Dry-run images uniquement | Non |
| `pnpm media:optimize:video` | Dry-run vidéo uniquement | Non |
| `pnpm media:optimize:audio` | Dry-run audio uniquement | Non |
| `pnpm media:optimize:audio:write` | Ré-encode les OGG via FFmpeg | **Oui**, fichiers OGG |
| `pnpm media:optimize:video:write` | Convertit les vidéos en WebM | **Oui**, fichiers WebM |

Pour le pipeline complet (images + audio + vidéo + migration des références + nettoyage) :

```bash
# Projeter sans écrire
pnpm media:optimize

# Appliquer (conversion + migration des références YAML/CSS/JS)
node tools/mediaOptimize.mjs --write --update-references

# Appliquer + nettoyage des PNG devenus inutiles (aperçu d'abord)
node tools/mediaOptimize.mjs --clean
node tools/mediaOptimize.mjs --write --update-references --clean --confirm
```

### Options avancées de `mediaOptimize.mjs`

```bash
node tools/mediaOptimize.mjs [options]

  --dry-run              Projette sans écrire (défaut).
  --write                Applique les modifications.
  --type images|audio|video|all
                         Limite au type indiqué (défaut : all).
  --quality <n>          Override global de la qualité WebP (0-100).
  --update-references    Migre les références YAML/CSS/JS après conversion.
  --clean                Liste les PNG candidats à la suppression (dry-run).
  --clean --confirm      Supprime les PNG validés (WebP valide, refs migrées, Git propre).
  --force-clean          Contourne la garde Git (CI ou post-squash).
  -h, --help             Affiche l'aide.
```

### Gardes cumulatives du nettoyage PNG

Un PNG n'est supprimé que si **toutes** les conditions suivantes sont réunies (dans l'ordre) :

1. **Git propre** — dépôt sans modifications non commitées (sauf `--force-clean`)
2. **Pas de collision** — deux sources différentes ne produisent pas le même WebP
3. **WebP valide** — le WebP est lisible par Sharp
4. **WebP plus petit** — le WebP est strictement plus petit que le PNG source
5. **Aucune référence résiduelle** — aucun YAML/CSS/JS ne pointe encore vers ce PNG

### Manifeste de conversion

Après `--write`, un fichier `conversion-manifest.json` trace les réglages appliqués et les empreintes des sources. À la prochaine exécution, un WebP déjà à jour (même source, même profil) est ignoré. Un WebP produit par un outil tiers (sans entrée dans le manifeste) est également conservé sans réencodage.

### Rapport JSON

Chaque exécution produit un rapport détaillé dans `reports/media-optimize-<horodatage>.json` : statistiques par profil, économies en octets, liste des PNG conservés avec motif, erreurs éventuelles.

### Diagnostic rapide

| Symptôme | Vérification |
|---|---|
| WebP plus lourd signalé | Normal sur icônes très simples ; le PNG est conservé automatiquement |
| PNG non supprimé après `--clean --confirm` | Vérifier `reports/` → colonne `keptPng` avec motif (`no_webp`, `collision`, `webp_invalid`, `webp_larger`, `refs_remaining`) |
| `media:optimize:audio` ne trouve pas FFmpeg | Installer FFmpeg et vérifier qu'il est dans le `PATH` |
| Références non migrées | Relancer avec `--update-references` ; vérifier `compendiums/`, `styles/`, `scripts/`, `src/` |
| Vignettes Foundry converties par erreur | Elles suivent le motif `assets/scenes/thumb-*.webp` — vérifier que `FOUNDRY_THUMBNAIL_PATTERN` dans `media.config.mjs` couvre bien le cas |

---

## 🌦️ Générateur de météo

Le générateur propose au MJ une météo pour la zone **Durotar**. Il ne suit pas automatiquement le temps de la partie : utilisez-le au début d'une journée en jeu, ou avant une scène où la météo doit être connue. Les joueurs ne voient la météo que lorsque le MJ la publie dans le chat.

### Préparer la zone

La configuration de zone n'a pas encore d'interface. Avant la première utilisation, connectez-vous comme MJ, ouvrez la console du navigateur (`F12`) et exécutez une fois :

```javascript
await game.modules.get("warbound-campaign-content").api.weather.setZoneConfig("durotar", {
  id: "durotar",
  name: "Durotar",
  biome: "arid",
  season: "summer",
  weather: "active",
});
```

Choisissez le biome et la saison correspondant à la région et au moment de l'année dans votre partie. Cette configuration est enregistrée dans les paramètres du monde Foundry. Pour la modifier plus tard, réexécutez la commande avec les nouvelles valeurs. Si le module vient d'être mis à jour, rechargez la partie avant d'utiliser cette commande.

### Utiliser la météo pendant la partie

1. Dans les contrôles de scène, cliquez sur l'outil **Météo** (visible uniquement par le MJ).
2. Cliquez sur **Jour suivant** pour générer la météo du jour. Le premier clic crée l'état initial ; les suivants font avancer la météo en tenant compte de l'état précédent et de l'historique.
3. Si vous souhaitez un autre résultat pour le jour courant, cliquez sur **↻**. Cela relance le tirage sans ajouter une journée à l'historique.
4. Cliquez sur **Publier dans le chat** quand vous voulez partager la météo avec les joueurs.
5. Un **événement possible** peut accompagner certaines conditions météo. C'est une suggestion de mise en scène, sans effet automatique ; cliquez sur **Ignorer** pour masquer cette proposition.

La météo est sauvegardée dans les paramètres du monde Foundry et reste disponible après fermeture ou rechargement. Ouvrir la fenêtre ne génère rien : seul **Jour suivant** ou **↻** lance un tirage.

### Créer une macro pour ouvrir la fenêtre

Il n'y a pas de macro précréée, mais l'API du module permet d'en créer une facilement : créez une macro de type **Script** et utilisez ce contenu :

```javascript
game.modules.get("warbound-campaign-content").api.weather.openWeatherDialog();
```

La macro ouvre la fenêtre météo ; utilisez ensuite **Jour suivant** pour générer la météo du jour.

### Limites actuelles

- L'interface utilise actuellement la zone `durotar`, quelle que soit la scène active. Le changement de scène ne sélectionne pas une autre zone.
- La configuration se fait par la console Foundry ; il n'existe pas encore d'interface pour créer ou modifier des zones.
- La macro ouvre la fenêtre, mais ne génère pas la météo à elle seule : cliquez sur **Jour suivant** pour lancer le tirage.

### Intégration Simple Calendar Reborn

Le module peut avancer automatiquement la météo lors d'un changement de date dans **[Simple Calendar Reborn](https://foundryvtt.com/packages/foundryvtt-simple-calendar-reborn)**.

#### Prérequis

- Simple Calendar Reborn installé et activé dans le monde.
- Zone météo configurée (voir « Préparer la zone » ci-dessus).

#### Activer l'intégration

Dans **Paramètres de partie → Paramètres des modules → Warbound Campaign Content**, deux options sont disponibles :

| Paramètre | Défaut | Rôle |
|---|---|---|
| **Intégration Simple Calendar** | off | Active l'avance automatique de la météo lors d'un changement de date. |
| **Publication automatique lors de l'avance** | off | Publie un message de chat météo pour chaque zone à chaque avance automatique. |

#### Fonctionnement

Lorsque l'intégration est activée et que Simple Calendar avance d'au moins un jour, `WeatherEngine.next()` est appelé pour chaque zone active. Le résultat est identique à un clic manuel sur **Jour suivant** dans le dialogue météo.

> **Note** : le premier changement de date après le chargement du monde calibre le point de départ sans avancer la météo. La deuxième avance et les suivantes déclenchent bien la mise à jour.

Les avances d'heure (sans changement de jour) et les reculs de date ne déclenchent pas d'avance météo.

#### Vérification

1. Ouvrir la console navigateur (F12) au `ready` et vérifier la présence du message :
   ```
   warbound-campaign-content | Intégration Simple Calendar activée
   ```
2. Avancer d'un jour dans Simple Calendar → la météo doit se mettre à jour dans le dialogue météo.
3. Si **Publication automatique** est activée, un message météo doit apparaître dans le chat.

Si le message de confirmation est absent, vérifier :

```javascript
// Dans la console Foundry
game.modules.get('foundryvtt-simple-calendar-reborn')?.active  // doit retourner true
game.settings.get('warbound-campaign-content', 'simpleCalendarIntegration')  // doit retourner true
```

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
