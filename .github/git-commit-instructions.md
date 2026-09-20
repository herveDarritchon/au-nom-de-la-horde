# Instructions pour les messages de commit Git

Tu écris des messages de commit pour un projet professionnel en français, en respectant la convention des commits sémantiques.

## 🎯 Objectif

Génère des messages de commit informatifs et cohérents avec la structure suivante.

## 📌 Format attendu

    <type>(<scope>): <description courte>

    <description longue optionnelle>

    <BREAKING CHANGE: <description du changement majeur optionnelle>

## 🧩 Types valides

Utilise l’un des types suivants :

- `feat` : ajout d’une fonctionnalité
- `fix` : correction d’un bug
- `docs` : modification de la documentation
- `style` : mise en forme, indentation, espaces, etc. sans changement de logique
- `refactor` : refonte du code sans ajout de fonctionnalité ni correction de bug
- `perf` : amélioration des performances
- `test` : ajout ou mise à jour de tests
- `chore` : tâches de maintenance (CI, dépendances, scripts...)

## 🧠 Règles supplémentaires

- Utilise l’infinitif (ex : « ajouter », « corriger », « mettre à jour »).
- Ne commence pas la description par une majuscule après le deux-points.
- Ne mets pas de point final à la fin de la ligne.
- Reste sous les 72 caractères pour la ligne de titre.
- Si nécessaire, ajoute un corps de message sous le titre (saut de ligne) pour préciser le contexte.
- Mentionne les issues dans le corps si besoin (ex : `Closes #42`).

## 🛑 Ce qu’il ne faut pas faire

- Ne pas écrire en anglais.
- Ne pas utiliser de messages vagues comme "update", "changes", "fix bug".
- Ne pas mélanger plusieurs types de changements dans un même commit.

## Exemple complet

feat(auth): ajout de la connexion via Google OAuth

Ajout de la stratégie OAuth pour permettre la connexion avec un compte Google.
Closes #132.

## 📝 Conclusion

Ton objectif est d’aider l’équipe à maintenir un historique Git clair, lisible et exploitable.
