---
name: implementer-depuis-plan
description: >
  Implémente de bout en bout un plan technique existant : inspection ciblée
  du code, modifications, tests et validation.
argument-hint: "[plan-path]"
model: sonnet
effort: medium
compatibility: "claude-code;opencode"
metadata:
  project: tor2e
  stack: Foundry VTT v14+, JavaScript ES2022, ApplicationV2, TypeDataModel, Handlebars, Vitest
  scope: implémentation à partir d'un plan, exécution technique, validation, tests, conformité architecture
disable-model-invocation: true
disallowed-tools: Agent
---

# Implémenter depuis un plan

Utilise ce skill quand l'utilisateur fournit un plan d'implémentation existant et attend du code exécutable, testé, et
aligné sur les conventions du projet.

> ⚠️ **Langue** : le skill peut dialoguer en français ou en anglais selon l'utilisateur, mais il doit respecter la
> langue des artefacts du projet déjà présents. Dans TOR2e, la documentation opérationnelle peut être en français,
> tandis
> que le code, les identifiants et une partie des commentaires restent en anglais si c'est le style local.

## Token budget policy

Do not send large context to an LLM unless reasoning is required.

For deterministic tasks:

- execute with shell, Git, npm, Vitest, Playwright or CI;
- collect only the useful output;
- call an LLM only if interpretation, decision or correction is needed.

For failures:

- send only the failing command;
- send only the relevant error block;
- send only the files directly involved;
- ask for the smallest correction.

### Context policy

- Prefer direct Read/Grep/Glob over agents.
- Do not explore the repository broadly when the plan names the affected area.
- Start with files explicitly named by the plan.
- Expand to immediate dependencies/tests only when necessary.
- Do not recursively read referenced documentation.
- Do not load another skill unless it resolves a concrete missing decision.
- Do not retain successful command output when only the exit status matters.

---

## 1. Mission

Transformer un plan en implémentation réelle, sans repartir de zéro et sans re-spécifier ce qui a déjà été décidé.

Le skill doit :

1. Lire le plan fourni et s'y tenir.
2. Vérifier le code existant autour des zones impactées.
3. Implémenter la solution avec un minimum de changements corrects.
4. Respecter les standards modernes de conception et de qualité.
5. Ajouter ou adapter les tests nécessaires.
6. Vérifier le résultat avec les commandes adaptées.
7. Distinguer explicitement ce qui vient du plan, ce qui vient du code réel, et ce qui relève d'un écart ou d'une
   adaptation.

Le skill n'est pas un générateur de plan. Si aucun plan n'est fourni, il faut d'abord demander un plan, ou proposer
`plan-depuis-issue` si l'utilisateur part d'une issue.

---

## 2. Règles absolues

1. **Toujours lire entièrement le plan fourni avant de coder.**
2. **Ne pas réinventer l'architecture si le plan tranche déjà.** Si le plan est clair, l'exécuter.
3. **Si le plan est ambigu, incomplet, obsolète, ou contredit le code actuel, arrêter et clarifier avec l'utilisateur
   avant les changements structurants.**
4. **Toujours inspecter le code existant autour des fichiers impactés avant modification.**
5. **Toujours respecter Foundry VTT v14+ et éviter les API dépréciées.**
6. **Toujours séparer le code métier pur des adaptations Foundry quand le changement le permet.**
7. **Toujours ajouter ou mettre à jour les tests quand une règle, un comportement, un calcul, une transformation, ou un
   flux d'intégration change.**
8. **Ne pas faire de refactor hors périmètre sans nécessité directe pour implémenter le plan.**
9. **Ne jamais introduire de texte utilisateur hardcodé.** Toute chaîne visible doit passer par l'i18n du projet.
10. **Ne jamais muter directement les données persistées Foundry.** Utiliser les API adaptées (`update`, `updateSource`,
    hooks, modèles) selon le contexte.
11. **Ne jamais changer une règle métier non demandée par le plan sans le signaler comme écart.**
12. **Ne jamais ajouter un comportement opportuniste simplement parce qu'il semble utile.** Si ce comportement n'est pas
    nécessaire pour exécuter le plan ou préserver un contrat existant, le mentionner comme amélioration possible plutôt
    que l'implémenter.

---

## 3. Compétences complémentaires

Ne charge aucun autre skill par défaut.

Charge un skill spécialisé uniquement si une décision nécessaire à l'implémentation ne peut pas être résolue à partir :

1. du plan ;
2. du code existant ;
3. de CLAUDE.md.

Exemples :

- `applicationv2-ui-sheets` si une décision ApplicationV2 non couverte par le plan est nécessaire ;
- `testing-strategy-vitest-playwright` si le niveau ou la stratégie de test est réellement à déterminer ;
- les skills métier uniquement pour leur domaine spécifique.

Ne charge pas `coding-standards-project-conventions` ni
`foundry-vtt-system-architecture` systématiquement.

---

## 4. Principes de mise en oeuvre

### 4.1. Source de vérité

Le plan guide l'implémentation, mais le repository reste la source de vérité sur :

- les chemins de fichiers ;
- les conventions réellement en place ;
- les noms de classes et d'exports ;
- les structures `system.*`, `flags.*`, `CONFIG.*` ;
- les patterns déjà utilisés ;
- les tests existants ;
- les contrats publics déjà consommés par d'autres modules du système.

Si le plan et le code divergent :

1. évalue si l'écart est mineur et corrige localement ;
2. si l'écart change le sens du travail, demande confirmation à l'utilisateur ;
3. ne casse pas un contrat public simplement pour coller au texte du plan ;
4. mentionne l'écart dans le résumé final.

---

## 5. Workflow d'implémentation

### Étape 1 : Lire et cadrer

À partir du plan :

1. Identifie l'objectif concret.
2. Liste les fichiers explicitement mentionnés.
3. Repère les couches concernées : domaine, document, hook, UI, modèle, intégration, tests.
4. Repère les risques déjà listés dans le plan.
5. Note les décisions d'architecture à ne pas remettre en cause sans raison.
6. Note les comportements explicitement attendus et les comportements explicitement exclus.

Si le plan pointe vers d'autres documents de référence, lis-les avant de coder : ADR, spec, plans précédents, docs
d'architecture.

### Étape 2 : Inspecter le code réel

Avant d'éditer :

1. Lis les fichiers à modifier.
2. Lis les voisins immédiats quand ils servent de référence de pattern.
3. Lis les tests existants proches du périmètre.
4. Vérifie les conventions d'import, de nommage, de structure, de logs et de hooks déjà utilisées.

Cherche en particulier :

- ce qui existe déjà et peut être réutilisé ;
- les contrats publics à préserver ;
- la frontière entre logique pure et adaptation Foundry ;
- les API v14+ à privilégier ;
- les API anciennes ou dépréciées à éviter ;
- les tests qui doivent échouer avant correction et passer après correction.

### Étape 3 : Découper mentalement en petits changements sûrs

Avant d'appliquer le patch, organise le travail en petites unités :

1. structures ou helpers purs ;
2. branchement dans le code existant ;
3. tests ;
4. i18n éventuelle ;
5. validation.

Si le plan propose plusieurs étapes, suis cet ordre autant que possible.

### Étape 4 : Implémenter

Pendant l'implémentation :

1. fais le plus petit changement correct ;
2. reste cohérent avec l'architecture du projet ;
3. n'introduis pas de wrappers ou abstractions inutiles ;
4. n'ajoute pas de compatibilité legacy sans besoin réel ;
5. documente seulement les décisions non évidentes ;
6. conserve les responsabilités au bon endroit ;
7. évite les modifications de comportement non demandées ;
8. évite les modifications de style sur fichiers non concernés.

### Étape 5 : Tester

Ajoute ou adapte les tests au bon niveau :

- **Vitest unitaire** pour logique pure, calculs, transformations, parsing, mapping.
- **Vitest intégration légère** pour hooks, adaptateurs Foundry, orchestration modérée.
- **Tests manuels ciblés** si le changement touche l'UI ou un flux Foundry difficile à mocker proprement.

Quand un bug est corrigé, privilégie un test qui aurait échoué avant le correctif.

Chaque comportement nouveau doit avoir au moins un test ou une justification explicite si le test automatisé n'est pas
réaliste.

### Étape 6 : Valider

Après l'implémentation :

1. lance les tests ciblés ;
2. lance d'autres commandes utiles si le périmètre le justifie ;
3. vérifie qu'aucune régression évidente n'a été introduite ;
4. vérifie le diff avant de conclure ;
5. signale honnêtement ce qui a été validé ou non.

---

## 6. Format de sortie attendu

Quand tu as fini l'implémentation, réponds avec une sortie orientée exécution :

## Sortie

- **Implémenté** : résumé très court + fichiers principaux.
- **Tests** : commandes et résultats.
- **Écarts au plan** : uniquement s'il y en a.
- **Restant / risques** : uniquement si nécessaire.

Ne noie pas l'utilisateur sous une longue théorie après avoir codé. Le code et la validation sont la priorité.