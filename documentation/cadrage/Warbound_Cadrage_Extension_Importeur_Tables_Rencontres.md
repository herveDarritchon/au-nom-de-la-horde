# Cadrage fonctionnel et technique — Extension de l’importeur Warbound Markdown pour les tables de rencontres

## 1. Objet du document

Ce document définit le cadrage fonctionnel et technique nécessaire pour enrichir l’importeur Markdown du module **Warbound Campaign Content** afin de prendre en charge explicitement les **tables de rencontres Warbound**.

Il complète le cadrage existant de l’importeur Markdown.

L’objectif n’est pas de créer un second importeur indépendant.

L’objectif est de faire évoluer l’importeur actuel afin qu’il puisse traiter comme une collection de premier rang :

```text
type: encounter
```

tout en conservant les principes structurants déjà validés :

```text
Markdown = source de vérité éditoriale
Foundry = projection opérationnelle
```

et :

```text
1 fichier Markdown
=
1 collection Warbound
=
1 JournalEntry
+
1 RollTable
```

Ce document doit servir de référence avant découpage en issues de développement.

---

# 2. Résumé de la décision

La prise en charge des tables de rencontres doit être conçue comme une **extension métier du format existant**, et non comme un nouveau format technique.

Décision :

```text
Warbound Markdown schema 1
```

reste le contrat technique commun.

On ajoute officiellement un nouveau type de collection :

```yaml
warbound:
  schema: 1
  type: encounter
```

Une collection `encounter` produit exactement les mêmes familles de documents Foundry qu’une collection existante :

```text
JournalEntry
├── Contexte
├── Rencontre 1
├── Rencontre 2
├── Rencontre 3
└── ...

RollTable
├── Résultat 1 → Rencontre 1
├── Résultat 2 → Rencontre 2
├── Résultat 3 → Rencontre 3
└── ...
```

La différence entre une collection de rumeurs, d’accroches ou de rencontres est donc principalement **éditoriale et métier**, pas structurelle.

---

# 3. Principe directeur

L’importeur ne doit pas essayer de comprendre le game design d’une rencontre.

Il doit comprendre uniquement le **contrat Warbound Markdown**.

Le flux reste :

```text
Game design
    ↓
Prompt de génération Warbound
    ↓
Markdown Warbound schema 1
    ↓
Importeur Warbound
    ↓
Modèle interne neutre
    ↓
JournalEntry + JournalEntryPage + RollTable
```

Le contenu détaillé d’une rencontre peut utiliser des rubriques comme :

```text
En un regard
Ce qui se passe réellement
Acteurs
Tension
Ce qui peut attirer l’attention
Leviers des PJ
Évolution
Retombées possibles
Combat éventuel
```

mais ces rubriques restent du **Markdown libre**.

Le parser ne doit pas leur attribuer de sémantique particulière.

---

# 4. Pourquoi ne pas créer un schema spécifique aux rencontres

Il serait possible de créer :

```text
schema: 2
```

ou un format spécialisé comportant des champs structurés comme :

```text
actors
tension
stakes
combat
outcomes
```

Ce choix est écarté pour cette évolution.

## Raisons

### 4.1 Le besoin Foundry est identique

Dans tous les cas, l’importeur doit produire :

- un Journal ;
- une page de contexte ;
- une page par entrée ;
- une RollTable ;
- un résultat par entrée active.

### 4.2 Le format actuel est déjà suffisant

La table contient déjà :

```text
Index
ID
Titre
Aperçu
Poids
Actif
```

et le bloc détaillé contient déjà tout le Markdown nécessaire.

### 4.3 Le game design doit pouvoir évoluer

La structure éditoriale d’une bonne rencontre pourra encore évoluer.

Le parser ne doit pas devoir être modifié si une future version du prompt remplace par exemple :

```text
Tension
```

par :

```text
Enjeu immédiat
```

### 4.4 Éviter un couplage inutile

L’importeur doit rester un outil d’import de contenu Warbound, pas devenir un moteur de règles de rencontres.

---

# 5. Nouveau type métier supporté

Le champ :

```yaml
warbound.type
```

doit reconnaître officiellement :

```text
encounter
```

Exemple :

```yaml
---
warbound:
  schema: 1
  id: durotar-razor-hill-senjin-encounters
  title: Rencontres — Route de Razor Hill à Sen’jin
  type: encounter
---
```

---

# 6. Compatibilité avec les collections existantes

L’évolution doit rester rétrocompatible.

Les collections existantes de type :

```text
rumor
hook
intrigue
event
```

ou toute valeur déjà acceptée par l’implémentation actuelle ne doivent pas cesser de fonctionner.

L’ajout de :

```text
encounter
```

ne doit provoquer aucune migration des documents existants.

---

# 7. Choix structurant : pas de nouvel importeur séparé

Ne pas créer :

```text
WarboundEncounterImporter
```

comme pipeline indépendant du pipeline existant.

Privilégier :

```text
WarboundMarkdownImporter
        ↓
collection.type
        ↓
comportement commun
```

Le type peut influencer :

- certains libellés UI ;
- certains noms par défaut ;
- certaines informations de prévisualisation ;
- éventuellement l’icône ou la présentation.

Il ne doit pas dupliquer :

- le parser ;
- le synchronizer ;
- la génération de Journal ;
- la génération de RollTable ;
- la gestion des IDs ;
- la logique de hash ;
- la gestion des orphelins ;
- le rollback.

---

# 8. Cas d’usage principal

Le MJ possède un fichier :

```text
rencontres-route-razor-hill-senjin.md
```

contenant :

```yaml
warbound:
  schema: 1
  id: durotar-razor-hill-senjin-encounters
  title: Rencontres — Route de Razor Hill à Sen’jin
  type: encounter
```

Il ouvre :

```text
Warbound → Importer une collection Markdown
```

Il sélectionne le fichier.

L’outil :

1. lit le fichier ;
2. parse le front matter ;
3. identifie `type: encounter` ;
4. extrait le contexte ;
5. extrait la table ;
6. extrait les blocs de rencontres ;
7. valide la source ;
8. recherche une éventuelle collection existante ;
9. construit le diff ;
10. affiche la prévisualisation ;
11. demande les destinations ;
12. synchronise le Journal ;
13. synchronise les pages ;
14. synchronise la RollTable ;
15. synchronise les résultats ;
16. affiche le bilan.

---

# 9. Format source attendu

Le format reste :

```text
Front matter YAML
        ↓
Contexte libre
        ↓
<!-- warbound:table:start -->
        ↓
Table Warbound
        ↓
<!-- warbound:table:end -->
        ↓
Blocs warbound:entry
```

Exemple minimal :

```markdown
---
warbound:
  schema: 1
  id: durotar-razor-hill-senjin-encounters
  title: Rencontres — Route de Razor Hill à Sen’jin
  type: encounter
---

# Rencontres — Route de Razor Hill à Sen’jin

## Périmètre

Cette table s’utilise sur la route entre Razor Hill et Sen’jin.

## Utilisation

Tirer une rencontre lorsque le voyage mérite une scène significative.

<!-- warbound:table:start -->

## Table de rencontres

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | grunt-empoisonne | Le survivant sur le rocher | Un grunt blessé reste bloqué au-dessus d’un nid de scorpides. | 1 | oui |
| 2 | eclaireurs-kolkar | Ceux qui regardent derrière vous | Des éclaireurs Kolkar surveillent nerveusement la route derrière les PJ. | 1 | oui |

<!-- warbound:table:end -->

# Rencontres

<!-- warbound:entry id="grunt-empoisonne" -->

## Le survivant sur le rocher

### En un regard

Un grunt blessé s’est réfugié sur un rocher.

### Ce qui se passe réellement

Il a été séparé de sa patrouille et empoisonné par un scorpide.

### Acteurs

**Le grunt — veut rejoindre Razor Hill — épuisé et méfiant**

### Tension

Sa monture s’éloigne avec ses sacoches pendant que les scorpides restent sous le rocher.

### Leviers des PJ

Les PJ peuvent l’aider, détourner les scorpides, récupérer la monture ou poursuivre leur route.

### Évolution

Sans aide, le grunt tente finalement de descendre seul.

### Retombées possibles

Une aide réussie peut fournir des informations récentes sur la route.

### Combat éventuel

Les scorpides n’attaquent que si leur nid est approché ou s’ils sont provoqués.

<!-- warbound:entry:end -->

<!-- warbound:entry id="eclaireurs-kolkar" -->

## Ceux qui regardent derrière vous

### En un regard

Deux éclaireurs Kolkar observent la route depuis une hauteur.

### Ce qui se passe réellement

Ils surveillent un autre groupe qui se déplace au nord.

<!-- warbound:entry:end -->
```

---

# 10. Colonnes de table

Les collections `encounter` utilisent exactement les mêmes colonnes que les autres collections :

```text
Index
ID
Titre
Aperçu
Poids
Actif
```

Aucune colonne supplémentaire n’est nécessaire en V1.

Ne pas ajouter :

```text
Type de rencontre
Difficulté
Biome
Combat
Niveau
NC
Faction
Tags
Moment
Scène
Incident
```

à la table source dans cette évolution.

Ces informations peuvent exister dans le texte libre si elles sont utiles au MJ.

---

# 11. Nombre d’entrées

L’importeur ne doit imposer aucun nombre fixe d’entrées.

Une table peut contenir :

```text
6
8
10
12
20
24
...
```

entrées.

La formule de RollTable continue d’être construite à partir de :

```text
somme des poids actifs
```

Le nombre `20` éventuellement utilisé par les prompts de génération n’est pas une contrainte technique de l’importeur.

---

# 12. Sémantique de l’aperçu pour `encounter`

Pour une collection `encounter`, le champ :

```text
Aperçu
```

reste techniquement un simple texte court.

La convention éditoriale recommandée est cependant :

> décrire la situation telle qu’elle entre immédiatement dans le champ des PJ.

Exemple :

```text
Trois Kolkar démontés retiennent leurs montures derrière une crête tandis que l’un d’eux surveille quelque chose derrière les PJ.
```

Cette convention n’a pas besoin d’être validée sémantiquement par le code.

L’importeur vérifie uniquement :

- présence éventuelle ;
- chaîne valide ;
- affichage dans le résultat.

---

# 13. Contenu détaillé des rencontres

Chaque rencontre reste un bloc Markdown libre :

```html
<!-- warbound:entry id="ENTRY_ID" -->
...
<!-- warbound:entry:end -->
```

L’importeur ne doit pas parser les rubriques internes.

Il ne doit pas chercher à extraire :

```text
Acteurs
Tension
Leviers
Évolution
Combat
Retombées
```

dans des structures Foundry spécifiques.

L’intégralité du bloc est transformée en HTML et devient le contenu de la `JournalEntryPage`.

---

# 14. Modèle interne

Le modèle interne existant reste suffisant.

Exemple :

```javascript
{
  schema: 1,
  collectionId: "durotar-razor-hill-senjin-encounters",
  title: "Rencontres — Route de Razor Hill à Sen’jin",
  type: "encounter",

  context: {
    markdown: "...",
    html: "..."
  },

  entries: [
    {
      index: 1,
      id: "grunt-empoisonne",
      title: "Le survivant sur le rocher",
      summary: "Un grunt blessé reste bloqué au-dessus d’un nid de scorpides.",
      weight: 1,
      active: true,
      markdown: "...",
      html: "..."
    }
  ]
}
```

Aucun modèle spécialisé :

```javascript
EncounterEntry
```

n’est nécessaire pour cette version.

---

# 15. Documents Foundry générés

Une collection `encounter` crée ou synchronise :

```text
1 JournalEntry
1 page Contexte
N JournalEntryPage
1 RollTable
N TableResult actifs
```

---

# 16. JournalEntry

Nom par défaut :

```text
warbound.title
```

Exemple :

```text
Rencontres — Route de Razor Hill à Sen’jin
```

Flags recommandés :

```javascript
flags: {
  "warbound-campaign-content": {
    markdownImport: {
      schema: 1,
      collectionId: "durotar-razor-hill-senjin-encounters",
      collectionType: "encounter"
    }
  }
}
```

Si le flag `collectionType` n’existe pas encore, son ajout est recommandé pour éviter de devoir reparcourir le contenu source afin d’identifier le type de collection.

---

# 17. Page Contexte

La page :

```text
Contexte
```

est générée comme aujourd’hui.

Elle contient tout le Markdown compris entre :

```text
fin du front matter
```

et :

```html
<!-- warbound:table:start -->
```

Le contexte d’une table de rencontres pourra notamment expliquer :

- périmètre ;
- ambiance ;
- population ;
- factions ;
- état actuel ;
- utilisation de la table ;
- circonstances dans lesquelles ne pas tirer.

L’importeur ne donne aucune sémantique particulière à ces rubriques.

---

# 18. Pages de rencontres

Chaque bloc :

```html
<!-- warbound:entry id="..." -->
```

devient une `JournalEntryPage`.

Nom :

```text
Titre de la ligne correspondante
```

Flags :

```javascript
collectionId
entryId
collectionType
sourceHash
```

au minimum selon les conventions réelles du module.

---

# 19. RollTable

La RollTable porte par défaut le même nom que la collection.

Exemple :

```text
Rencontres — Route de Razor Hill à Sen’jin
```

Valeurs :

```text
replacement: true
displayRoll: true
```

sauf évolution explicitement décidée ailleurs.

---

# 20. Pourquoi `replacement: true` reste cohérent

Une table de rencontres n’est pas nécessairement une pioche sans remise.

Certaines rencontres sont :

- récurrentes ;
- génériques ;
- susceptibles d’arriver plusieurs fois.

La gestion des rencontres uniques reste éditoriale via :

```text
Actif = oui / non
```

ou via une modification ultérieure de la source Markdown.

La V1 ne doit donc pas modifier automatiquement `replacement` selon le type de collection.

---

# 21. Résultat de RollTable attendu

Un tirage de rencontre doit fournir immédiatement :

```text
Le survivant sur le rocher

Un grunt blessé reste bloqué au-dessus
d’un nid de scorpides.

Ouvrir la rencontre
```

Le résultat doit contenir :

- titre ;
- aperçu ;
- lien UUID vers la page détaillée.

Pour `type: encounter`, le libellé d’action peut être :

```text
Ouvrir la rencontre
```

au lieu du libellé générique :

```text
Ouvrir la fiche
```

si l’UI actuelle permet facilement cette spécialisation.

Cette adaptation est ergonomique mais non bloquante.

---

# 22. Prévisualisation

La prévisualisation doit afficher le type de collection.

Exemple :

```text
Rencontres — Route de Razor Hill à Sen’jin

Type
Rencontres

Collection
durotar-razor-hill-senjin-encounters

12 rencontres
11 actives
1 inactive

Destination Journal
[ Au Nom de la Horde / Rencontres ]

Destination RollTable
[ Au Nom de la Horde / Tables de rencontres ]

────────────────────────────────

+ grunt-empoisonne
  Le survivant sur le rocher

~ eclaireurs-kolkar
  Ceux qui regardent derrière vous

= caravane-senjin
  Une caravane vers Sen’jin

○ tempete-poussiere
  Le mur rouge

────────────────────────────────

[Annuler] [Synchroniser]
```

---

# 23. Libellés métier dans l’UI

Lorsque :

```text
type = encounter
```

l’interface peut préférer :

```text
Rencontre
Rencontres
Table de rencontres
```

à :

```text
Entrée
Entrées
Table aléatoire
```

Exemples :

```text
12 rencontres
11 actives
1 inactive
```

et :

```text
Ouvrir la table de rencontres
```

Cette spécialisation doit rester limitée à la couche UI.

Le modèle de données doit rester générique.

---

# 24. Destinations

Le MJ choisit toujours :

## Dossier JournalEntry

Exemple :

```text
Au Nom de la Horde / Rencontres
```

## Dossier RollTable

Exemple :

```text
Au Nom de la Horde / Tables de rencontres
```

La V1 ne doit pas imposer ni créer automatiquement ces dossiers.

Elle utilise les dossiers sélectionnés par le MJ.

---

# 25. Synchronisation

Les règles de synchronisation existantes s’appliquent intégralement.

L’identité repose sur :

```text
collectionId
entryId
```

et jamais sur :

```text
titre
nom du Journal
nom de la RollTable
```

---

# 26. Réimport

Réimporter une table de rencontres doit permettre :

- d’ajouter une rencontre ;
- de modifier une rencontre ;
- de renommer une rencontre ;
- de modifier son aperçu ;
- de modifier son poids ;
- de la rendre inactive ;
- de modifier le contexte ;
- de supprimer sa présence de la RollTable sans supprimer automatiquement sa page ;
- de préserver les UUID.

---

# 27. Gestion des rencontres inactives

Une entrée :

```text
Actif = non
```

reste :

- dans le Journal ;
- avec sa page ;
- avec ses flags ;
- avec son UUID.

Elle est absente de la RollTable active.

Ce comportement est particulièrement utile pour les rencontres :

- déjà jouées ;
- devenues impossibles ;
- dépendantes d’un état antérieur du monde ;
- momentanément désactivées.

---

# 28. Rencontre unique : comportement V1

L’importeur ne doit pas automatiquement désactiver une rencontre après tirage.

Un tirage Foundry n’est pas nécessairement équivalent à :

```text
la rencontre a réellement été jouée et consommée
```

Le MJ peut :

- tirer pour préparer ;
- tirer puis relancer ;
- consulter un résultat sans l’utiliser.

La désactivation automatique introduirait donc une ambiguïté de workflow.

En V1 :

```text
aucune mutation de la source logique après tirage
```

---

# 29. Pondération

Le mécanisme existant reste inchangé.

Exemple :

```text
A poids 1
B poids 2
C poids 1
```

produit :

```text
1d4

1     A
2-3   B
4     C
```

Pour une table de rencontres, le poids représente uniquement :

> fréquence relative d’apparition.

Il ne représente pas :

- difficulté ;
- niveau ;
- NC ;
- danger ;
- priorité narrative.

---

# 30. Aucun calcul de difficulté

La prise en charge de `encounter` ne doit pas introduire de calcul automatique de difficulté.

L’importeur ne doit pas calculer :

- NC ;
- budget de rencontre ;
- nombre de créatures ;
- niveau recommandé ;
- puissance relative ;
- équilibre du combat.

Ces sujets appartiennent au game design et éventuellement à une future fonctionnalité dédiée.

---

# 31. Aucun Actor Foundry automatiquement requis

Une rencontre peut mentionner :

```text
scorpides
Kolkar
gardes
marchands
kodos
```

mais l’importeur ne doit pas essayer automatiquement de retrouver ou créer des `Actor`.

Le contenu reste textuel.

La V1 ne doit pas :

- rechercher un Actor par nom ;
- créer des Actors ;
- créer une Encounter Sheet COF2 ;
- placer des tokens ;
- créer une Scene ;
- créer un Combat ;
- calculer l’initiative.

---

# 32. Liens Foundry contenus dans le Markdown

Si le workflow actuel supporte déjà les liens Foundry présents dans le Markdown, ils doivent continuer à fonctionner.

Mais la nouvelle fonctionnalité ne doit pas dépendre de liens Actor ou Item obligatoires.

Une table de rencontres doit rester importable même si son contenu est entièrement textuel.

---

# 33. Pas de parsing des statistiques

Une rubrique :

```markdown
### Combat éventuel
```

peut contenir du texte comme :

```text
2 éclaireurs Kolkar et 1 estafette
```

L’importeur ne doit pas parser cette phrase.

Il ne doit pas transformer automatiquement ce contenu en stat block.

---

# 34. Validation technique

Les validations communes restent applicables.

Erreur bloquante si :

- front matter absent ;
- `schema` absent ;
- schema inconnu ;
- ID de collection absent ;
- titre absent ;
- table absente ;
- plusieurs tables déclarées ;
- colonne obligatoire absente ;
- ID vide ;
- ID dupliqué ;
- bloc dupliqué ;
- entrée active sans bloc ;
- poids invalide ;
- valeur `Actif` invalide.

---

# 35. Validation spécifique du type

Pour une source contenant :

```yaml
type: encounter
```

le type doit être reconnu comme valide.

Si l’implémentation actuelle maintient une liste fermée de types autorisés, ajouter :

```text
encounter
```

à cette liste.

Si l’implémentation actuelle accepte n’importe quelle chaîne non vide, conserver cette souplesse mais reconnaître `encounter` comme type métier connu pour l’UI.

---

# 36. Pas de validation sémantique des rubriques

Ne pas rendre bloquante l’absence d’une rubrique comme :

```text
Tension
Leviers des PJ
Combat éventuel
```

Le contrat technique ne doit pas dépendre de la structure éditoriale exacte du prompt.

Un fichier valide techniquement reste importable même si une rencontre possède seulement :

```markdown
## Titre

Une description.
```

La qualité du game design appartient au générateur ou à l’auteur du Markdown, pas au validator Foundry.

---

# 37. Warnings possibles

Les warnings génériques restent applicables :

- aperçu vide ;
- aucun résultat actif ;
- titre dupliqué ;
- index avec trous ;
- bloc orphelin.

Optionnellement, pour `type: encounter`, l’UI peut reformuler :

```text
L’aperçu de la rencontre "..." est vide.
```

au lieu de :

```text
L’aperçu de l’entrée "..." est vide.
```

---

# 38. Hash et détection de modifications

Le mécanisme de hash existant doit continuer à fonctionner.

Le hash d’une rencontre doit prendre en compte au minimum :

- sa ligne de table ;
- son contenu Markdown détaillé.

Une modification de :

```text
Titre
Aperçu
Poids
Actif
contenu détaillé
```

doit être détectable.

---

# 39. Préservation des UUID

Les UUID doivent rester stables lorsqu’une rencontre est modifiée.

Exemple :

```text
entryId = grunt-empoisonne
```

reste identique.

Si le titre passe de :

```text
Le survivant sur le rocher
```

à :

```text
Le grunt encerclé
```

alors :

- la page existante est renommée ;
- son UUID reste identique ;
- le résultat de RollTable est mis à jour ;
- aucun doublon n’est créé.

---

# 40. Orphelins

Si une rencontre existante dans Foundry disparaît du Markdown :

```text
Foundry
grunt-empoisonne

Markdown
absent
```

elle devient :

```text
orpheline
```

En V1 :

- ne pas supprimer automatiquement la page ;
- afficher le warning ;
- ne plus l’ajouter à la RollTable reconstruite.

---

# 41. Architecture de code

Conserver l’architecture commune de l’importeur.

Conceptuellement :

```text
WarboundMarkdownImporterApp
WarboundMarkdownParser
WarboundMarkdownValidator
WarboundImportSynchronizer
WarboundDocumentGenerator
```

Ne créer un composant spécialisé `Encounter` que si un besoin concret apparaît réellement.

Pour cette évolution, aucun composant spécialisé n’est requis par principe.

---

# 42. Extension recommandée : registre des types métier

Si le code commence à avoir plusieurs comportements de présentation selon :

```text
rumor
hook
encounter
```

éviter des cascades répétées :

```javascript
if (type === "rumor") ...
else if (type === "hook") ...
else if (type === "encounter") ...
```

dans plusieurs fichiers.

Préférer un petit registre métier conceptuel :

```javascript
const COLLECTION_TYPES = {
  rumor: {
    singularLabel: "Rumeur",
    pluralLabel: "Rumeurs",
    tableLabel: "Table de rumeurs"
  },
  hook: {
    singularLabel: "Accroche",
    pluralLabel: "Accroches",
    tableLabel: "Table d’accroches"
  },
  encounter: {
    singularLabel: "Rencontre",
    pluralLabel: "Rencontres",
    tableLabel: "Table de rencontres"
  }
};
```

Le nom exact et l’emplacement doivent respecter l’architecture réelle du module.

Ne pas créer ce registre si aucun comportement type-spécifique n’est finalement nécessaire.

---

# 43. Modification de la prévisualisation

La prévisualisation devrait maintenant afficher explicitement :

```text
Type
Rencontres
```

Cela permet au MJ de détecter immédiatement une erreur de source.

Exemple :

```text
Rencontres — Thunder Ridge

Type : Rencontres
ID : durotar-thunder-ridge-encounters

10 rencontres
10 actives
0 inactive
```

---

# 44. Notification finale

Exemple :

```text
Warbound

Rencontres — Thunder Ridge synchronisées.

10 rencontres
3 créées
2 mises à jour
5 inchangées
0 inactive
0 erreur
```

Actions :

```text
Ouvrir le Journal
Ouvrir la table de rencontres
```

---

# 45. Permissions

Aucun changement.

L’outil reste réservé aux GM.

Les pages de rencontres peuvent contenir :

- vérités cachées ;
- intentions de factions ;
- complications ;
- informations secrètes ;
- issues de combat.

Elles restent donc invisibles aux joueurs par défaut.

---

# 46. Non-objectifs de cette évolution

Ne pas implémenter dans cette évolution :

- générateur IA de rencontres dans Foundry ;
- génération de rencontres depuis plusieurs tables imbriquées ;
- tables météo automatiques ;
- tirage automatique à intervalles réguliers ;
- moteur de voyage ;
- calcul automatique de probabilité d’occurrence ;
- désactivation automatique après tirage ;
- création de Combat Foundry ;
- création automatique d’Actors ;
- recherche automatique d’Actors ;
- création de tokens ;
- création de Scenes ;
- création automatique de battlemap ;
- calcul de NC ;
- équilibrage de combat ;
- génération de butin ;
- génération de stat blocks ;
- filtrage runtime par biome ;
- filtrage runtime par météo ;
- filtrage runtime par heure ;
- filtrage runtime par faction ;
- moteur d’état de campagne ;
- plusieurs RollTables depuis un seul fichier ;
- sous-tables ;
- tables imbriquées.

Ces fonctionnalités pourront être étudiées séparément si un besoin réel apparaît.

---

# 47. Critère d’acceptation — import initial d’une table de rencontres

Étant donné :

```yaml
warbound:
  schema: 1
  id: test-encounters
  title: Rencontres de test
  type: encounter
```

et trois rencontres actives,

lorsque le MJ importe et confirme,

alors Foundry contient :

```text
1 JournalEntry
1 page Contexte
3 pages de rencontre
1 RollTable
3 TableResult
```

---

# 48. Critère d’acceptation — contenu libre

Étant donné une rencontre contenant :

```markdown
### En un regard
...

### Tension
...

### Combat éventuel
...
```

l’importeur :

- ne tente pas de parser ces headings ;
- conserve leur ordre ;
- convertit leur Markdown en HTML ;
- affiche correctement le résultat dans la page.

---

# 49. Critère d’acceptation — nombre variable d’entrées

Étant donné :

```text
7 rencontres actives
```

la RollTable est générée avec une formule correspondant à la somme de leurs poids.

L’importeur ne doit exiger ni :

```text
20 entrées
```

ni :

```text
1d20
```

---

# 50. Critère d’acceptation — rencontre inactive

Étant donné :

```text
tempete-poussiere
Actif = non
```

alors :

- la page existe ;
- son UUID est conservé ;
- elle n’apparaît pas dans la RollTable active.

---

# 51. Critère d’acceptation — modification de l’état du monde

Étant donné une rencontre existante dont le contenu détaillé est modifié dans le Markdown pour refléter l’évolution de la campagne,

au réimport :

- la rencontre est détectée comme modifiée ;
- la page est mise à jour ;
- son UUID est conservé ;
- aucune nouvelle page n’est créée.

---

# 52. Critère d’acceptation — renommage

Étant donné :

```text
entryId = eclaireurs-kolkar
```

inchangé,

mais :

```text
Titre A
→
Titre B
```

alors :

- la page existante est renommée ;
- le TableResult est mis à jour ;
- les flags restent associés au même `entryId` ;
- aucun doublon n’apparaît.

---

# 53. Critère d’acceptation — poids

Étant donné :

```text
A poids 2
B poids 1
C poids 3
```

la RollTable utilise :

```text
1d6
```

avec :

```text
1-2 A
3   B
4-6 C
```

Le fait que la collection soit de type `encounter` ne modifie pas l’algorithme.

---

# 54. Critère d’acceptation — rétrocompatibilité

Après ajout du support `encounter` :

- une collection `rumor` existante reste importable ;
- une collection `hook` existante reste importable ;
- les règles de synchronisation existantes restent identiques ;
- aucun document Foundry existant n’est migré automatiquement.

---

# 55. Critère d’acceptation — source invalide

Une source `encounter` invalide ne doit provoquer :

- aucune création ;
- aucune modification ;
- aucune suppression.

Le MJ reçoit un diagnostic exploitable.

---

# 56. Tests recommandés — parser

Ajouter au minimum :

- front matter `type: encounter` ;
- contexte de table de rencontres ;
- heading `## Table de rencontres` ;
- nombre variable d’entrées ;
- blocs détaillés avec plusieurs headings ;
- bloc sans section `Combat éventuel` ;
- bloc très court ;
- caractères accentués ;
- citations ;
- tableaux Markdown internes ;
- listes.

---

# 57. Tests recommandés — validator

Ajouter :

- `type: encounter` reconnu ;
- ID de rencontre dupliqué ;
- entrée active sans bloc ;
- bloc sans ligne ;
- poids incorrect ;
- `Actif` incorrect ;
- table absente ;
- aucune rencontre active.

Ne pas ajouter de test exigeant la présence de :

```text
Tension
Acteurs
Leviers des PJ
Combat éventuel
```

---

# 58. Tests recommandés — synchronizer

Tester :

- nouvelle table de rencontres ;
- collection existante ;
- nouvelle rencontre ;
- rencontre modifiée ;
- rencontre inchangée ;
- rencontre inactive ;
- rencontre orpheline ;
- renommage avec ID stable ;
- changement de poids ;
- modification du contexte.

---

# 59. Tests recommandés — RollTable

Tester :

- une seule rencontre ;
- plusieurs rencontres ;
- poids uniformes ;
- poids différents ;
- rencontre inactive ;
- aucune rencontre active ;
- liens UUID vers les bonnes pages ;
- titre + aperçu correctement rendus.

---

# 60. Découpage recommandé en issues

Cette évolution devrait rester relativement compacte puisque l’architecture principale existe déjà.

Découpage proposé :

## Issue 1 — Ajouter `encounter` comme type métier Warbound

Inclure :

- reconnaissance du type ;
- labels ;
- flags éventuels ;
- rétrocompatibilité.

## Issue 2 — Adapter la prévisualisation et les libellés UI

Inclure :

- type visible ;
- libellés Rencontre / Rencontres ;
- « Table de rencontres » ;
- notification finale.

## Issue 3 — Tests d’import et de synchronisation des collections `encounter`

Inclure :

- parser ;
- validator ;
- synchronizer ;
- RollTable ;
- contenu détaillé libre ;
- nombre variable d’entrées.

## Issue 4 — Documentation utilisateur

Inclure :

- exemple source ;
- workflow d’import ;
- comportement des poids ;
- entrées actives/inactives ;
- réimport.

Si le code actuel accepte déjà nativement n’importe quel `type` et ne possède aucun label spécifique, les issues 1 et 2 pourront éventuellement être regroupées.

---

# 61. Point d’attention avant développement

Avant de coder, inspecter l’implémentation actuelle pour répondre à ces questions :

1. `warbound.type` est-il actuellement validé contre une liste fermée ?
2. Le type est-il déjà stocké dans les flags Foundry ?
3. Le type est-il utilisé par l’UI ?
4. Les headings internes aux blocs sont-ils réellement traités comme Markdown libre ?
5. Le nombre de lignes est-il totalement dynamique ?
6. Le titre `## Table aléatoire` est-il interprété ou seulement décoratif ?
7. La génération de RollTable dépend-elle uniquement des marqueurs et colonnes ?
8. Les libellés `Entrée` / `Entrées` sont-ils codés en dur ?
9. Le résultat de RollTable permet-il facilement un libellé spécifique comme `Ouvrir la rencontre` ?
10. Les tests actuels couvrent-ils un `type` non `rumor` ?

Aucune évolution ne doit être implémentée sur la base d’une hypothèse concernant ces points.

---

# 62. Doctrine d’implémentation

Priorités :

```text
réutilisation du pipeline existant
>
simplicité
>
rétrocompatibilité
>
idempotence
>
ergonomie MJ
>
spécialisation métier
```

La prise en charge des rencontres ne doit pas devenir un prétexte pour transformer l’importeur en moteur de scénario.

---

# 63. Définition de Done

La fonctionnalité est terminée lorsqu’un MJ peut :

1. générer un Markdown Warbound avec `type: encounter` ;
2. l’importer avec l’outil existant ;
3. voir clairement qu’il s’agit d’une collection de rencontres ;
4. choisir le dossier du Journal ;
5. choisir le dossier de la RollTable ;
6. créer le Journal de rencontres ;
7. obtenir une page de contexte ;
8. obtenir une page détaillée par rencontre ;
9. tirer immédiatement dans la RollTable ;
10. lire le titre et l’aperçu sans ouvrir la page ;
11. ouvrir la rencontre détaillée depuis le résultat ;
12. modifier le Markdown ;
13. le réimporter sans doublon ;
14. conserver les UUID ;
15. ajouter ou désactiver des rencontres ;
16. modifier les poids ;
17. constater les rencontres nouvelles, modifiées, inchangées, inactives ou orphelines ;
18. continuer à importer sans régression les collections existantes.

---

# 64. Décision finale

La bonne évolution n’est pas :

```text
Créer un nouvel importeur de tables de rencontres
```

mais :

```text
Faire de `encounter`
un type métier de premier rang
dans l’importeur Warbound Markdown existant.
```

Le contrat technique reste volontairement simple :

```text
Front matter
+
Contexte libre
+
Table normalisée
+
Blocs Markdown libres
```

Cette simplicité permet au game design des rencontres d’évoluer indépendamment de l’importeur, tout en conservant une projection Foundry immédiatement exploitable.
