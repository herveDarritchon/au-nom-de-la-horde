# Warbound — Direction artistique des Journaux Foundry VTT

Cette V0.1 applique un look éditorial Warbound à tous les Journaux du monde dès que le module `warbound-campaign-content` est actif.

## Fichiers ajoutés

```text
styles/warbound.css
scripts/warbound.mjs
assets/ui/warbound-paper.svg
assets/ui/warbound-divider.svg
assets/ui/warbound-corner.svg
examples/journal-components.html
```

Le `module.json` est également modifié pour charger le CSS et l'ES module.

## Installation

Copie les nouveaux dossiers à la racine de ton module puis remplace ton `module.json` par celui fourni.

Structure attendue :

```text
warbound-campaign-content/
├── module.json
├── assets/
│   └── ui/
│       ├── warbound-corner.svg
│       ├── warbound-divider.svg
│       └── warbound-paper.svg
├── examples/
│   └── journal-components.html
├── scripts/
│   └── warbound.mjs
├── styles/
│   └── warbound.css
└── packs/
    ├── adventures/
    ├── items/
    ├── journals/
    └── scenes/
```

Redémarre Foundry après modification du manifeste. Ensuite active le module dans le monde SWADE.

## Ce qui est automatique

Sans modifier tes Journaux existants, tu obtiens :

- fenêtre de Journal sombre façon fer ;
- surface de lecture parchemin discret ;
- H1/H2/H3 éditoriaux ;
- tables retravaillées ;
- listes avec marqueurs Warbound ;
- images et légendes plus éditoriales ;
- liens et séparateurs harmonisés.

## Composants optionnels

Pour obtenir le rendu complet, utilise l'éditeur **Source HTML** d'une page de Journal et copie les blocs disponibles dans `examples/journal-components.html`.

Classes principales :

- `wb-page` : page Warbound ;
- `wb-kicker` : surtitre ;
- `wb-lead` : chapô ;
- `wb-dropcap` : lettrine ;
- `wb-readaloud` : texte à lire ;
- `wb-box wb-gm` : note MJ sombre ;
- `wb-box wb-lore` : lore canon ;
- `wb-box wb-clue` : indice ;
- `wb-box wb-danger` : danger ;
- `wb-box wb-rule` : règle / procédure ;
- `wb-box wb-npc` : PNJ ;
- `wb-statblock` : bloc de statistiques ;
- `wb-columns` : deux colonnes ;
- `wb-hero` : grande image en tête ;
- `wb-portrait` : portrait flottant à droite ;
- `wb-tag` : étiquette courte.

## Variantes

La DA est Horde par défaut. Pour une page neutre :

```html
<article class="wb-page wb-neutral">
```

Pour une future campagne Alliance :

```html
<article class="wb-page wb-alliance">
```

## Choix de design

La DA ne reproduit pas l'interface de World of Warcraft. Le lien à Warcraft passe par une combinaison de parchemin, fer sombre, bronze, rouge profond, géométrie tribale et mise en page illustrée. L'objectif est un rendu de **livre de campagne Warbound**, pas un skin d'interface MMO.

## Développement

Le manifeste contient un bloc `flags.hotReload` pour que les changements dans `styles`, `scripts`, `assets` et `examples` puissent être pris en compte plus facilement pendant le développement lorsque l'option de hot reload Foundry est utilisée.
