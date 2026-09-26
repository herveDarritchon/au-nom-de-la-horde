# Cadrage fonctionnel et technique — Importeur Markdown Warbound pour Foundry VTT

## 1. Objet du document

Ce document définit le périmètre, le contrat de données, le comportement fonctionnel et les contraintes techniques d’un outil d’import intégré au module **Warbound Campaign Content** pour Foundry VTT.

L’objectif de ce cadrage est de servir de **source de référence avant découpage en issues de développement**.  
Les issues pourront ensuite être générées à partir de ce document sans redéfinir les choix structurants.

---

# 2. Objectif de l’outil

Ajouter au module Warbound un outil MJ permettant de transformer un **fichier Markdown Warbound structuré** en contenu directement exploitable dans Foundry VTT.

Le fichier source pourra contenir :

- du lore ;
- du contexte ;
- des conseils de mise en scène ;
- des informations générales pour le MJ ;
- une table aléatoire ;
- plusieurs entrées détaillées associées à cette table.

À partir de ce fichier, l’outil doit produire et maintenir dans le monde Foundry :

- **1 JournalEntry de collection** ;
- **1 page de contexte** ;
- **1 JournalEntryPage par entrée détaillée** ;
- **1 RollTable** ;
- **1 résultat de RollTable par entrée active**, avec :
  - un titre expressif ;
  - une mini-description directement lisible ;
  - un lien vers la page détaillée correspondante.

Le but n’est pas seulement d’importer des données, mais de fournir au MJ un contenu immédiatement utilisable en préparation et pendant la partie.

---

# 3. Principe directeur

Le Markdown est la **source de vérité éditoriale**.

Foundry est la **projection opérationnelle** de cette source.

Le sens de dépendance doit rester :

```text
Game design / rédaction
        ↓
Warbound Markdown
        ↓
Importeur Warbound
        ↓
JournalEntry + Pages + RollTable
        ↓
Utilisation MJ
```

L’outil ne doit pas imposer au contenu éditorial la structure interne de Foundry.

En revanche, le format Markdown Warbound est volontairement contraint afin que l’import soit simple, fiable et déterministe.

---

# 4. Utilisateur cible

L’outil est conçu pour le **Maître de Jeu**.

V1 :

- outil accessible uniquement aux utilisateurs GM ;
- documents générés avec une visibilité MJ par défaut ;
- aucune fonctionnalité joueur nécessaire.

---

# 5. Cas d’usage principal

Le MJ possède un fichier :

```text
rumeurs-tauren-durotar.md
```

Il ouvre Foundry et choisit :

> Warbound → Importer une collection Markdown

Il sélectionne le fichier.

L’outil :

1. lit le fichier ;
2. valide son format ;
3. identifie la collection ;
4. identifie la table aléatoire ;
5. identifie toutes les entrées détaillées ;
6. compare ces données avec les documents Warbound éventuellement déjà présents dans Foundry ;
7. affiche une prévisualisation ;
8. demande la destination de la collection et de la RollTable ;
9. crée ou met à jour les documents ;
10. affiche un bilan ;
11. permet d’ouvrir immédiatement le Journal ou la RollTable.

---

# 6. Choix structurant : une collection = un fichier

En V1 :

```text
1 fichier Markdown
      =
1 collection Warbound
      =
1 JournalEntry
      +
1 RollTable
```

Le Journal contient :

```text
JournalEntry
Collection
│
├── Contexte
├── Entrée 1
├── Entrée 2
├── Entrée 3
└── ...
```

Chaque entrée détaillée devient une **JournalEntryPage**.

## Pourquoi ce modèle

Il évite de créer des dizaines de JournalEntry au même niveau dans la sidebar.

Une collection de :

- rumeurs ;
- accroches ;
- incidents ;
- secrets ;
- rencontres ;
- événements ;
- complications ;

reste regroupée dans un seul Journal.

Une entrée nécessitant un jour un document beaucoup plus important pourra simplement être déplacée vers un autre fichier Markdown et donc une autre collection.

La V1 ne doit pas proposer plusieurs stratégies de génération.

---

# 7. Format Warbound Markdown V1

Le fichier source respecte un contrat explicite.

Structure :

```text
Front matter YAML
        ↓
Contenu de contexte libre
        ↓
Table aléatoire Warbound
        ↓
Entrées détaillées
```

---

# 8. Front matter

Chaque fichier commence par :

```yaml
---
warbound:
  schema: 1
  id: durotar-tauren-rumors
  title: Rumeurs taurènes — Durotar
  type: rumor
---
```

## Champs

### `schema`

Obligatoire.

Version du format source.

V1 :

```yaml
schema: 1
```

L’importeur doit refuser proprement les versions inconnues.

### `id`

Obligatoire.

Identifiant technique stable de la collection.

Exemple :

```yaml
id: durotar-tauren-rumors
```

Contraintes recommandées :

- unique ;
- stable ;
- non traduit ;
- caractères simples ;
- format slug.

Cet identifiant ne doit pas changer lorsque le titre éditorial change.

### `title`

Obligatoire.

Nom affiché de la collection.

Exemple :

```yaml
title: Rumeurs taurènes — Durotar
```

Utilisé par défaut pour :

- le JournalEntry ;
- la RollTable ;
- la prévisualisation.

### `type`

Facultatif en V1.

Exemples :

```yaml
type: rumor
type: hook
type: intrigue
type: event
```

En V1 ce champ sert uniquement de métadonnée métier.

Il ne doit pas modifier la logique principale de l’importeur.

---

# 9. Contenu de contexte

Tout le contenu situé après le front matter et avant le début de la table Warbound constitue le **contexte de collection**.

Exemple :

```markdown
# Rumeurs taurènes — Durotar

## Contexte

Les Taurens traversent régulièrement Durotar...

## Utilisation MJ

À chaque retour important à Razor Hill...
```

Ce contenu est libre.

Il peut contenir :

- titres ;
- paragraphes ;
- listes ;
- citations ;
- tableaux ;
- liens ;
- conseils ;
- lore ;
- notes MJ.

L’importeur ne cherche pas à comprendre sa sémantique.

Il convertit simplement ce bloc Markdown en HTML et l’utilise pour créer ou mettre à jour une page Foundry :

```text
Contexte
```

---

# 10. Délimitation de la table aléatoire

La table aléatoire est explicitement encadrée.

Début :

```html
<!-- warbound:table:start -->
```

Fin :

```html
<!-- warbound:table:end -->
```

Exemple :

```markdown
<!-- warbound:table:start -->

## Table aléatoire

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | stonehoof-convoi | Le convoi Stonehoof | Une cargaison destinée à Orgrimmar a été pillée de façon très précise. | 1 | oui |
| 2 | thunderhorn-migration | Les bêtes quittent les crêtes | Plusieurs espèces quittent les hauteurs du nord. | 1 | oui |

<!-- warbound:table:end -->
```

L’importeur ne doit jamais essayer de deviner quelle table Markdown constitue la table aléatoire.

Le document peut contenir d’autres tableaux ailleurs.

---

# 11. Colonnes de la table V1

La table aléatoire utilise exactement les colonnes suivantes :

```text
Index
ID
Titre
Aperçu
Poids
Actif
```

L’ordre peut être figé en V1 pour simplifier le parser.

---

# 12. Sémantique des colonnes

## Index

Valeur d’ordre humaine.

Exemple :

```text
1
2
3
```

Elle sert notamment à :

- afficher l’ordre de la collection ;
- faciliter la lecture du Markdown ;
- construire les plages lorsque tous les poids sont égaux.

Elle ne constitue pas l’identité technique de l’entrée.

## ID

Identifiant technique stable de l’entrée.

Exemple :

```text
stonehoof-convoi
```

Cet ID relie :

```text
ligne de table
       ↕
bloc détaillé
       ↕
JournalEntryPage Foundry
```

Il doit être unique à l’intérieur d’une collection.

## Titre

Titre éditorial affiché au MJ.

Exemple :

```text
Le convoi Stonehoof
```

Utilisé pour :

- le nom de la page ;
- le résultat de RollTable ;
- la prévisualisation.

Le titre peut changer sans changer l’identité technique.

## Aperçu

Texte court directement exploitable lors d’un tirage.

Exemple :

```text
Une cargaison destinée à Orgrimmar a été pillée de façon très précise.
```

Le MJ doit pouvoir comprendre le résultat sans ouvrir immédiatement la fiche détaillée.

## Poids

Entier strictement positif.

Exemple :

```text
1
2
3
```

Valeur par défaut :

```text
1
```

Le poids détermine la fréquence relative d’apparition dans la RollTable.

## Actif

Valeurs acceptées V1 :

```text
oui
non
```

Une entrée inactive :

- reste dans le Journal ;
- conserve sa page ;
- conserve son identité ;
- n’est pas incluse dans la RollTable active.

Cela permet de faire évoluer une collection au fil de la campagne.

---

# 13. Entrées détaillées

Chaque entrée détaillée est explicitement délimitée.

Début :

```html
<!-- warbound:entry id="stonehoof-convoi" -->
```

Fin :

```html
<!-- warbound:entry:end -->
```

Exemple :

```markdown
<!-- warbound:entry id="stonehoof-convoi" -->

## Le convoi Stonehoof

Trois kodos sont arrivés de Thunder Bluff avec une lourde cargaison.

### Ce que l’on raconte

> « Ils ont laissé l’or. Ils ont laissé les armes. Ils ont pris les outils. »

### Ce qui se passe réellement

Le vol est ciblé.

### Si les PJ s’y intéressent

Ils peuvent examiner le chargement, interroger les convoyeurs ou remonter la piste.

### Si personne n’agit

Une nouvelle livraison sera attaquée.

<!-- warbound:entry:end -->
```

---

# 14. Contenu libre des entrées

Le contenu situé entre :

```text
warbound:entry
```

et :

```text
warbound:entry:end
```

est du Markdown libre.

L’importeur ne doit pas essayer d’interpréter :

- « Réalité MJ » ;
- « Indices » ;
- « Conséquences » ;
- « PNJ » ;
- « Si personne n’agit » ;
- ou toute autre section.

Il transforme le contenu en HTML.

Cela permet au game design de rester libre sans faire évoluer le parser à chaque nouveau type de contenu.

---

# 15. Modèle interne neutre

Le parser doit produire un modèle interne indépendant de Foundry.

Exemple :

```javascript
{
  schema: 1,
  collectionId: "durotar-tauren-rumors",
  title: "Rumeurs taurènes — Durotar",
  type: "rumor",

  context: {
    markdown: "...",
    html: "..."
  },

  entries: [
    {
      index: 1,
      id: "stonehoof-convoi",
      title: "Le convoi Stonehoof",
      summary: "Une cargaison destinée à Orgrimmar...",
      weight: 1,
      active: true,
      markdown: "...",
      html: "..."
    }
  ]
}
```

Aucune classe Foundry ne doit être créée par le parser.

---

# 16. Validation du fichier

La validation doit avoir lieu avant toute création ou modification de document.

## Erreurs bloquantes

La génération doit être refusée si :

- le front matter est absent ;
- `warbound.schema` est absent ;
- le `schema` n’est pas supporté ;
- `warbound.id` est absent ;
- `warbound.title` est absent ;
- la table Warbound est absente ;
- plusieurs tables Warbound sont déclarées ;
- une colonne obligatoire manque ;
- un ID est vide ;
- deux lignes utilisent le même ID ;
- un bloc détaillé possède un ID dupliqué ;
- une ligne de table active ne possède aucun bloc détaillé correspondant ;
- un poids n’est pas un entier strictement positif ;
- une valeur `Actif` n’est ni `oui` ni `non`.

## Warnings non bloquants

Afficher un warning si :

- un bloc détaillé n’est référencé par aucune ligne de table ;
- les Index présentent des trous ;
- deux titres sont identiques ;
- aucune entrée n’est active ;
- l’aperçu d’une entrée est vide.

---

# 17. Messages d’erreur

Les erreurs doivent être conçues pour permettre de corriger immédiatement le fichier.

Mauvais :

```text
Invalid source.
```

Bon :

```text
Import impossible.

Collection : durotar-tauren-rumors

L’entrée "stonehoof-convoi" est référencée dans la table,
mais aucun bloc correspondant n’a été trouvé.

Bloc attendu :

<!-- warbound:entry id="stonehoof-convoi" -->
```

Lorsque possible, fournir :

- ID ;
- titre ;
- numéro de ligne ;
- nature de l’erreur.

---

# 18. Interface utilisateur

Ajouter un outil Warbound réservé aux GM.

Libellé proposé :

```text
Importer une collection Markdown
```

La V1 peut être accessible depuis :

- la sidebar Journal ;
- ou un menu/outillage Warbound existant.

Le choix exact doit respecter l’architecture actuelle du module.

---

# 19. Sélection du fichier

Utiliser un sélecteur local :

```html
<input type="file" accept=".md,.markdown,text/markdown">
```

Puis lire le fichier côté navigateur.

L’objectif est d’importer un fichier présent sur la machine du MJ, pas nécessairement dans le dossier Data de Foundry.

---

# 20. Étape de prévisualisation

Aucun document ne doit être créé immédiatement après sélection du fichier.

Afficher d’abord une prévisualisation.

Exemple :

```text
Rumeurs taurènes — Durotar

Collection
durotar-tauren-rumors

12 entrées
10 actives
2 inactives

Destination Journal
[ Au Nom de la Horde / Rumeurs et intrigues ]

Destination RollTable
[ Au Nom de la Horde / Tables ]

────────────────────────────────

+ stonehoof-convoi
  Le convoi Stonehoof

~ thunderhorn-migration
  Les bêtes quittent les crêtes

= skychaser-vent
  Le vent parle de travers

○ grimtotem-presence
  Les Grimtotem seraient à Durotar

────────────────────────────────

[Annuler] [Synchroniser]
```

---

# 21. Sélection des destinations

L’utilisateur choisit :

## Dossier JournalEntry

Dossier dans lequel le Journal de collection doit être créé.

Afficher uniquement les dossiers compatibles avec JournalEntry.

## Dossier RollTable

Dossier dans lequel la RollTable doit être créée.

Afficher uniquement les dossiers compatibles avec RollTable.

La V1 ne crée pas automatiquement une arborescence complexe.

Elle crée uniquement les documents dans les dossiers explicitement sélectionnés.

---

# 22. Documents Foundry générés

## JournalEntry de collection

Nom :

```text
front matter → warbound.title
```

Le Journal doit stocker dans ses flags :

```javascript
flags: {
  "warbound-campaign-content": {
    markdownImport: {
      schema: 1,
      collectionId: "durotar-tauren-rumors"
    }
  }
}
```

Les noms exacts des propriétés peuvent être adaptés aux conventions existantes du module.

## Page Contexte

Une page texte :

```text
Contexte
```

Contenu :

```text
Markdown situé avant la table Warbound
        ↓
HTML
```

## Pages d’entrées

Une page par entrée détaillée.

Nom :

```text
Titre de la ligne de table
```

Chaque page doit stocker :

```javascript
collectionId
entryId
```

dans les flags Warbound.

Cela permet de retrouver la page même si son titre change.

---

# 23. RollTable

Créer une RollTable portant par défaut le même nom que la collection.

Valeurs de base cohérentes avec les conventions Foundry du projet :

```text
replacement: true
displayRoll: true
```

Le code doit utiliser l’API Foundry V14 réellement disponible dans le projet.

Ne pas copier aveuglément des objets exportés contenant :

- `_id` ;
- `_stats` ;
- `exportSource` ;
- timestamps ;
- identifiants du monde.

Foundry doit produire ses propres métadonnées.

---

# 24. Résultat de RollTable attendu

Un tirage doit fournir immédiatement au MJ :

```text
Le convoi Stonehoof

Une cargaison destinée à Orgrimmar a été pillée
de façon très précise.

Ouvrir la fiche
```

Le résultat doit contenir :

- le titre ;
- l’aperçu ;
- une référence vers la JournalEntryPage détaillée.

Le lien doit utiliser l’UUID réel de la page créée ou retrouvée.

Le code doit vérifier la syntaxe exacte des références UUID et des TableResult dans Foundry V14 au moment de l’implémentation.

Ne pas inventer le schéma de TableResult.

---

# 25. Poids et plages

La RollTable ne doit contenir que les entrées actives.

Exemple :

```text
A   poids 1
B   poids 2
C   poids 1
```

Total :

```text
4
```

Formule :

```text
1d4
```

Plages :

```text
1     A
2–3   B
4     C
```

Algorithme :

```javascript
cursor = 1

for each activeEntry:
  start = cursor
  end = cursor + weight - 1
  cursor = end + 1
```

Formule :

```javascript
`1d${sumOfWeights}`
```

---

# 26. Synchronisation plutôt qu’import unique

Le système doit être idempotent.

Réimporter le même fichier ne doit pas créer de doublons.

L’identité repose sur :

```text
collectionId
entryId
```

et non sur les noms affichés.

---

# 27. Détection d’une collection existante

Lors d’un import :

1. chercher un JournalEntry portant le flag :
   ```text
   collectionId
   ```
2. chercher la RollTable correspondante ;
3. chercher les pages portant :
   ```text
   collectionId + entryId
   ```
4. construire le diff avant toute modification.

---

# 28. États de synchronisation

La prévisualisation doit distinguer :

```text
+ Nouvelle
~ Modifiée
= Inchangée
○ Inactive
! Orpheline
```

## Nouvelle

Présente dans le Markdown mais absente de Foundry.

## Modifiée

Présente des deux côtés mais son contenu source a changé.

## Inchangée

Aucune différence pertinente.

## Inactive

Présente mais `Actif = non`.

Elle reste dans le Journal mais ne figure plus dans la RollTable.

## Orpheline

Présente dans Foundry mais plus dans le fichier source.

Aucune suppression automatique en V1.

Afficher simplement un warning.

---

# 29. Détection des modifications

Éviter de comparer le HTML généré à la main si une méthode plus fiable peut être utilisée.

Recommandation :

calculer un hash déterministe du contenu source normalisé pour :

- le contexte ;
- chaque entrée ;
- la ligne de table.

Stocker ce hash dans les flags Warbound.

Exemple conceptuel :

```javascript
sourceHash: "..."
```

Au prochain import :

```text
hash identique
→ unchanged

hash différent
→ update
```

Le choix précis de l’algorithme doit privilégier une solution simple disponible dans l’environnement du module.

---

# 30. Préserver les UUID

Lors d’une mise à jour :

- mettre à jour les documents existants ;
- ne pas supprimer puis recréer les pages ;
- préserver autant que possible les UUID.

C’est particulièrement important pour :

- les RollTables ;
- les liens depuis d’autres Journaux ;
- les références futures.

---

# 31. Gestion des entrées supprimées du Markdown

Une entrée présente dans Foundry mais absente de la nouvelle source devient :

```text
orpheline
```

En V1 :

- ne pas la supprimer ;
- ne pas la modifier ;
- la signaler dans la prévisualisation ;
- l’exclure éventuellement de la RollTable reconstruite si elle n’existe plus dans la source.

La suppression explicite pourra faire l’objet d’une fonctionnalité ultérieure.

---

# 32. Rollback

La création initiale doit être protégée contre les imports partiels.

Ordre recommandé :

```text
parse
  ↓
validate
  ↓
diff
  ↓
user confirmation
  ↓
create/update Journal
  ↓
create/update Pages
  ↓
create/update RollTable
  ↓
create/update Results
```

Conserver la liste des documents créés durant l’opération.

En cas d’échec lors d’un premier import, essayer de supprimer uniquement les documents créés par cette opération.

Ne jamais supprimer un document préexistant dans un rollback automatique.

Pour les mises à jour de documents existants, préférer une stratégie qui évite les mutations partielles si l’API Foundry le permet.

---

# 33. Conversion Markdown → HTML

L’importeur doit gérer au minimum :

- headings ;
- paragraphes ;
- gras ;
- italique ;
- listes ;
- citations ;
- liens ;
- tableaux ;
- code inline si présent.

Avant d’ajouter une dépendance :

1. inspecter les dépendances du module ;
2. inspecter les outils déjà disponibles dans Foundry ;
3. réutiliser une solution existante si elle répond au besoin.

Ne pas ajouter une grosse bibliothèque uniquement pour une conversion Markdown simple.

---

# 34. Architecture de code recommandée

Adapter les chemins exacts à l’architecture du module existant.

Structure conceptuelle :

```text
scripts/
└── importers/
    └── warbound-markdown/
        ├── WarboundMarkdownImporterApp.js
        ├── WarboundMarkdownParser.js
        ├── WarboundMarkdownValidator.js
        ├── WarboundImportSynchronizer.js
        ├── WarboundDocumentGenerator.js
        └── templates/
            └── importer.hbs
```

---

# 35. Responsabilités

## WarboundMarkdownImporterApp

Responsable de :

- UI ;
- sélection du fichier ;
- sélection des dossiers ;
- prévisualisation ;
- déclenchement de la synchronisation ;
- bilan.

Aucune logique métier complexe.

## WarboundMarkdownParser

Responsable de :

- front matter ;
- extraction du contexte ;
- extraction de la table ;
- extraction des entrées ;
- conversion vers le modèle neutre.

Aucune création Foundry.

## WarboundMarkdownValidator

Responsable de :

- règles du schema V1 ;
- erreurs bloquantes ;
- warnings ;
- messages précis.

## WarboundImportSynchronizer

Responsable de :

- recherche des documents existants ;
- correspondance par IDs ;
- calcul du diff ;
- détection new/update/unchanged/inactive/orphan.

## WarboundDocumentGenerator

Responsable de :

- JournalEntry ;
- JournalEntryPage ;
- RollTable ;
- TableResult ;
- flags ;
- UUID ;
- rollback.

---

# 36. Contraintes techniques

Cible actuelle du projet :

```text
Foundry VTT 14
Système CO2
```

Le développement doit :

- respecter les conventions actuelles du module ;
- inspecter le code existant avant d’introduire de nouveaux patterns ;
- éviter les dépendances inutiles ;
- ne pas écrire directement dans le dépôt du module depuis Foundry ;
- créer les documents dans le **monde actif** via les API Foundry.

---

# 37. Important : module et monde Foundry

L’outil appartient au module :

```text
warbound-campaign-content
```

mais le résultat appartient au monde actif.

Le flux est :

```text
fichier Markdown local
        ↓
code du module Warbound
        ↓
API Foundry
        ↓
documents du monde
```

La V1 ne modifie pas :

```text
compendiums/*.yml
```

et ne commit rien dans Git.

Un éventuel export vers les sources du module constitue une fonctionnalité distincte.

---

# 38. Permissions et sécurité

V1 :

```javascript
game.user.isGM
```

obligatoire.

Les documents contenant des informations MJ ne doivent pas être rendus visibles aux joueurs par défaut.

Le système doit respecter les mécanismes standard de permissions Foundry.

---

# 39. Notifications

Après synchronisation réussie :

```text
Warbound

Rumeurs taurènes — Durotar synchronisées.

3 créées
2 mises à jour
7 inchangées
2 inactives
0 erreur
```

Boutons/actions utiles :

```text
Ouvrir le Journal
Ouvrir la RollTable
```

---

# 40. Non-objectifs V1

Ne pas implémenter :

- génération IA ;
- édition Markdown dans Foundry ;
- synchronisation Foundry → Markdown ;
- export Markdown ;
- export vers les YAML du module ;
- suppression automatique des entrées orphelines ;
- plusieurs collections dans un fichier ;
- plusieurs tables aléatoires dans un fichier ;
- plusieurs stratégies Journal/Page ;
- parsing heuristique ;
- support de formats Markdown arbitraires ;
- filtres interactifs par tags ;
- éditeur de probabilités dans Foundry ;
- création complexe d’arborescences ;
- gestion joueur ;
- partage automatique des résultats ;
- système générique de front/campagne.

---

# 41. Critères d’acceptation fonctionnels

## Import initial

Étant donné un fichier valide contenant :

- un front matter ;
- du contexte ;
- trois entrées ;
- trois lignes actives ;

lorsque le MJ l’importe et confirme,

alors Foundry contient :

```text
1 JournalEntry
1 page Contexte
3 pages d’entrée
1 RollTable
3 résultats
```

Chaque résultat affiche :

- titre ;
- aperçu ;
- lien fonctionnel vers la page correspondante.

---

# 42. Critère d’acceptation — poids

Étant donné :

```text
A poids 1
B poids 2
C poids 1
```

la table générée doit utiliser :

```text
1d4
```

avec :

```text
1   A
2-3 B
4   C
```

---

# 43. Critère d’acceptation — entrée inactive

Étant donné :

```text
C Actif = non
```

la page C existe dans le Journal.

La RollTable ne contient aucun résultat C.

---

# 44. Critère d’acceptation — réimport sans changement

Réimporter exactement le même fichier :

- ne crée aucun nouveau Journal ;
- ne crée aucune nouvelle page ;
- ne crée aucune nouvelle RollTable ;
- conserve les UUID ;
- affiche toutes les entrées comme inchangées.

---

# 45. Critère d’acceptation — renommage

Si :

```text
entryId = stonehoof-convoi
```

reste identique mais le titre change,

alors :

- la page existante est renommée ;
- son UUID reste identique ;
- le résultat de RollTable est mis à jour ;
- aucun doublon n’est créé.

---

# 46. Critère d’acceptation — modification de contenu

Si le contenu détaillé d’une entrée change :

- la page existante est mise à jour ;
- son UUID reste stable ;
- l’entrée apparaît `Modifiée` dans la prévisualisation.

---

# 47. Critère d’acceptation — entrée supprimée

Si une entrée existant dans Foundry disparaît du Markdown :

- elle n’est pas supprimée automatiquement ;
- elle apparaît comme orpheline ;
- elle ne doit pas provoquer la création d’un doublon ;
- elle ne doit plus être ajoutée à la RollTable issue du nouveau fichier.

---

# 48. Critère d’acceptation — source invalide

Un fichier invalide ne doit entraîner :

- aucune création ;
- aucune modification ;
- aucune suppression.

Le MJ reçoit une erreur exploitable.

---

# 49. Tests recommandés

Prévoir au minimum des tests sur :

### Parser

- front matter valide ;
- contexte ;
- table ;
- entries ;
- accents ;
- apostrophes ;
- Markdown multi-paragraphes ;
- tableaux internes aux détails.

### Validator

- ID dupliqué ;
- entrée manquante ;
- mauvais poids ;
- `Actif` invalide ;
- schema inconnu ;
- table absente.

### Synchronizer

- collection nouvelle ;
- collection existante ;
- entrée nouvelle ;
- entrée modifiée ;
- entrée inchangée ;
- entrée inactive ;
- entrée orpheline ;
- renommage avec ID stable.

### RollTable

- poids simples ;
- poids différents ;
- une seule entrée ;
- aucune entrée active ;
- UUID corrects.

---

# 50. Exemple source de référence V1

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
| 3 | grimtotem-presence | Les Grimtotem seraient à Durotar | Personne n’a vu de Grimtotem, mais tout le monde connaît déjà le coupable. | 1 | non |

<!-- warbound:table:end -->

# Entrées

<!-- warbound:entry id="stonehoof-convoi" -->

## Le convoi Stonehoof

Trois kodos sont arrivés de Thunder Bluff avec une lourde cargaison.

### Ce que l’on raconte

> « Ils ont laissé l’or. Ils ont laissé les armes. Ils ont pris les outils. »

### Ce qui se passe réellement

Les voleurs ciblent uniquement le matériel permettant de creuser,
renforcer ou soutenir des galeries.

### Si les PJ s’y intéressent

Ils peuvent examiner le convoi, interroger les convoyeurs,
remonter les commandes ou pister les voleurs.

### Si personne n’agit

Une nouvelle livraison technique est attaquée plus tard.

<!-- warbound:entry:end -->

<!-- warbound:entry id="thunderhorn-migration" -->

## Les bêtes quittent les crêtes

Un Thunderhorn et un Runetotem ont constaté séparément
des migrations inhabituelles.

### Ce qui se passe réellement

Le phénomène est réel mais aucun des deux n’en connaît la cause.

<!-- warbound:entry:end -->

<!-- warbound:entry id="grimtotem-presence" -->

## Les Grimtotem seraient à Durotar

Des propos hostiles circulent à Razor Hill.

### Ce qui se passe réellement

Aucune preuve ne confirme la présence d’un Grimtotem.

<!-- warbound:entry:end -->
```

---

# 51. Découpage ultérieur en issues

Le présent document doit permettre à Claude de découper l’implémentation en issues indépendantes.

Le découpage devrait naturellement faire apparaître des sujets de ce type :

1. **Définition du modèle et parser Warbound Markdown V1**
2. **Validation et diagnostics**
3. **UI d’import et sélection du fichier**
4. **Sélection des dossiers Foundry**
5. **Génération JournalEntry + JournalEntryPage**
6. **Génération RollTable + TableResult**
7. **Flags et identité stable**
8. **Synchronisation / diff**
9. **Prévisualisation**
10. **Gestion des entrées inactives**
11. **Gestion des poids**
12. **Gestion des orphelins**
13. **Rollback et erreurs**
14. **Tests**
15. **Documentation utilisateur**

Ce découpage est indicatif.

Lors de la création des issues, Claude doit :

- inspecter le code existant ;
- identifier les dépendances réelles entre sujets ;
- éviter de créer des issues artificiellement petites ;
- fournir pour chaque issue :
  - objectif ;
  - périmètre ;
  - hors périmètre ;
  - critères d’acceptation ;
  - dépendances ;
  - fichiers ou composants probablement concernés.

---

# 52. Doctrine d’implémentation

Priorités :

```text
fiabilité
    >
simplicité
    >
idempotence
    >
ergonomie MJ
    >
extensibilité
```

Ne pas complexifier le code pour supporter des variantes de source non nécessaires.

Le producteur du Markdown et l’importeur appartiennent au même workflow Warbound.

Il est donc préférable d’avoir :

```text
un format strict + des erreurs claires
```

plutôt que :

```text
un parser permissif + des comportements implicites
```

---

# 53. Définition de Done globale

La fonctionnalité est considérée comme terminée lorsqu’un MJ peut :

1. générer un fichier Warbound Markdown V1 ;
2. l’importer depuis son ordinateur ;
3. voir une prévisualisation claire ;
4. choisir les destinations Foundry ;
5. créer une collection sans doublon ;
6. tirer immédiatement dans la RollTable ;
7. obtenir un titre et un aperçu exploitables ;
8. ouvrir la page détaillée en un clic ;
9. modifier le fichier Markdown ;
10. le réimporter ;
11. mettre à jour les documents existants sans changer leurs UUID ;
12. activer ou désactiver des entrées depuis la source ;
13. constater clairement ce qui a été créé, modifié, ignoré ou rendu orphelin.

Le Markdown reste la source éditoriale principale de la collection.
