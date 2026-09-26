# Guide utilisateur — Importer une table de rencontres Warbound

Ce guide explique comment préparer un fichier Markdown `type: encounter` et l'importer dans Foundry VTT via l'importeur Warbound Markdown.

---

## 1. Format source attendu

Un fichier de collection `encounter` se compose de trois parties : le front matter YAML, le contexte libre, la table normalisée et les blocs d'entrée.

### Front matter YAML

```yaml
---
warbound:
  schema: 1
  id: durotar-razor-hill-senjin-encounters
  title: Rencontres Sen'jin — Razor Hill
  type: encounter
---
```

- `schema` : version du format Warbound (toujours `1` pour l'instant)
- `id` : identifiant unique de la collection, stable entre imports
- `title` : nom affiché dans la prévisualisation et comme titre Journal
- `type` : doit être `encounter` pour déclencher le pipeline de tables de rencontres

### Contexte libre

Après le front matter, un bloc de texte libre décrit le périmètre, l'ambiance et les conditions d'utilisation. Il est importé comme page de contexte dans le Journal.

```markdown
## Contexte

Aux abords de Razor Hill, des éclaireurs Darkspear signalent des mouvements suspects
près de l'entrée du désert. Le MJ peut utiliser ces rencontres lors de tout transit
entre le village et les chemins sablonneux.
```

### Table normalisée

La table doit être encadrée par les balises `<!-- warbound:table:start -->` et `<!-- warbound:table:end -->`. Elle définit les rencontres et leurs poids de tirage.

```markdown
<!-- warbound:table:start -->

## Table de rencontres

| Index | ID | Titre | Aperçu | Poids | Actif |
|---:|---|---|---|---:|---|
| 1 | patrouille-de-sable | Patrouille des sables | Un groupe de Centaures rôde à distance de Razor Hill. | 2 | oui |
| 2 | eclaireurs-kul-tiras | Éclaireurs de Kul'Tiras | Des soldats humains observent la piste en silence. | 3 | oui |
| 3 | caravane-pillee | Caravane pillée | Une caravane abandonnée bloque le chemin étroit. | 1 | non |

<!-- warbound:table:end -->
```

Colonnes obligatoires :

| Colonne | Description |
|---|---|
| `Index` | Numéro d'ordre (entier, unique dans la collection) |
| `ID` | Identifiant kebab-case unique, stable entre réimports |
| `Titre` | Nom de la rencontre, affiché dans le Journal et la RollTable |
| `Aperçu` | Résumé court affiché dans la RollTable comme description du résultat |
| `Poids` | Entier positif, poids de tirage relatif |
| `Actif` | `oui` ou `non` — contrôle la présence dans la RollTable |

### Blocs `warbound:entry`

Chaque entrée de la table doit avoir un bloc `warbound:entry` correspondant. La structure interne est libre (rubriques Markdown `###` au choix).

```markdown
<!-- warbound:entry id="patrouille-de-sable" -->

## Patrouille des sables

Une patrouille de cinq Centaures se déplace en formation serrée.

### En un regard

Le groupe avance vers les PJ sans les avoir repérés.

### Acteurs

- **Chef Gronscar** — méfiant, réagit mal à toute approche directe

### Tension

Chaque PJ en armure lourde ajoute un cran à la réaction hostile.

<!-- warbound:entry:end -->
```

L'attribut `id` doit correspondre exactement à la colonne `ID` de la table.

---

## 2. Workflow d'import

1. Ouvrir l'importeur, soit depuis **Paramètres → Modules → warbound-campaign-content → Importer un document Warbound Markdown**, soit via le bouton **Importer un document Warbound** dans la barre latérale gauche.
2. Dans le champ **Sélectionnez un fichier Warbound Markdown (.md)**, choisir le fichier préparé.
3. Lire la **prévisualisation** : type détecté, identifiant de collection, nombre de rencontres, et l'état de chaque ligne (voir §5).
4. Choisir le **dossier Journal** de destination dans la liste déroulante (ou *Racine* pour ne pas placer le Journal dans un dossier).
5. Choisir le **dossier Table** de destination pour la RollTable.
6. Cliquer sur **Synchroniser**.
7. Lire le **bilan** : rencontres créées, mises à jour, inchangées, inactives.

Les deux listes déroulantes ne listent que les dossiers **existants** du type correspondant ; l'importeur ne crée pas de dossier. Créez le dossier au préalable dans Foundry si nécessaire.

---

## 3. Poids et formule RollTable

Les poids de la colonne `Poids` sont additionnés sur les entrées **actives uniquement**. L'importeur génère automatiquement une formule `1dN` où N est la somme des poids actifs, et assigne des plages consécutives à chaque résultat.

**Exemple** avec la fixture ci-dessus (entrée 3 inactive) :

| Entrée | Poids | Plage |
|---|---|---|
| Patrouille des sables | 2 | 1–2 |
| Éclaireurs de Kul'Tiras | 3 | 3–5 |

Formule RollTable : `1d5`.

La rencontre avec le poids le plus élevé est proportionnellement plus probable. Ajuster les poids dans le Markdown et réimporter suffit à rééquilibrer la table.

---

## 4. Entrées actives / inactives

La colonne `Actif` contrôle la présence d'une rencontre dans la RollTable sans supprimer son contenu.

| Valeur | Effet |
|---|---|
| `oui` | La rencontre est présente dans la RollTable avec sa plage de poids |
| `non` | La page Journal est conservée et son UUID reste stable ; la rencontre est absente de la RollTable |

**Cas d'usage courants :**
- Rencontre déjà jouée : passer à `non` pour la retirer du tirage sans perdre les notes.
- Rencontre saisonnière : désactiver hors saison, réactiver sans perte d'UUID ni de liens.

Le changement de `Actif` est détecté au réimport et la RollTable est reconstruite en conséquence.

---

## 5. Réimport

L'importeur est idempotent : relancer un import sur une collection déjà présente ne crée pas de doublons.

Lors d'une prévisualisation, chaque rencontre est classée selon son état, indiqué par un marqueur en tête de ligne :

| Symbole | État | Effet au réimport |
|---|---|---|
| `+` | Nouvelle (absente de Foundry) | Page créée, UUID assigné |
| `~` | Modifiée (titre ou HTML changé) | Page mise à jour, UUID conservé |
| `=` | Inchangée (empreinte identique) | Aucune écriture Foundry |
| `○` | Inactive (`Actif: non`) | Page conservée, absente de la RollTable |
| `!` | Orpheline (dans Foundry, absente du Markdown) | Page conservée, absente de la RollTable — voir §6 |

Le récompte par état est affiché en haut de la prévisualisation.

**Garanties de stabilité :**
- L'UUID de chaque page Journal est déterminé par l'`ID` de l'entrée et ne change jamais entre imports.
- Les flags Warbound (`collectionType`, `entryId`, `sourceHash`) sont préservés.
- Les liens existants vers les pages ne sont pas cassés par un réimport.

---

## 6. Orphelins

Une rencontre est **orpheline** si elle est présente dans Foundry (créée lors d'un import précédent) mais absente du fichier Markdown courant.

Comportement de l'importeur :
- La rencontre est listée dans la **prévisualisation** avec le marqueur `!` et comptée dans le résumé d'état.
- La page Journal est **conservée** (aucune suppression automatique).
- La rencontre est **absente de la RollTable** reconstruite, qui ne contient que les entrées actives du Markdown.
- Elle n'est **pas** comptabilisée dans le bilan de synchronisation post-import, qui ne couvre que les quatre états `+`, `~`, `=` et `○`.

Cela protège contre les suppressions accidentelles dues à un fichier incomplet ou à une rencontre temporairement retirée du Markdown. Pour supprimer définitivement une rencontre, la retirer manuellement depuis Foundry après l'import.
