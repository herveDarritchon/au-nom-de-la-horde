# Epic — Importateur COF2 de statblocks issus de PDF

> **Projet :** module Foundry VTT / Warbound  
> **Cible technique :** Foundry VTT v14 — système Chroniques Oubliées 2 v2.1.x  
> **Statut :** cadrage fonctionnel et technique  
> **Nature :** évolution majeure  
> **Nom de travail :** `COF2 Statblock Importer`

---

# 1. Résumé

L’objectif est d’intégrer au module un **importateur robuste de statblocks COF2 provenant d’un texte extrait ou copié depuis un PDF**, capable de :

1. reconstruire un statblock malgré les artefacts du PDF ;
2. analyser ses statistiques, attaques et capacités ;
3. rechercher les objets COF2 déjà existants ;
4. réutiliser les objets compatibles sans les dupliquer ;
5. créer les objets manquants lorsque cela est nécessaire ;
6. assembler un acteur Foundry de type **Rencontre** immédiatement exploitable ;
7. présenter au MJ les ambiguïtés avant création plutôt que de fabriquer silencieusement des données incertaines.

L’import ne doit plus être une macro « tout ou rien ». Il devient une vraie fonctionnalité du module, avec un **pipeline d’import**, un **modèle intermédiaire**, une **bibliothèque d’objets**, une **interface de prévisualisation/correction** et une **stratégie de validation**.

La priorité n’est pas de « comprendre n’importe quel texte avec de l’IA ». La priorité est d’être **déterministe, testable, fiable et explicable** sur les formats COF2 réellement utilisés.

---

# 2. Point de départ

Le prototype actuel prouve déjà que l’approche est viable.

La macro sait actuellement :

- analyser un seul statblock collé ;
- créer un acteur `encounter` ;
- renseigner NC, caractéristiques, DEF, PV, initiative, RD, catégorie et taille ;
- créer des objets `attack` embarqués ;
- rechercher certaines capacités dans le compendium `cof2-base.cof-2-base-items` ;
- ajouter les capacités officielles avec `actor.addCapacity(...)` ;
- créer les capacités inconnues comme objets `capacity` textuels ;
- produire des erreurs bloquantes et des avertissements ;
- exposer `parseStatblock` hors Foundry pour les tests Node.

C’est une excellente base, mais la macro actuelle mélange encore :

**extraction → parsing → résolution de compendium → création Foundry → UX.**

L’Epic doit découpler ces responsabilités.

---

# 3. Problème à résoudre

Le problème principal n’est pas la structure théorique du statblock COF2.

Le problème principal est que **le texte issu d’un PDF n’est pas un texte structuré**.

Exemple réel avec le Centaure :

```text
Sabots +7 ·
DM 1d8+6
Épée longue +7 ·
DM 1d8+3
Arc long +4 ·
DM 1d8
```

Pour un humain, il existe trois attaques.

Pour le parseur actuel, les lignes `DM 1d8+6`, `DM 1d8+3` et `DM 1d8` sont des lignes indépendantes et deviennent donc des avertissements.

Le PDF peut également injecter :

```text
0
INTRO
1
BESTIARE - CENTAURE
```

ou couper un mot :

```text
pié-
tine
```

ou au contraire extraire tout l’en-tête et toutes les attaques sur une seule ligne :

```text
(S)DEF 15 (V)PV 30 (I)Init. 14 Sabots +7 · DM 1d8+6 Épée longue +7 · DM 1d8+3 Arc long +4 · DM 1d8
```

Le système cible doit donc **reconstruire la structure logique avant de chercher à comprendre le contenu**.

---

# 4. Décision structurante : ne pas commencer par importer le fichier PDF lui-même

Pour la première version de l’Epic, **« import depuis un PDF » signifie : import d’un texte provenant d’un PDF**.

Le périmètre v1 doit rester :

> **copier le statblock dans le PDF → coller dans l’importateur → prévisualiser → corriger si nécessaire → créer.**

L’ouverture directe d’un fichier PDF dans Foundry, l’extraction automatique d’une page, la détection des colonnes et l’OCR constituent un autre problème technique.

Ils ne doivent pas être mélangés au cœur de cette Epic.

## Phase ultérieure possible

Une phase 2 pourra fournir :

- sélection d’un fichier PDF ;
- extraction par `pdf.js` lorsque le texte est réellement présent ;
- sélection d’une page ou d’une zone ;
- envoi du texte extrait vers **exactement le même pipeline d’import**.

Ainsi, le parseur métier ne dépend pas de la manière dont le texte a été obtenu.

---

# 5. Objectifs

## Objectifs principaux

### O1 — Importer de manière fiable les statblocks COF2

Le système doit reconnaître les statblocks présents dans :

- le Livre des règles ;
- le Bestiaire ;
- les productions Warbound respectant le format COF2 ;
- des textes copiés depuis un PDF avec des retours à la ligne imparfaits.

### O2 — Produire un acteur Rencontre réellement utilisable

L’acteur créé doit contenir :

- identité ;
- type et taille ;
- NC ;
- caractéristiques ;
- dés bonus éventuels ;
- DEF ;
- PV ;
- initiative ;
- RD si présente ;
- notes utiles ;
- attaques ;
- capacités.

### O3 — Réutiliser le contenu déjà présent

L’importateur doit chercher en priorité :

1. dans les objets officiels COF2 disponibles ;
2. dans la bibliothèque d’import du monde ;
3. éventuellement dans les compendiums Warbound configurés.

Un objet existant compatible doit être réutilisé.

### O4 — Créer les objets manquants

Une capacité absente du catalogue ne doit plus être seulement un bloc de texte perdu dans l’acteur.

Elle doit pouvoir devenir un véritable objet COF2 réutilisable, avec au minimum :

- nom ;
- type `capacity` ;
- description ;
- temps d’action lorsqu’il est identifiable ;
- fréquence lorsqu’elle est identifiable ;
- provenance ;
- état de validation.

### O5 — Ne jamais inventer silencieusement une mécanique

Une information incertaine doit apparaître comme :

- ambiguë ;
- incomplète ;
- nécessitant validation.

L’importateur ne doit jamais transformer une phrase complexe en automatisation Foundry s’il n’est pas suffisamment sûr de son interprétation.

---

# 6. Non-objectifs de la première version

La v1 ne cherche pas à :

- OCRiser les pages scannées ;
- importer un livre complet en un clic ;
- reconnaître n’importe quelle mise en page de JdR ;
- traduire automatiquement un bestiaire D&D, Pathfinder ou Warcraft vers COF2 ;
- générer une mécanique COF2 à partir d’un texte narratif qui n’en contient pas ;
- automatiser 100 % du langage naturel des capacités ;
- modifier les compendiums officiels `cof2-base` ;
- attacher une Voie directement à une feuille Rencontre si le système COF2 ne le supporte pas.

---

# 7. Contrainte COF2 importante : Rencontre, Capacité et Voie

Dans le système COF2 v2.1.0 :

- une feuille **Rencontre** accepte des objets **Capacité** ;
- une feuille **Rencontre** accepte des objets **Attaque de rencontre** ;
- une Capacité est le même type d’objet pour un Personnage ou une Rencontre ;
- une **Voie ne peut actuellement pas être ajoutée à une feuille Rencontre** ;
- le guide indique que le support des Voies de créature sur les Rencontres est prévu comme évolution future.

## Conséquence d’architecture

L’importateur peut connaître et créer une **Voie de créature dans sa bibliothèque**, mais il ne doit pas dépendre de son attachement à l’acteur.

Pour une Rencontre, la v1 doit matérialiser :

- les attaques comme `attack` ;
- les capacités comme `capacity` embarquées/apprises.

Si une capacité provient conceptuellement d’une Voie de créature, cette provenance peut être conservée dans les métadonnées d’import.

Le jour où COF2 acceptera réellement les Voies sur les Rencontres, une migration pourra reconstruire les relations sans réécrire le parseur.

---

# 8. Expérience utilisateur cible

## Entrée dans la fonctionnalité

Ajouter une commande de module, par exemple :

**Warbound → Importer une rencontre COF2**

ou un bouton disponible depuis le répertoire des Acteurs.

## Étape 1 — Source

Grande zone de texte :

> « Collez ici un statblock COF2 provenant du Livre des règles, du Bestiaire ou d’un autre document compatible. »

Actions :

- **Analyser**
- **Effacer**
- éventuellement **Charger un exemple**

## Étape 2 — Prévisualisation

Afficher un formulaire éditable avant toute création.

### Identité

- Nom
- NC
- Catégorie
- Taille

### Statistiques

- FOR / AGI / CON / PER / CHA / INT / VOL
- indication du dé bonus
- DEF
- PV
- Initiative
- RD

### Attaques

Une ligne par attaque :

| État | Nom | Type | Attaque | DM | Portée | Texte complémentaire |
|---|---|---|---:|---|---|---|

Le MJ peut corriger chaque champ.

### Capacités

| État | Capacité source | Résolution | Action | Fréquence | Cible |
|---|---|---|---|---|---|
| ✓ | Attaque double | Nouvelle capacité | A | — | bibliothèque |
| ⚠ | Charge | variante d’un modèle connu | L | — | nouvelle variante |
| ✓ | Hybride | Nouvelle capacité | — | — | bibliothèque |
| ✓ | Discret | Nouvelle capacité | — | — | bibliothèque |

### Diagnostics

Trois niveaux :

- **Erreur** : impossible de créer correctement.
- **À vérifier** : création possible mais validation MJ nécessaire.
- **Information** : choix effectué automatiquement.

## Étape 3 — Options de création

Cases à cocher :

- Créer l’acteur Rencontre.
- Réutiliser les objets existants lorsqu’ils sont compatibles.
- Enregistrer les nouveaux objets dans la bibliothèque d’import.
- Créer uniquement dans l’acteur sans enrichir la bibliothèque.
- Ouvrir la fiche après création.

## Étape 4 — Résultat

Résumé :

```text
Centaure créé.

3 attaques créées.
1 capacité officielle réutilisée.
3 nouvelles capacités créées.
0 erreur.
1 élément à vérifier.
```

Lien/bouton :

**Ouvrir la rencontre**

---

# 9. Architecture cible

Le flux cible doit être :

```text
Source texte
    │
    ▼
TextNormalizer
    │
    ▼
BlockSegmenter
    │
    ▼
COF2StatblockParser
    │
    ▼
EncounterDraft
    │
    ├──────────────► Diagnostics
    │
    ▼
ItemResolver
    │
    ├── officiel COF2
    ├── bibliothèque d’import
    └── compendiums configurés
    │
    ▼
ImportPlan
    │
    ▼
Review UI
    │
    ▼
ItemFactory / ActorFactory
    │
    ▼
Actor Encounter + objets réutilisables
```

Le parser ne doit appeler **aucune API Foundry**.

La résolution ne doit créer **aucun document**.

La création ne doit intervenir qu’après validation du plan.

---

# 10. Modèle intermédiaire

Créer un objet métier indépendant de Foundry.

Exemple :

```ts
interface EncounterDraft {
  source: ImportSource
  name: string
  nc: number | null
  category: EncounterCategory
  size: EncounterSize

  abilities: Record<AbilityKey, AbilityDraft>

  defense: number | null
  hp: number | null
  initiative: number | null
  damageReduction: number | null

  attacks: AttackDraft[]
  capacities: CapacityDraft[]
  notes: string[]

  diagnostics: Diagnostic[]
}
```

## AttackDraft

```ts
interface AttackDraft {
  raw: string
  name: string
  kind: "melee" | "ranged" | "magical" | "unknown"
  bonus: number | null
  damage: string | null
  range: number | null
  extra: string
  confidence: Confidence
}
```

## CapacityDraft

```ts
interface CapacityDraft {
  rawName: string
  name: string
  description: string

  actionType: "L" | "A" | "M" | "G" | null
  frequency: FrequencyDraft | null

  originPath?: string
  parameters: Record<string, string | number>

  resolution?: CapacityResolution
  confidence: Confidence
}
```

## Diagnostic

```ts
interface Diagnostic {
  severity: "info" | "warning" | "error"
  code: string
  message: string
  sourceFragment?: string
}
```

Les diagnostics doivent posséder des codes stables, par exemple :

- `PDF_NOISE_REMOVED`
- `ATTACK_DAMAGE_RECONNECTED`
- `AMBIGUOUS_CAPACITY`
- `CAPACITY_PARAMETER_MISMATCH`
- `UNSUPPORTED_AUTOMATION`
- `MISSING_ABILITY`
- `MULTIPLE_STATBLOCKS`

Cela permettra les tests, la traduction et l’évolution future.

---

# 11. Pipeline de parsing

## 11.1 Normalisation Unicode

Normaliser :

- espaces insécables ;
- tirets Unicode ;
- apostrophes ;
- ligatures ;
- caractères de contrôle ;
- séparateurs de colonne.

Ne pas perdre le texte original.

Conserver :

```ts
rawText
normalizedText
```

---

## 11.2 Nettoyage des artefacts de PDF

Reconnaître et ignorer lorsque possible :

- numéros de page isolés ;
- `INTRO` ;
- titres courants `BESTIAIRE - ...` ;
- pictogrammes convertis en lettres isolées ;
- en-têtes / pieds de page connus ;
- watermark textuel éventuel.

Règle : supprimer uniquement ce qui peut être identifié avec une forte confiance.

---

## 11.3 Réparation de césure

Transformer :

```text
pié-
tine
```

en :

```text
piétine
```

mais ne pas fusionner aveuglément les vrais mots composés.

Cette étape doit être configurable et testée sur un corpus réel.

---

## 11.4 Reconstruction des lignes logiques

C’est le changement le plus important par rapport au prototype.

Le parseur ne doit plus considérer :

> une ligne PDF = une unité sémantique.

Il doit d’abord produire des **segments logiques**.

Exemples :

```text
Sabots +7 ·
DM 1d8+6
```

devient :

```text
Sabots +7 · DM 1d8+6
```

Inversement :

```text
(S)DEF 15 (V)PV 30 (I)Init. 14 Sabots +7 · DM 1d8+6 Épée longue +7 · DM 1d8+3
```

doit être segmenté en :

```text
(S)DEF 15
(V)PV 30
(I)Init. 14
Sabots +7 · DM 1d8+6
Épée longue +7 · DM 1d8+3
```

Le parseur doit chercher des **marqueurs syntaxiques COF2**, pas uniquement des retours à la ligne.

---

# 12. Reconnaissance des attaques

Le parseur d’attaque doit couvrir au minimum :

```text
Sabots +7 · DM 1d8+6
Arc long +4 · DM 1d8
Morsure (5 attaques) +8 · DM 1d8+4
Dard +3 · DM 1 + poison (2d4, difficulté 10 pour ½ DM)
Souffle glacial (...) DM 6d6+18 (...)
```

Il doit distinguer :

- nom ;
- nombre d’attaques lorsque présent ;
- bonus d’attaque ;
- formule de DM ;
- portée ;
- commentaire ;
- effet secondaire.

## Stratégie

### Niveau 1 — structure certaine

Créer l’attaque avec :

- bonus ;
- DM ;
- type ;
- portée éventuelle.

### Niveau 2 — texte supplémentaire

Conserver intégralement :

```text
poison (2d4, difficulté 10 pour ½ DM)
```

dans la description.

### Niveau 3 — automatisation spécialisée

Dans une phase ultérieure, certains patterns peuvent produire des actions/effets Foundry supplémentaires.

Ne pas bloquer la création de l’attaque en attendant cette automatisation.

---

# 13. Reconnaissance des capacités

Le format fréquent est :

```text
ATTAQUE DOUBLE (A) :
texte...
```

ou :

```text
CHARGE (L) :
texte...
```

ou :

```text
DISCRET :
texte...
```

Le parseur doit séparer :

- le vrai nom : `Charge`
- le temps d’action : `L`
- la description

Le `(L)` n’est **pas une partie du nom**.

Même règle pour :

- `(A)`
- `(M)`
- `(G)`

Cela améliore immédiatement le matching avec les objets existants.

---

# 14. Résolution des capacités existantes

La résolution doit être multi-source et ordonnée.

## Priorité 1 — correspondance exacte

Même nom normalisé et sémantique compatible.

Résultat :

> **Réutiliser**

## Priorité 2 — variante paramétrée connue

Exemple :

```text
Charge
```

peut correspondre dans le compendium à :

```text
Charge (13)
```

Mais l’exemple du Centaure demande un test de FOR **difficulté 16**.

Il serait incorrect de simplement ajouter `Charge (13)` à l’acteur.

Résultat :

> **Utiliser comme modèle, mais créer une variante adaptée.**

La résolution doit donc distinguer :

- `EXACT_REUSE`
- `TEMPLATE_VARIANT`
- `AMBIGUOUS`
- `NOT_FOUND`

## Priorité 3 — bibliothèque d’import

Si une capacité identique a déjà été importée et validée :

> **Réutiliser la version déjà créée.**

## Priorité 4 — création

Créer une nouvelle capacité.

---

# 15. Bibliothèque d’import

Ne jamais écrire dans un compendium officiel `cof2-base`.

Créer une zone de persistance appartenant au monde/module.

Deux stratégies possibles.

## Option recommandée — compendium Monde

Créer un pack de monde dédié, par exemple :

```text
Warbound — Capacités importées
Warbound — Voies importées
```

Avantages :

- contenu persistant ;
- contenu séparé du module officiel ;
- réutilisable entre acteurs ;
- évite de polluer l’onglet Objets ;
- pas de modification d’un package tiers.

## Alternative

Dossiers dédiés dans les Objets du monde :

```text
Warbound/Imports/Capacités
Warbound/Imports/Voies
```

Plus simple techniquement mais plus encombrant.

## À éviter

Modifier dynamiquement :

```text
cof2-base.cof-2-base-items
```

Le module officiel doit rester une dépendance en lecture seule.

---

# 16. Création des capacités manquantes

Une capacité créée depuis le PDF doit avoir au minimum :

```text
type = capacity
name
description
learned = true
actionType si connu
frequency si connue
```

Ajouter des métadonnées propres au module, par exemple :

```ts
flags: {
  warbound: {
    imported: true,
    sourceType: "pdf-text",
    parserVersion: "1.0.0",
    sourceHash: "...",
    reviewStatus: "reviewed"
  }
}
```

## État de validation

Prévoir :

- `generated`
- `review-required`
- `reviewed`

Cela évite qu’un objet créé automatiquement acquière le même niveau de confiance qu’un objet officiel.

---

# 17. Automatisation mécanique progressive

Le piège serait de vouloir transformer toute prose COF2 en Actions/Effets Foundry dès la v1.

Il faut procéder par patterns maîtrisés.

## Niveau A — toujours possible

- nom ;
- description ;
- temps d’action ;
- fréquence explicite.

## Niveau B — patterns simples et fiables

Exemples :

```text
+5 en discrétion en forêt
```

```text
1 fois/combat
```

```text
test de FOR difficulté 16
```

```text
étourdi pendant 1 round
```

```text
renversé
```

Ces patterns peuvent être proposés comme automatisation avec un niveau de confiance.

## Niveau C — effets complexes

Exemple :

```text
Si l’attaque est réussie, en plus des DM normaux,
une victime de taille grande ou inférieure doit faire
un test de FOR difficulté 16 ou être renversée.
Dans ce cas, la créature piétine sa victime et les DM sont doublés.
```

La v1 peut conserver ce texte fidèlement sans tenter de produire automatiquement toute la logique Foundry.

Une automatisation partielle mais juste est préférable à une automatisation complète mais fausse.

---

# 18. Gestion des Voies

Le moteur doit prévoir le concept de Voie dès maintenant sans en faire une dépendance de la création d’un acteur Rencontre.

## Cas 1 — le texte ne contient que des capacités

Créer/résoudre les capacités.

Aucune Voie nécessaire.

## Cas 2 — une Voie de créature est explicitement reconnue

Créer éventuellement un `PathDraft` et un objet Voie dans la bibliothèque.

Conserver les liens :

```text
Voie X
 ├─ Capacité A
 ├─ Capacité B
 └─ Capacité C
```

Pour l’acteur Rencontre v2.1.x :

```text
Actor Rencontre
 ├─ Capacité A
 ├─ Capacité B
 └─ Capacité C
```

Ne pas tenter de forcer la Voie sur l’acteur tant que COF2 ne le permet pas officiellement.

---

# 19. Plan de création

Avant toute écriture Foundry, construire un `ImportPlan`.

Exemple :

```ts
interface ImportPlan {
  actor: ActorCreatePlan
  attacks: ItemCreatePlan[]
  capacities: CapacityPlan[]
  libraryOperations: LibraryOperation[]
  diagnostics: Diagnostic[]
}
```

Chaque capacité indique explicitement :

```text
REUSE_OFFICIAL
REUSE_IMPORTED
CREATE_NEW
CREATE_FROM_TEMPLATE
MANUAL_REVIEW
```

L’UI affiche ce plan.

Le clic sur **Créer** l’exécute ensuite.

---

# 20. Transaction et rollback

La création doit éviter les acteurs à moitié importés.

Stratégie :

1. valider le plan ;
2. créer l’acteur ;
3. créer/ajouter les attaques ;
4. créer/résoudre les capacités ;
5. ajouter les capacités ;
6. finaliser les sources/actions ;
7. enregistrer les nouveaux objets de bibliothèque.

En cas d’erreur critique :

- proposer de supprimer l’acteur incomplet ;
- ou effectuer automatiquement un rollback des documents créés pendant l’opération.

Le journal technique doit conserver la cause précise de l’échec.

---

# 21. Gestion des doublons

Une simple comparaison de nom ne suffit pas.

Calculer une signature normalisée :

```text
type
+ nom normalisé
+ description normalisée
+ action
+ fréquence
+ paramètres importants
```

Exemple :

```text
Charge difficulté 13
```

et :

```text
Charge difficulté 16
```

ne doivent pas être considérées comme le même objet.

## Hash de contenu

Chaque objet importé peut stocker :

```text
contentHash
```

Ainsi :

- même hash → réutilisation automatique ;
- même nom, hash différent → variante à examiner.

---

# 22. Cas de référence : Centaure

Entrée :

```text
CENTAURE | NC 3
CRÉATURE VIVANTE (HUMANOÏDE) TAILLE GRANDE
| AGI +3 | CON +6* | FOR +6 (+3) | PER +1* |
| CHA +0 | INT -1 | VOL +0 |
(S)DEF 15 (V)PV 30 (I)Init. 14
Sabots +7 ·
DM 1d8+6
Épée longue +7 ·
DM 1d8+3
Arc long +4 ·
DM 1d8
ATTAQUE DOUBLE (A) :
...
CHARGE (L) :
...
HYBRIDE :
...
DISCRET :
...
```

## Résultat attendu

### Acteur

```text
Centaure
type encounter
NC 3
Humanoïde / vivant selon mapping COF2
Grande
DEF 15
PV 30
Init 14
```

### Caractéristiques

```text
AGI +3
CON +6, dé bonus
FOR +6
PER +1, dé bonus
CHA +0
INT -1
VOL +0
```

La valeur secondaire `FOR +3` du buste doit être conservée dans les informations de source/notes si elle n’est pas représentable nativement.

### Attaques

```text
Sabots       +7   DM 1d8+6
Épée longue  +7   DM 1d8+3
Arc long     +4   DM 1d8
```

Aucun avertissement `DM ... ligne non reconnue`.

### Capacités

```text
Attaque double
  action A
  capacité créée/réutilisée selon catalogue

Charge
  action L
  difficulté 16 détectée
  ne pas réutiliser silencieusement une Charge paramétrée à 13

Hybride
  passive
  description complète

Discret
  passive
  description complète
```

### Bruit PDF

Les lignes :

```text
0
INTRO
1
BESTIARE - CENTAURE
```

doivent être ignorées ou classées en information non bloquante.

---

# 23. Niveau de confiance

Chaque donnée analysée peut recevoir :

```text
high
medium
low
```

## High

Structure reconnue sans ambiguïté.

Exemple :

```text
(S)DEF 15
```

## Medium

Reconstruction appliquée.

Exemple :

```text
Sabots +7 ·
DM 1d8+6
```

## Low

Interprétation potentiellement ambiguë.

Exemple :

- un titre ressemblant à une capacité mais pouvant être du texte courant ;
- une capacité paramétrée dont la valeur ne correspond pas au modèle trouvé.

L’UI n’a pas besoin d’afficher tous les scores. Elle peut transformer cela en badges :

- ✓ reconnu
- ⚠ à vérifier
- ✕ incomplet

---

# 24. Compatibilité et détection de version

La fonctionnalité dépend du système COF2.

Au lancement :

```text
game.system.id
game.system.version
```

doivent être contrôlés.

Le code doit éviter de dépendre aveuglément d’une implémentation interne.

Exemple :

```text
if (typeof actor.addCapacity === "function") {
  ...
}
```

Prévoir un adaptateur :

```text
Cof2Adapter
```

responsable de :

- construire un acteur Rencontre ;
- construire une Attaque ;
- construire une Capacité ;
- ajouter une capacité ;
- mapper les valeurs de taille/catégorie ;
- gérer les différences entre versions du système.

Le parser ne connaît jamais Foundry.

---

# 25. Arborescence de code proposée

```text
src/
  importers/
    cof2/
      domain/
        EncounterDraft.ts
        AttackDraft.ts
        CapacityDraft.ts
        Diagnostic.ts

      parsing/
        TextNormalizer.ts
        PdfNoiseCleaner.ts
        LogicalSegmenter.ts
        StatblockParser.ts
        AttackParser.ts
        CapacityParser.ts

      resolution/
        ItemResolver.ts
        OfficialPackResolver.ts
        ImportLibraryResolver.ts
        CapacityMatcher.ts

      planning/
        ImportPlanBuilder.ts

      foundry/
        Cof2Adapter.ts
        ActorFactory.ts
        ItemFactory.ts
        ImportLibrary.ts
        ImportTransaction.ts

      ui/
        EncounterImporterApp.ts
        templates/

      tests/
        fixtures/
        parser/
        resolver/
        planning/
```

Les noms exacts peuvent être adaptés à la structure du module, mais la séparation des responsabilités doit rester.

---

# 26. Tests

L’importateur doit être développé à partir d’un corpus de statblocks réels.

## Tests unitaires obligatoires

### Normalisation

- espaces insécables ;
- tirets ;
- caractères Unicode ;
- césures ;
- bruit de page.

### Segmentation

- DM sur ligne suivante ;
- plusieurs attaques sur une seule ligne ;
- stats + attaques sur une même ligne ;
- capacité sur plusieurs lignes ;
- deux colonnes mal extraites.

### Parsing

- NC entier ;
- NC fractionnaire ;
- caractéristiques avec `*` ;
- caractéristiques avec valeur secondaire ;
- DEF/PV/Init ;
- RD ;
- attaque de contact ;
- distance ;
- magique ;
- capacités `(L)/(A)/(M)/(G)`.

### Résolution

- capacité exacte ;
- capacité absente ;
- homonyme ambigu ;
- capacité paramétrée ;
- capacité déjà importée.

### Planification

Vérifier qu’aucun document Foundry n’est créé pendant la phase de parsing ou de preview.

---

# 27. Fixtures de non-régression

Créer des fixtures à partir de cas réels.

Minimum recommandé :

1. **Centaure**
   - attaques coupées sur plusieurs lignes ;
   - quatre capacités ;
   - `Charge` paramétrée.

2. **Aigle / animal simple**
   - NC fractionnaire ;
   - attaque simple ;
   - capacité courte.

3. **Arthropode**
   - attaque avec poison ;
   - difficulté et demi-DM.

4. **Hydre**
   - attaques multiples ;
   - capacité passive ;
   - attaque spéciale avec fréquence en rounds.

5. **Statblock extrait sur une seule ligne**
   - tous les champs collés.

6. **Statblock avec en-tête/pied de page**
   - suppression du bruit.

Chaque fixture doit posséder un résultat attendu sérialisé.

---

# 28. Critères d’acceptation fonctionnels

## AC01 — Centaure

Étant donné le texte Centaure de référence, lorsque le MJ lance l’analyse :

- trois attaques sont reconnues ;
- aucune ligne `DM ...` n’apparaît comme ligne inconnue ;
- quatre capacités sont reconnues ;
- `(A)` et `(L)` sont interprétés comme temps d’action ;
- la difficulté 16 de Charge est conservée ;
- aucune capacité avec un paramètre incompatible n’est réutilisée silencieusement.

## AC02 — Prévisualisation

Aucun Actor ni Item n’est créé avant le clic final sur **Créer**.

## AC03 — Réutilisation

Une capacité officielle exactement compatible est réutilisée.

## AC04 — Variante

Une capacité proche mais paramétrée différemment est proposée comme variante, pas comme correspondance exacte.

## AC05 — Nouvelle capacité

Une capacité inconnue peut être créée comme véritable objet `capacity` et enregistrée dans la bibliothèque.

## AC06 — Idempotence

Importer deux fois le même statblock ne crée pas deux copies identiques de chaque capacité dans la bibliothèque.

## AC07 — Audit

Le résultat indique clairement :

- objets réutilisés ;
- objets créés ;
- objets nécessitant validation ;
- éléments non reconnus.

## AC08 — Erreur

Un statblock incomplet ne crée aucun acteur tant que les données bloquantes ne sont pas corrigées ou explicitement acceptées.

---

# 29. Critères non fonctionnels

- Parseur testable hors Foundry.
- Aucun accès direct à Foundry dans le domaine/parser.
- Pas d’écriture dans les packs officiels COF2.
- Résolution déterministe.
- Aucune dépendance réseau.
- Import d’un statblock en moins d’une seconde hors chargement initial des index de compendium.
- Logs de debug activables.
- Diagnostics lisibles pour un MJ, pas seulement pour un développeur.
- Compatibilité Foundry v14.
- Tolérance aux évolutions mineures de COF2 via `Cof2Adapter`.

---

# 30. Découpage de l’Epic

## Story 1 — Extraire la macro en moteur testable

**But :** conserver le comportement existant sans UI nouvelle.

Travaux :

- déplacer `parseStatblock`, `parseAttackLine`, etc. dans des modules ;
- séparer le parser des APIs Foundry ;
- créer les premières fixtures ;
- conserver une commande de debug permettant de reproduire la macro.

**DoD :**

- les tests existants passent ;
- le Centaure actuel reproduit au minimum le comportement de la macro.

---

## Story 2 — Normalisation et reconstruction du texte PDF

**But :** supprimer la dépendance au retour à la ligne du PDF.

Travaux :

- Unicode ;
- bruit de page ;
- césures ;
- logical segmentation ;
- reconnexion attaque + DM.

**DoD :**

- le Centaure produit 3 attaques sans warning sur les DM.

---

## Story 3 — Modèle `EncounterDraft` + diagnostics

**But :** créer une représentation intermédiaire stable.

Travaux :

- domaine ;
- diagnostics codés ;
- provenance ;
- confiance.

**DoD :**

- le parser retourne uniquement un `EncounterDraft`, sans Foundry.

---

## Story 4 — Import Wizard / Preview

**But :** permettre la correction avant création.

Travaux :

- nouvelle Application Foundry v14 ;
- formulaire d’entrée ;
- preview éditable ;
- affichage diagnostics ;
- bouton Créer.

**DoD :**

- aucun document n’est créé à l’étape Analyser.

---

## Story 5 — Resolver multi-compendiums

**But :** remplacer le matcher actuel par un service de résolution.

Travaux :

- index officiel ;
- index bibliothèque ;
- exact match ;
- normalized match ;
- variantes ;
- ambiguïtés.

**DoD :**

- aucun fallback approximatif n’est appliqué silencieusement.

---

## Story 6 — Bibliothèque d’objets importés

**But :** rendre les nouvelles capacités réutilisables.

Travaux :

- pack/dossier dédié ;
- hash ;
- provenance ;
- statut de validation ;
- recherche de doublons.

**DoD :**

- le second import du Centaure ne recrée pas `Attaque double`, `Hybride` ou `Discret` si leur contenu est identique.

---

## Story 7 — Item Factory COF2

**But :** produire de vrais objets COF2 conformes.

Travaux :

- `attack` ;
- `capacity` ;
- métadonnées ;
- mapping des temps d’action ;
- source UUID ;
- intégration `actor.addCapacity`.

**DoD :**

- les attaques sont utilisables depuis la fiche Rencontre ;
- les capacités apparaissent comme apprises.

---

## Story 8 — Capacités paramétrées et templates

**But :** éviter les faux matchs du type `Charge (13)` / difficulté 16.

Travaux :

- détection de paramètres ;
- stratégie `TEMPLATE_VARIANT` ;
- écran de comparaison ;
- clonage/variation uniquement lorsqu’il est sûr.

**DoD :**

- le Centaure ne reçoit jamais une Charge difficulté 13 lorsque son texte exige 16.

---

## Story 9 — Automatisation de capacités simples

**But :** automatiser uniquement les patterns sûrs.

Premiers patterns possibles :

- action `(L)/(A)/(M)/(G)` ;
- fréquence combat/quotidien explicite ;
- états COF2 explicites ;
- test de caractéristique difficulté N ;
- bonus numériques simples.

**DoD :**

- un pattern non reconnu reste une description textuelle et génère au plus un avertissement.

---

## Story 10 — Transaction, rollback et rapport final

**But :** sécuriser l’écriture.

Travaux :

- import transaction ;
- rollback ;
- rapport final ;
- logs structurés.

**DoD :**

- une erreur au milieu de l’import ne laisse pas silencieusement un acteur inutilisable.

---

# 31. Phase 2 possible — import PDF direct

À traiter dans une Epic distincte ou une extension clairement isolée.

Flux :

```text
PDF
  │
  ▼
PDF.js
  │
  ├─ sélection page
  ├─ sélection zone
  └─ extraction texte
  │
  ▼
même pipeline TextNormalizer
```

L’OCR ne doit intervenir que pour un PDF image/scanné.

Cette phase ne doit provoquer **aucune modification du parser COF2**.

---

# 32. Risques

## R1 — Vouloir parser tout le français COF2

Risque très élevé.

**Réponse :** patterns limités + fallback texte fidèle.

## R2 — Coupler le parser à la mise en page d’un seul livre

**Réponse :** segmentation logique basée sur la syntaxe COF2 et corpus de plusieurs sources.

## R3 — Fausse réutilisation d’une capacité officielle

Exemple `Charge (13)` pour une Charge difficulté 16.

**Réponse :** match exact distinct du template/variante.

## R4 — Multiplication des capacités dupliquées

**Réponse :** hash de contenu + bibliothèque.

## R5 — Évolution du système COF2

**Réponse :** `Cof2Adapter` et feature detection.

## R6 — Voies de créature non prises en charge sur Rencontre

**Réponse :** les connaître dans le domaine mais embarquer les capacités individuellement dans l’acteur.

---

# 33. Arbitrages recommandés

## À faire

- parser déterministe ;
- preview obligatoire ;
- objets manquants réellement créés ;
- bibliothèque réutilisable ;
- confiance et diagnostics visibles ;
- tests sur des statblocks réels ;
- compatibilité versionnée COF2.

## À ne pas faire

- ajouter une IA/LLM pour compenser un parser fragile ;
- écrire dans les compendiums officiels ;
- créer une Voie par défaut pour chaque liste de capacités ;
- considérer une correspondance de nom approximative comme suffisante ;
- faire du PDF binaire la première étape ;
- automatiser un effet si le texte ne permet pas une traduction mécanique sûre.

---

# 34. Definition of Done de l’Epic

L’Epic peut être considérée terminée lorsque :

- le prototype macro n’est plus nécessaire pour l’usage courant ;
- un MJ peut ouvrir l’importateur depuis le module ;
- le Centaure de référence s’importe sans les erreurs visibles aujourd’hui ;
- les attaques coupées par le PDF sont correctement reconstruites ;
- les capacités sont résolues ou créées sous forme de vrais objets COF2 ;
- les capacités nouvellement créées sont réutilisables lors d’un import ultérieur ;
- les variantes paramétrées ne sont pas confondues ;
- les ambiguïtés sont présentées au MJ avant création ;
- aucun objet officiel n’est modifié ;
- les tests couvrent un corpus représentatif du Livre des règles et du Bestiaire ;
- un échec d’import ne laisse pas de documents incohérents ;
- l’architecture permet ultérieurement d’ajouter l’import direct d’un PDF sans réécrire le cœur du parseur.

---

# 35. Résultat produit pour le MJ

La promesse finale peut être formulée ainsi :

> **Je copie un statblock depuis un PDF COF2, je le colle dans Foundry, je vérifie ce que le module a compris, puis je crée en quelques secondes une Rencontre exploitable. Les attaques et capacités déjà connues sont réutilisées ; les éléments réellement nouveaux deviennent des objets COF2 réutilisables, sans que le module invente silencieusement des mécaniques qu’il n’a pas comprises.**

C’est ce niveau de confiance qui doit différencier la fonctionnalité finale d’une simple macro de parsing.
