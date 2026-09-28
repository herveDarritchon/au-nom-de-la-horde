# Audit technique — migration du HTML inline vers Handlebars (HBS)

**Projet :** `warbound-campaign-content`  
**Cible :** Foundry Virtual Tabletop v14  
**Objet :** recenser tout le HTML produit ou assemblé dans le code JavaScript du module, puis le refactorer afin que la couche de présentation soit portée par des fichiers `.hbs`.

---

## 1. Objectif

L’audit doit répondre à deux questions :

1. **Où le module génère-t-il aujourd’hui du HTML dans le code JavaScript ?**
2. **Comment déplacer ce HTML vers des templates Handlebars sans modifier le comportement fonctionnel du module ?**

Le résultat attendu n’est pas seulement un déplacement mécanique de chaînes de caractères. Le refactoring doit clarifier la séparation des responsabilités :

- **JavaScript** : données, état, logique, permissions, appels Foundry, actions et événements ;
- **Handlebars** : structure HTML et présentation ;
- **CSS** : apparence ;
- **localisation** : textes d’interface destinés à être traduits.

### Règle cible

> Le JavaScript ne doit plus contenir de markup HTML servant à construire une vue, une boîte de dialogue, un fragment d’interface ou un message structuré.

Le JavaScript prépare un **contexte de rendu**, puis demande à Handlebars de produire le HTML.

---

# 2. Périmètre de l’audit

L’audit doit couvrir au minimum :

- `src/`
- `scripts/`
- `module/`
- `tools/` si du code exécuté côté Foundry s’y trouve
- tout autre répertoire contenant des `.js`, `.mjs` ou `.ts`

Les répertoires générés ou externes doivent être exclus :

- `node_modules/`
- `dist/`
- `build/`
- `packs/`
- fichiers minifiés ;
- bibliothèques tierces copiées dans le projet ;
- artefacts générés automatiquement.

Les fichiers `.hbs`, `.html`, `.css`, `.json`, YAML de compendiums et données de contenu ne sont pas eux-mêmes la cible de la recherche de HTML inline JavaScript.

---

# 3. Ce qui doit être recensé

## 3.1 Chaînes HTML dans le JavaScript

Rechercher en priorité :

```js
const html = `<div class="...">...</div>`;
```

```js
return `
  <section>
    ...
  </section>
`;
```

```js
const content = "<p>...</p>";
```

Cela inclut :

- template literals avec backticks ;
- chaînes simples ou doubles ;
- concaténations de chaînes ;
- fragments HTML construits dans plusieurs variables.

---

## 3.2 Affectations DOM utilisant du HTML

Rechercher :

```js
element.innerHTML = ...
element.outerHTML = ...
element.insertAdjacentHTML(...)
```

Ces usages doivent être classés.

Lorsqu’ils représentent une **vue ou un fragment de vue**, ils doivent être remplacés par un rendu HBS.

---

## 3.3 jQuery injectant du markup

Rechercher notamment :

```js
.html(...)
.append(...)
.prepend(...)
.before(...)
.after(...)
.replaceWith(...)
```

Attention : ces méthodes ne sont pas problématiques si elles reçoivent un élément DOM déjà construit ou un résultat externe. L’audit doit identifier uniquement les cas où elles reçoivent du HTML créé par le module.

---

## 3.4 Contenu HTML passé aux APIs Foundry

Inspecter notamment les constructions de :

- boîtes de dialogue ;
- applications ;
- formulaires ;
- messages de chat ;
- notifications enrichies ;
- fenêtres ou panneaux personnalisés ;
- tooltips complexes ;
- contrôles injectés dans l’interface Foundry.

Exemples typiques :

```js
Dialog...
```

```js
ChatMessage.create({
  content: `<div>...</div>`
});
```

```js
const content = `<form>...</form>`;
```

Le fait qu’une API Foundry attende une chaîne HTML **ne justifie pas** de conserver le markup dans le JavaScript : le HTML peut être rendu auparavant depuis un `.hbs`.

---

## 3.5 Méthodes de rendu personnalisées

Inspecter particulièrement :

- `_renderHTML`
- `_replaceHTML`
- `_prepareContext`
- `_preparePartContext`
- `render`
- méthodes nommées `render*`, `build*`, `create*`, `getHTML*`, `getContent*`

Une méthode qui construit explicitement une chaîne HTML constitue un candidat prioritaire au refactoring.

---

## 3.6 Création impérative d’éléments DOM

Exemple :

```js
const button = document.createElement("button");
button.classList.add("foo");
button.innerHTML = "...";
```

Deux cas doivent être distingués :

### A. Composant de vue

Si plusieurs éléments sont assemblés pour représenter une UI cohérente, préférer un template HBS.

### B. Manipulation DOM ponctuelle

Une création impérative très locale peut rester en JavaScript si elle ne constitue pas une vue et n’embarque pas de markup complexe.

Elle doit néanmoins apparaître dans l’audit avec la décision :

> **Conserver en DOM impératif — pas un template de vue.**

L’objectif n’est pas de transformer artificiellement chaque `document.createElement()` en template.

---

# 4. Recherches automatiques à effectuer

Les recherches automatiques servent à créer une **liste de candidats**. Elles ne remplacent pas la lecture du code.

Depuis la racine du projet :

```bash
rg -n \
  --glob '*.{js,mjs,ts}' \
  --glob '!node_modules/**' \
  --glob '!dist/**' \
  --glob '!build/**' \
  'innerHTML|outerHTML|insertAdjacentHTML' .
```

```bash
rg -n \
  --glob '*.{js,mjs,ts}' \
  --glob '!node_modules/**' \
  '\.(html|append|prepend|before|after|replaceWith)\s*\(' .
```

Recherche de template literals contenant vraisemblablement du markup :

```bash
rg -n -U --pcre2 \
  --glob '*.{js,mjs,ts}' \
  --glob '!node_modules/**' \
  '(?s)`[^`]*<[A-Za-z][^>]*>[^`]*`' .
```

Recherche des zones Foundry à examiner manuellement :

```bash
rg -n \
  --glob '*.{js,mjs,ts}' \
  'ChatMessage|Dialog|ApplicationV2|HandlebarsApplicationMixin|_renderHTML|content\s*:' .
```

Recherche de construction DOM :

```bash
rg -n \
  --glob '*.{js,mjs,ts}' \
  'createElement|createDocumentFragment|DOMParser' .
```

### Important

Ces commandes produiront des faux positifs :

- comparaisons mathématiques utilisant `<` ;
- documentation ;
- SVG ;
- chaînes contenant du texte ressemblant à du markup ;
- HTML fourni comme donnée et non comme vue ;
- tests.

Chaque résultat doit donc être **qualifié manuellement**.

---

# 5. Inventaire à produire

Créer un tableau exhaustif.

| ID | Fichier | Ligne | Classe / fonction | Usage | Type de HTML | Complexité | Cible HBS | Priorité | Statut |
|---|---|---:|---|---|---|---|---|---|---|
| HTML-001 | `src/...mjs` | 123 | `FooApp` | Fenêtre | template literal | moyenne | `templates/apps/foo/body.hbs` | haute | À migrer |
| HTML-002 | `src/...mjs` | 87 | `renderResult()` | Chat | concaténation | faible | `templates/chat/result.hbs` | moyenne | À migrer |
| HTML-003 | `src/...mjs` | 44 | `addControl()` | DOM ponctuel | createElement | faible | — | basse | Conservé |

Pour chaque entrée, ajouter si nécessaire :

- données injectées dans le HTML ;
- localisation utilisée ;
- permissions ou visibilité ;
- événements attachés ;
- CSS dépendant de la structure actuelle ;
- dépendances avec d’autres composants ;
- risque de régression.

---

# 6. Classification des occurrences

Chaque occurrence doit être classée dans l’une des catégories suivantes.

## HBS-A — Application complète

Exemple :

- écran de configuration ;
- gestionnaire ;
- fenêtre custom ;
- formulaire complexe.

**Traitement recommandé :**

`ApplicationV2` + `HandlebarsApplicationMixin` + `PARTS`.

---

## HBS-B — Partie d’une ApplicationV2

Exemple :

- header ;
- liste ;
- onglet ;
- footer ;
- formulaire secondaire.

**Traitement recommandé :**

utiliser les `PARTS` Handlebars afin de permettre un rendu partiel.

---

## HBS-C — Fragment ponctuel

Exemple :

- tooltip ;
- élément injecté dans une interface existante ;
- petit bloc produit par un hook.

**Traitement recommandé :**

```js
await foundry.applications.handlebars.renderTemplate(path, context);
```

---

## HBS-D — Message de chat

Le contenu visuel d’un message doit être un template dédié :

```text
templates/chat/
```

Le JavaScript prépare les données et appelle le renderer avant de créer le `ChatMessage`.

---

## HBS-E — Dialogue

Le corps d’un dialogue doit être déplacé vers :

```text
templates/dialogs/
```

Le JS conserve :

- les callbacks ;
- les validations ;
- les actions ;
- la préparation des données.

---

## HBS-F — Partial / composant réutilisable

Utiliser un partial lorsque la même structure apparaît dans plusieurs vues :

- ligne d’objet ;
- badge ;
- carte ;
- bloc d’état ;
- bouton spécialisé ;
- résumé d’entité.

Ne pas créer un partial pour trois lignes utilisées une seule fois.

---

## DOM — Manipulation impérative légitime

Pas de migration HBS obligatoire si le code :

- manipule un élément déjà rendu ;
- ajoute ou retire une classe ;
- change un attribut ;
- déplace un nœud existant ;
- gère une interaction purement comportementale.

---

# 7. Architecture HBS cible

Structure recommandée :

```text
templates/
├── apps/
│   ├── ...
│   └── ...
├── dialogs/
│   └── ...
├── chat/
│   └── ...
├── components/
│   └── ...
└── partials/
    └── ...
```

Éviter un répertoire `templates/` plat contenant plusieurs dizaines de fichiers sans logique.

Les noms doivent décrire la fonction de la vue, pas le nom de la méthode qui la rend.

Exemple :

```text
templates/dialogs/import-cof2-preview.hbs
```

plutôt que :

```text
templates/renderDialog2.hbs
```

---

# 8. Convention de chemin

Centraliser le chemin racine :

```js
export const MODULE_ID = "warbound-campaign-content";

export const TEMPLATE_ROOT =
  `modules/${MODULE_ID}/templates`;
```

Puis :

```js
const html =
  await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_ROOT}/dialogs/example.hbs`,
    context
  );
```

Éviter de disperser partout :

```js
"modules/warbound-campaign-content/templates/..."
```

---

# 9. Refactoring d’une ApplicationV2

Pour une application complète, préférer l’architecture native Handlebars de Foundry v14.

```js
const {
  ApplicationV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

export class ExampleApp extends
  HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    body: {
      template:
        "modules/warbound-campaign-content/templates/apps/example/body.hbs"
    }
  };

  async _prepareContext(options) {
    return {
      ...(await super._prepareContext(options)),
      title: "Example",
      entries: this.entries
    };
  }
}
```

Template :

```hbs
<section class="warbound example-app">
  <h2>{{title}}</h2>

  <ul>
    {{#each entries}}
      <li>{{this.name}}</li>
    {{/each}}
  </ul>
</section>
```

### Principe

Le contexte doit être préparé en JavaScript.

Éviter de déplacer la logique métier vers Handlebars.

Mauvais :

```hbs
{{!-- beaucoup de calculs et de logique métier --}}
```

Bon :

```js
context.entries = entries.map(entry => ({
  name: entry.name,
  isAvailable: computeAvailability(entry)
}));
```

Puis :

```hbs
{{#if isAvailable}}
...
{{/if}}
```

---

# 10. Refactoring d’un fragment inline

## Avant

```js
const html = `
  <div class="warbound-result">
    <strong>${name}</strong>
    <span>${value}</span>
  </div>
`;

container.insertAdjacentHTML("beforeend", html);
```

## Après

### `templates/components/result.hbs`

```hbs
<div class="warbound-result">
  <strong>{{name}}</strong>
  <span>{{value}}</span>
</div>
```

### JavaScript

```js
const html =
  await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_ROOT}/components/result.hbs`,
    { name, value }
  );

container.insertAdjacentHTML("beforeend", html);
```

### Étape suivante éventuelle

Si le fragment appartient à une application contrôlée par le module, il est préférable de **rerendre la partie concernée** plutôt que d’effectuer une injection manuelle.

---

# 11. Refactoring d’un message de chat

## Avant

```js
await ChatMessage.create({
  content: `
    <div class="warbound-import-result">
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `
});
```

## Après

### `templates/chat/import-result.hbs`

```hbs
<div class="warbound-import-result">
  <h3>{{title}}</h3>
  <p>{{message}}</p>
</div>
```

### JavaScript

```js
const content =
  await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_ROOT}/chat/import-result.hbs`,
    { title, message }
  );

await ChatMessage.create({ content });
```

---

# 12. Handlebars : règles de conception

## 12.1 Échappement par défaut

Utiliser :

```hbs
{{value}}
```

et non :

```hbs
{{{value}}}
```

sauf lorsque la donnée contient volontairement du HTML déjà préparé et considéré comme fiable.

Les triple accolades doivent faire l’objet d’une justification dans la revue de code.

---

## 12.2 HTML enrichi

Si un champ doit être passé par une fonction d’enrichissement Foundry, effectuer cette préparation **avant le rendu** et donner au contexte une propriété explicitement nommée :

```js
context.enrichedDescription = ...;
```

Puis seulement :

```hbs
{{{enrichedDescription}}}
```

Cela rend visible le fait qu’il s’agit d’HTML volontaire.

---

## 12.3 Localisation

Éviter de déplacer dans les `.hbs` des textes codés en dur sans réfléchir à leur localisation.

Préférer :

```hbs
{{localize "WARBOUND.SomeKey"}}
```

ou préparer la chaîne côté JS lorsqu’une interpolation complexe est nécessaire.

---

## 12.4 Boutons

Pour les boutons d’action non destinés à soumettre un formulaire :

```hbs
<button type="button" data-action="import">
  {{localize "WARBOUND.Import"}}
</button>
```

Toujours préciser `type="button"` lorsque le bouton n’est pas un submit.

---

## 12.5 Attributs de comportement

Le template peut porter :

- `data-action`
- `data-id`
- `data-uuid`
- `data-tab`
- classes CSS nécessaires au comportement

Mais le traitement de l’action reste dans le JavaScript.

---

# 13. Ce qu’il ne faut pas faire pendant le refactoring

## Ne pas remplacer une dette par une autre

Éviter :

```js
const html = await renderTemplate(...);
element.innerHTML = html;
```

partout sans analyser l’architecture.

Cela améliore la localisation du markup, mais pas forcément le cycle de rendu.

Pour une `ApplicationV2`, préférer les mécanismes `PARTS` lorsque cela est cohérent.

---

## Ne pas transformer HBS en langage métier

Éviter d’introduire :

- des calculs complexes ;
- des règles de permissions ;
- des accès profonds répétés ;
- des transformations de données ;
- des tris ;
- des décisions métier.

Ces opérations appartiennent au contexte JavaScript.

---

## Ne pas modifier le comportement en même temps

La première migration doit viser :

> **même comportement, nouvelle couche de rendu.**

Les améliorations UX ou fonctionnelles doivent idéalement faire l’objet d’une étape ou d’une PR distincte.

Cela facilite fortement la revue et le diagnostic des régressions.

---

# 14. Stratégie de migration

## Phase 1 — Inventaire

- lancer les recherches automatiques ;
- examiner chaque résultat ;
- construire le tableau d’inventaire ;
- identifier les zones réutilisées ;
- mesurer le volume.

**Livrable :** `audit-inline-html.md`

---

## Phase 2 — Cartographie des templates

Pour chaque occurrence à migrer, définir :

- le fichier `.hbs` cible ;
- le contexte requis ;
- les événements associés ;
- les dépendances CSS ;
- les partials éventuels.

**Livrable :** plan de migration.

---

## Phase 3 — Socle technique

Créer si nécessaire :

```text
src/constants/templates.mjs
templates/apps/
templates/dialogs/
templates/chat/
templates/components/
templates/partials/
```

Ajouter les conventions de chemins.

---

## Phase 4 — Migration par blocs cohérents

Ordre recommandé :

1. Applications complètes ;
2. dialogues ;
3. messages de chat ;
4. fragments injectés par hooks ;
5. petits composants ;
6. cas complexes ou historiques.

Éviter une unique PR massive si le module contient beaucoup de markup.

---

## Phase 5 — Déduplication

Une fois le HTML extrait :

- identifier les structures identiques ;
- créer uniquement les partials réellement utiles ;
- uniformiser les classes CSS ;
- supprimer les helpers de construction HTML devenus inutiles.

---

## Phase 6 — Nettoyage

Supprimer :

- fonctions `buildHtml()`, `getHtml()`, etc. devenues obsolètes ;
- constantes contenant du markup ;
- chaînes HTML mortes ;
- concaténations historiques ;
- imports inutiles.

---

# 15. Tests de non-régression

Pour chaque migration, vérifier au minimum :

### Rendu

- la fenêtre s’ouvre ;
- le contenu est complet ;
- les conditions d’affichage sont identiques ;
- les valeurs dynamiques apparaissent correctement ;
- les données absentes ne cassent pas le template.

### Interactions

- boutons ;
- formulaires ;
- drag & drop ;
- onglets ;
- menus ;
- actions `data-action` ;
- événements clavier / souris.

### Permissions

Tester au minimum :

- GM ;
- joueur propriétaire ;
- joueur non propriétaire lorsque pertinent.

### Foundry

Tester :

- ouverture initiale ;
- rerender ;
- fermeture / réouverture ;
- changement de données pendant que l’application est ouverte ;
- pop-out si l’application l’autorise.

### CSS

Vérifier que l’extraction ne casse pas :

- sélecteurs dépendant de la hiérarchie ;
- `:first-child`, `:last-child`, `>`, etc. ;
- classes utilisées comme hooks JS ;
- tailles des fenêtres.

### Sécurité

Vérifier particulièrement :

- noms saisis par les utilisateurs ;
- descriptions ;
- textes importés ;
- contenu de journaux ;
- résultats issus de documents Foundry.

Aucune donnée non maîtrisée ne doit être injectée avec `{{{...}}}` sans traitement approprié.

---

# 16. Contrôle final automatique

Une fois la migration terminée, relancer les recherches initiales.

L’objectif est :

```text
HTML inline de présentation dans src/ : 0
```

Les résultats restants doivent appartenir à une liste d’exceptions documentées.

Exemple :

```text
HTML-EXCEPTION-001
Fichier : src/foo.mjs
Motif : manipulation d’un fragment DOM imposé par l’API X
Décision : conserver
Revue : 2026-09-27
```

---

# 17. Garde-fou CI

Après le refactoring, ajouter un contrôle empêchant la réintroduction évidente de markup inline.

Un simple `rg` peut servir de première barrière, mais il ne doit pas être considéré comme un parseur JavaScript.

Exemple minimal :

```bash
#!/usr/bin/env bash
set -euo pipefail

if rg -n -U --pcre2 \
  --glob 'src/**/*.{js,mjs,ts}' \
  '(?s)`[^`]*<(div|section|form|button|ul|ol|li|table|article|header|footer|p|span)\b[^`]*`'
then
  echo
  echo "Inline HTML detected in JavaScript."
  echo "Move view markup to a Handlebars template or document the exception."
  exit 1
fi
```

Pour un contrôle durable, préférer ensuite un petit script Node utilisant l’AST JavaScript afin de limiter les faux positifs.

---

# 18. Critères d’acceptation du refactoring

Le chantier est considéré terminé lorsque :

- [ ] toutes les sources JS/MJS/TS du module ont été auditées ;
- [ ] chaque occurrence HTML détectée possède une décision ;
- [ ] toutes les vues structurées utilisent des `.hbs` ;
- [ ] les Applications V2 concernées utilisent Handlebars de manière native lorsque pertinent ;
- [ ] les dialogues structurés utilisent des templates ;
- [ ] les messages de chat structurés utilisent des templates ;
- [ ] aucune logique métier importante n’a été déplacée dans les `.hbs` ;
- [ ] les données dynamiques sont échappées par défaut ;
- [ ] les usages de `{{{...}}}` sont justifiés ;
- [ ] les événements restent gérés dans le JavaScript ;
- [ ] les chaînes de localisation sont conservées ou améliorées ;
- [ ] les régressions fonctionnelles ont été testées ;
- [ ] les anciens builders HTML inutiles ont été supprimés ;
- [ ] les exceptions restantes sont documentées ;
- [ ] un garde-fou empêche la réintroduction d’HTML inline évident.

---

# 19. Livrables attendus de l’audit

L’audit doit produire quatre livrables.

## 1. Inventaire

```text
docs/audits/inline-html-inventory.md
```

Liste exhaustive des occurrences.

## 2. Plan de migration

```text
docs/audits/hbs-refactoring-plan.md
```

Mapping :

```text
code actuel → template cible → contexte → événements → risque
```

## 3. Refactoring

Création des `.hbs` et modification des call-sites JavaScript.

## 4. Rapport final

```text
docs/audits/hbs-refactoring-report.md
```

Contenu :

- nombre d’occurrences initiales ;
- nombre migré ;
- nombre conservé ;
- exceptions ;
- nouveaux templates ;
- partials créés ;
- code supprimé ;
- problèmes rencontrés ;
- tests réalisés ;
- dette restante.

---

# 20. Format du rapport d’audit

## Résumé

```text
Fichiers JS analysés :
Occurrences candidates :
HTML inline confirmé :
Applications concernées :
Dialogues concernés :
Messages de chat concernés :
Fragments UI concernés :
Occurrences migrées :
Exceptions conservées :
```

## Détail

| ID | Source | Description | Décision | Template cible | Risque | État |
|---|---|---|---|---|---|---|

## Exceptions

Chaque exception doit expliquer **pourquoi le markup ne doit pas être externalisé**.

## Conclusion

Le rapport final doit répondre explicitement à :

> Existe-t-il encore du HTML de présentation défini directement dans le JavaScript du module ?

Réponse attendue idéalement :

> **Non. Les occurrences restantes sont uniquement des exceptions DOM documentées qui ne constituent pas des templates de vue.**

---

# 21. Doctrine recommandée pour Warbound

Pour ce module, je recommande d’adopter comme règle permanente :

> **Une vue = un template. Une donnée = du JavaScript. Une interaction = du JavaScript. Une apparence = du CSS.**

Et, pour Foundry v14 :

> **Lorsqu’une interface appartient réellement au module, préférer `HandlebarsApplicationMixin(ApplicationV2)` et les `PARTS` plutôt qu’un assemblage manuel de chaînes HTML.**

Cela évite que la migration soit seulement cosmétique et fournit une architecture durable pour les futures interfaces du module.
