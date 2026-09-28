# Plan d'implémentation — fix(weather): styles CSS dialogue météo et messages de chat

**Issue** : [#99 — fix(weather): ajouter les styles CSS pour le dialogue et les messages de chat météo](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/99)

---

## 1. Objectif

Ajouter dans `styles/warbound.css` les règles CSS manquantes pour :
1. Le dialogue météo MJ (`scripts/weather/ui/weather-dialog.hbs`)
2. Le message de chat météo (`templates/chat/weather-report.hbs`)

---

## 2. Périmètre

### Inclus

- Règles CSS pour `.weather-dialog-body` et ses composants internes
- Règles CSS pour `.warbound.weather-chat` (message de chat)
- Respect du thème `body.warbound-theme` avec variables CSS existantes (`--wb-*`)
- Lisibilité en mode sombre (Foundry v14 dark theme)

### Hors périmètre

- Modification des templates HBS
- Modification de la logique JS/MJS
- Création de nouveaux composants ou nouvelles fonctionnalités

---

## 3. État existant

### Templates concernés

**`scripts/weather/ui/weather-dialog.hbs`** — classes effectives :

| Classe | Élément |
|---|---|
| `.weather-dialog-body` | `<div>` racine |
| `.weather-regime` | `<div>` régime courant |
| `.weather-regime-icon` | `<i>` icône FontAwesome |
| `.weather-regime-label` | `<span>` libellé régime |
| `.weather-regime-age` | `<span>` âge (Jour X) |
| `.weather-components` | `<table>` des composants |
| `.weather-narrative` | `<p>` texte narratif |
| `.weather-event` | `<div>` événement possible |
| `.weather-event-text` | `<p>` texte de l'événement |
| `.weather-event-ignore` | `<button>` Ignorer |
| `.weather-no-state` | `<p>` état vide |

**`templates/chat/weather-report.hbs`** — classes effectives :

| Classe | Élément |
|---|---|
| `.warbound.weather-chat` | `<div>` racine (double classe) |
| `.narrative` | `<p>` texte narratif |

### CSS existant

`styles/warbound.css` — 650 lignes. Variables disponibles sous `body.warbound-theme` :
`--wb-paper`, `--wb-ink`, `--wb-muted`, `--wb-iron`, `--wb-iron-soft`, `--wb-bronze`, `--wb-bronze-light`, `--wb-crimson`, `--wb-ember`, `--wb-green`, `--wb-danger`, `--wb-shadow`, `--wb-rule`.
Polices : `--wb-font-body`, `--wb-font-display`, `--wb-font-ui`.

Aucune règle `.weather-*` ni `.weather-chat` n'existe actuellement.

---

## 4. Décisions d'architecture

- Toutes les règles sous `body.warbound-theme` — cohérence avec le reste du fichier.
- Variables `--wb-*` utilisées exclusivement (pas de couleurs brutes pour les éléments thématiques).
- Deux sections délimitées par commentaires dans `warbound.css` :
  - `/* WEATHER DIALOG */`
  - `/* WEATHER CHAT MESSAGE */`
- `.weather-event-ignore` stylé comme bouton secondaire (discret), distinct des boutons `.form-footer`.
- Les règles `.form-footer` (Foundry standard) ne sont pas recopiées ; seules les classes `.weather-*` sont ciblées.

---

## 5. Plan de travail

### 5.1 Ajouter la section Weather Dialog dans `styles/warbound.css`

Après la dernière section existante, ajouter un bloc délimité :

```
/* -------------------------------------------------------------------------- */
/* WEATHER DIALOG                                                              */
/* -------------------------------------------------------------------------- */

body.warbound-theme .weather-dialog-body
body.warbound-theme .weather-regime
body.warbound-theme .weather-regime-icon
body.warbound-theme .weather-regime-label
body.warbound-theme .weather-regime-age
body.warbound-theme .weather-components
body.warbound-theme .weather-narrative
body.warbound-theme .weather-event
body.warbound-theme .weather-event-text
body.warbound-theme .weather-event-ignore
body.warbound-theme .weather-no-state
```

### 5.2 Ajouter la section Weather Chat dans `styles/warbound.css`

```
/* -------------------------------------------------------------------------- */
/* WEATHER CHAT MESSAGE                                                        */
/* -------------------------------------------------------------------------- */

body.warbound-theme .weather-chat
body.warbound-theme .weather-chat h3
body.warbound-theme .weather-chat ul
body.warbound-theme .weather-chat .narrative
```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `styles/warbound.css` | Ajouter 2 sections CSS (weather dialog + weather chat) |

---

## 7. Tests attendus

- Ouvrir le dialogue météo dans Foundry VTT et vérifier le rendu visuel (thème Horde dark editorial)
- Publier un message météo dans le chat et vérifier l'alignement avec la charte `wb-*`
- Vérifier l'absence de régression sur les journaux et les autres dialogs
- `pnpm build` → exit 0

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Classes dans l'issue ≠ classes réelles des templates | Plan basé sur lecture directe des `.hbs` — liste vérifiée |
| Contraste insuffisant en mode sombre Foundry | Tester en basculant le thème Foundry ; cibler WCAG AA comme référence |
| Régression sur `.form-footer` partagé | Ne pas restyler `.form-footer`, cibler uniquement les classes `.weather-*` |

---

## 9. Critères d'arrêt

- Dialogue météo visuellement cohérent avec le thème Horde dark editorial
- Message de chat météo respectant la charte graphique `wb-*`
- Aucune règle CSS brisant les journaux, dialogs ou autres composants existants
- `pnpm build` passe (exit 0)
