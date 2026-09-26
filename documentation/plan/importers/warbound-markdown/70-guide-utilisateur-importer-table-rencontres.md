# Plan d'implémentation — Guide utilisateur : importer une table de rencontres Warbound

**Issue** : [#70 — docs(importer): guide utilisateur — importer une table de rencontres Warbound](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/70)  
**Bloqué par** : #68 (livré), #69 (livré)  
**ADR** : aucun applicable  
**Modules impactés** :
- `documentation/guide/importeur-tables-rencontres.md` (nouveau)

---

## 1. Objectif

Fournir aux MJ un guide utilisateur complet pour préparer et importer une collection `encounter` via l'importeur Warbound Markdown.

---

## 2. Périmètre

### Inclus

- Création de `documentation/guide/importeur-tables-rencontres.md` couvrant les six sections de l'issue

### Hors périmètre

- Modification du code source
- Toute autre documentation (release notes, audit, cadrage)

---

## 3. État existant

- Fonctionnalité `encounter` livrée dans #68
- Couverture de tests livrée dans #69
- Aucun guide utilisateur présent dans `documentation/guide/`
- Fixture canonique disponible : `src/importers/warbound-markdown/__fixtures__/durotar-razor-hill-senjin-encounters.md`

---

## 4. Décisions d'architecture

- Le guide est un fichier Markdown statique, sans dépendance de build.
- Les exemples sont extraits directement de la fixture existante pour garantir la cohérence.
- Le répertoire `documentation/guide/` est créé avec ce fichier (pas de répertoire préexistant).

---

## 5. Fichiers créés

```
documentation/guide/importeur-tables-rencontres.md
```

---

## 6. Tests attendus

Aucun test automatisé pour la documentation. Vérification manuelle :

```bash
ls documentation/guide/importeur-tables-rencontres.md
pnpm packs:audit  # pas d'impact attendu, documentation pure
```

---

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Exemples désynchronisés du code réel | Exemples extraits de la fixture de test existante |
| Comportement des orphelins mal documenté | S'appuie sur le cadrage §26–27 et les scénarios de test #69 |

---

## 8. Critères d'arrêt

- [ ] Format source documenté avec exemple minimal (front matter + table + bloc entry)
- [ ] Gestion actif/inactif expliquée
- [ ] Comportement au réimport expliqué (UUID stables, pas de doublon)
- [ ] Comportement des orphelins expliqué
