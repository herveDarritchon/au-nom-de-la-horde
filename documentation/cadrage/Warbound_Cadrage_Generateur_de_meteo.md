# Cadrage — Générateur de météo dynamique Warbound

## 1. Objectif

Ajouter au module Warbound un générateur de météo utilisable instantanément par le MJ.

À partir de :

**zone → biome → saison → météo précédente**

le système produit la **météo du jour** :

| Élément | Exemple |
|---|---|
| Icône principale | ☀️ / 🌤️ / ☁️ / 🌧️ / ⛈️ / ❄️ |
| Intitulé | *Chaud et légèrement voilé* |
| Ciel | Quelques nuages |
| Précipitations | Aucune |
| Vent | Brise modérée |
| Température | Chaud |
| Description | *Une chaleur sèche domine la journée. Quelques voiles nuageux passent au-dessus des terres rouges tandis qu'un vent régulier soulève la poussière.* |
| Événement météo | *Un tourbillon de poussière traverse brusquement la route.* |

L'événement est **une proposition au MJ**, jamais quelque chose que le système applique automatiquement.

C'est important : la météo doit produire du jeu, pas devenir une mécanique qui impose en permanence des malus.

---

# 2. Principe fondamental : une météo avec mémoire

Le générateur ne doit jamais fonctionner ainsi :

> jour 1 : soleil → jour 2 : tempête → jour 3 : brouillard → jour 4 : soleil

simplement parce que quatre jets indépendants ont été effectués.

Je partirais sur une **petite machine à états**, volontairement beaucoup plus simple qu'un modèle météorologique réel.

Le moteur connaît la météo précédente et privilégie :

**continuité → évolution → rupture exceptionnelle.**

Exemple :

> **J1** — ciel clair, chaud, brise faible  
> **J2** — ciel clair avec quelques nuages, chaud, vent modéré  
> **J3** — ciel plus chargé, vent soutenu  
> **J4** — brève averse orageuse  
> **J5** — nuages résiduels, vent faible  
> **J6** — retour d'un temps sec et clair

On a alors l'impression qu'un phénomène météorologique est passé sur la région.

---

# 3. Ne pas tirer séparément le soleil, les nuages, la pluie et le vent

C'est le principal piège technique.

Si on fait :

```text
roll sky
roll rain
roll wind
roll temperature
```

on finit inévitablement avec des résultats absurdes :

> ciel parfaitement dégagé + pluie torrentielle + vent nul.

Je recommande donc un **régime météo interne**, invisible pour le MJ.

Par exemple :

| Niveau | Régime interne | Conséquence générale |
|---:|---|---|
| 0 | Clair | soleil dominant |
| 1 | Variable | quelques nuages |
| 2 | Couvert | ciel chargé |
| 3 | Perturbé | précipitations possibles/probables |
| 4 | Sévère | pluie forte, neige, orage, tempête selon contexte |

Chaque jour, le régime peut principalement :

**rester identique → monter d'un cran → descendre d'un cran.**

Un changement de deux niveaux existe mais reste rare.

C'est cette seule règle qui donnera une énorme partie de la sensation de continuité.

---

# 4. Les composantes visibles

Le régime produit ensuite quatre informations principales.

### Ciel

```text
clair
peu nuageux
nuageux
couvert
très couvert / menaçant
```

Le soleil n'est donc pas tiré séparément : il découle du ciel.

### Précipitations

```text
aucune
faible
modérée
forte
```

avec un type :

```text
pluie
neige
grésil
```

La combinaison dépend de la température.

### Vent

```text
calme
brise
modéré
fort
tempétueux
```

### Température

Je l'ajouterais au moteur même si elle reste secondaire dans l'interface :

```text
glacial
froid
frais
doux
chaud
très chaud
```

Elle est indispensable pour empêcher des absurdités comme de la neige en plein Durotar estival.

En revanche, **aucun degré Celsius**. Cela n'apporte rien au JdR.

---

# 5. Biomes standard

Je resterais volontairement autour de **10 biomes**.

| ID | Biome | Tendance |
|---|---|---|
| `arid` | **Aride** | Très sec, ciel clair dominant, poussière et vent |
| `semiArid` | **Semi-aride / savane sèche** | Sec, chaud, quelques perturbations brèves |
| `temperatePlain` | **Plaine tempérée** | Très variable, assez venteux |
| `temperateForest` | **Forêt tempérée** | Nuages et pluies régulières |
| `humidForest` | **Forêt humide / jungle** | Chaud, humide, averses fréquentes |
| `wetland` | **Marais / zone humide** | Humidité, brouillard, bruine |
| `coastal` | **Littoral / maritime** | Vent, changements rapides, grains |
| `mountain` | **Montagne / alpin** | Temps variable, vent fort, refroidissement |
| `tundra` | **Toundra** | Froid, plutôt sec, neige et vent |
| `glacial` | **Glaciaire** | Très froid, neige, blizzard possible |

**Durotar pourrait par exemple être configuré en `semiArid`.**

Je n'ajouterais pas `volcanique`, `gangrené`, `nécrotique`, etc. comme biomes.

Ce sont plutôt de futurs **modificateurs de biome** :

```text
volcanic
fel
necrotic
arcane
elemental
```

Ainsi, on pourra un jour avoir :

```text
mountain + volcanic
temperateForest + corrupted
semiArid + elemental
```

sans créer 40 biomes différents.

---

# 6. Saison

Le moteur n'a besoin que de :

```text
spring
summer
autumn
winter
```

Chaque couple :

```text
biome + season
```

possède un profil.

Par exemple :

### Semi-aride — été

```text
température dominante : très chaud
temps clair : très fréquent
temps couvert : occasionnel
pluie : rare
orage : rare mais possible
neige : interdite
vent : faible à modéré
```

### Semi-aride — hiver

```text
température dominante : frais
temps clair : fréquent
temps couvert : occasionnel
pluie : peu fréquente
orage : très rare
neige : exceptionnellement autorisée ou interdite selon réglage du biome
```

### Forêt tempérée — automne

```text
température : frais
nuages : fréquents
pluie : fréquente
vent : modéré
brouillard : possible
orage : peu fréquent
```

On ne cherche pas à reproduire la climatologie terrestre. On crée simplement un **profil crédible de fantasy**.

---

# 7. Algorithme proposé

À chaque passage au jour suivant :

```text
1. récupérer zone
2. récupérer biome
3. récupérer saison
4. récupérer météo précédente

5. calculer le régime météo suivant
   selon :
   - météo précédente
   - inertie
   - profil biome/saison

6. déterminer température

7. déterminer ciel

8. déterminer précipitations
   selon :
   - régime
   - température
   - biome

9. déterminer vent
   selon :
   - biome
   - régime
   - amplitude du changement météo

10. appliquer les contraintes de cohérence

11. chercher éventuellement un événement météo compatible

12. produire le résultat
```

Pour la transition, je commencerais avec quelque chose comme :

```text
60 % continuité
30 % évolution d'un niveau
10 % changement plus marqué
```

Ce ne sont **pas des valeurs météorologiques scientifiques** : ce sont des paramètres de game design à playtester.

Et j'ajouterais une petite correction : plus un régime dure longtemps, plus la probabilité qu'il évolue augmente.

Cela évite :

> ☀️ ☀️ ☀️ ☀️ ☀️ ☀️ ☀️ ☀️ ☀️

sans empêcher une vraie période de beau temps.

---

# 8. Le biome et la saison ne déterminent pas la météo : ils la biaisent

C'est une distinction importante.

Il ne faut pas écrire :

```text
Durotar + été = soleil
```

mais :

```text
Durotar + été
→ très forte probabilité de conditions sèches et claires
→ petite probabilité d'évolution nuageuse
→ faible probabilité d'orage
→ neige impossible
```

Cela permet d'obtenir à la fois **identité climatique et surprise**.

---

# 9. Contraintes de cohérence

Il faut avoir une couche de règles absolues ou quasi absolues après le tirage.

Par exemple :

| Situation | Règle |
|---|---|
| Neige + température chaude | impossible |
| Forte pluie + ciel clair | impossible |
| Orage + ciel clair | impossible |
| Brouillard + vent tempétueux | très improbable / interdit |
| Tempête de poussière après plusieurs jours de pluie | impossible |
| Blizzard en biome aride chaud | impossible |
| Pluie forte en biome glaciaire en hiver | quasiment impossible |
| Orage en biome aride | possible mais rare |
| Brouillard dans un marais humide et calme | fréquent |

Cette couche est probablement **plus importante que des probabilités très précises**.

---

# 10. Historique

Je garderais les **3 à 5 derniers jours**, pas davantage.

```js
history: [
  weatherDMinus1,
  weatherDMinus2,
  weatherDMinus3
]
```

Cela permet de créer des événements beaucoup plus intéressants.

Par exemple :

```text
pluie forte aujourd'hui
+
pluie hier
→ chemins boueux
```

ou :

```text
3 jours très chauds et secs
→ point d'eau presque asséché
```

ou :

```text
neige + vent fort depuis 2 jours
→ congères
```

On rejoint ici une règle déjà employée dans le projet : un événement dynamique doit être produit **selon l'état du monde et les conséquences précédentes**, pas par une simple rotation aléatoire. :chatgpt-content-reference{index="2"}

---

# 11. Événements météo

Je séparerais totalement :

**la météo**

et

**l'événement météo.**

Une journée pluvieuse n'a pas besoin d'avoir automatiquement une rencontre ou un problème.

Le moteur peut effectuer ensuite un test du type :

```text
aucun événement : fréquent
événement d'ambiance : courant
petite complication : occasionnel
événement important : rare
```

Chaque événement possède des conditions.

Exemple :

```yaml
id: dust-devil
biomes:
  - arid
  - semiArid

requires:
  precipitation: none
  windMin: breeze
  temperatureMin: warm

text: >
  Un tourbillon de poussière traverse brusquement le terrain,
  emportant feuilles, tissus et petits objets.
```

Autres exemples :

| Conditions | Événement |
|---|---|
| chaleur + sec | mirage, air tremblant |
| semi-aride + vent | tourbillon de poussière |
| pluie après sécheresse | ruissellement brutal |
| forte pluie | piste transformée en bourbier |
| forêt + vent fort | branche ou arbre tombé |
| marais + calme | nappe de brouillard |
| littoral + vent | grain soudain |
| neige + vent | congères |
| forte chaleur plusieurs jours | point d'eau diminué |
| pluie plusieurs jours | rivière gonflée |

L'intérêt est que ces événements deviennent naturellement des **amorces de mise en scène**.

---

# 12. Aucun effet mécanique automatique

Pour la V1, je déconseille fortement :

> « pluie = dé malus aux attaques à distance »

ou :

> « chaleur = test de CON toutes les heures ».

Ça transformerait rapidement une feature d'ambiance en corvée.

L'événement peut éventuellement afficher :

> **Impact possible :** visibilité réduite sur les longues distances.

mais c'est le MJ qui décide de l'utiliser.

Le générateur **suggère**, il ne gouverne pas la partie.

---

# 13. Interface Foundry

Le bouton **Météo** ouvre une petite fenêtre.

Je la verrais ainsi :

```text
┌──────────────────────────────────────┐
│        🌤️  TEMPS CHAUD ET SEC        │
│                                      │
│ Durotar · Semi-aride · Été           │
│                                      │
│ ☀ Ciel      Peu nuageux              │
│ 🌧 Pluie     Aucune                   │
│ 💨 Vent      Brise modérée            │
│ 🌡 Temp.     Très chaud               │
│                                      │
│ La chaleur domine encore les terres  │
│ rouges. Quelques nuages élevés...    │
│                                      │
│ ───── ÉVÉNEMENT POSSIBLE ─────       │
│ 🌪 Tourbillon de poussière            │
│ Une colonne de poussière traverse... │
│                                      │
│ [Publier dans le chat] [Ignorer]     │
│                                      │
│       [◀] [Jour suivant] [↻]         │
└──────────────────────────────────────┘
```

Et surtout :

**cliquer sur l'icône Météo ne doit pas relancer la météo.**

Cela ouvre simplement **l'état actuel**.

Il faut une action explicite :

> **Jour suivant**

pour faire évoluer la météo.

Le bouton `↻` serait un override MJ.

---

# 14. Association avec les zones

Je séparerais bien trois concepts :

```text
Scene
  ↓
Zone
  ↓
Biome
```

Par exemple :

```text
Scene : Razor Hill
Zone : Durotar
Biome : semiArid
```

ou éventuellement plus fin :

```text
Scene : Scuttle Coast
Zone : Côte de Durotar
Biome : coastal
```

Une zone possède une configuration :

```js
{
  id: "durotar",
  name: "Durotar",
  biome: "semiArid"
}
```

La météo est enregistrée **par zone**, pas par scène.

Ainsi deux scènes représentant Razor Hill partagent la même météo.

---

# 15. État persistant

Quelque chose dans cet esprit :

```js
{
  zoneId: "durotar",
  biomeId: "semiArid",

  season: "summer",

  regime: 1,

  sky: "partlyCloudy",

  precipitation: {
    type: "none",
    intensity: 0
  },

  wind: "breeze",
  temperature: "hot",

  regimeAge: 2,

  event: "dust-devil",

  history: [...]
}
```

Je conserverais cet état dans une donnée **world**, donc commune à la campagne.

---

# 16. Une subtilité importante : intérieurs et donjons

Il ne faut pas chercher à faire entrer Ragefire Chasm dans le système de biomes.

Une scène ou une zone doit pouvoir déclarer :

```text
weather: disabled
```

ou :

```text
weather: inheritOutside
```

Ainsi, dans Ragefire :

> météo extérieure : chaleur sèche sur Orgrimmar  
> conditions intérieures : gérées par le donjon

C'est beaucoup plus propre que d'inventer un biome « souterrain ».

---

# 17. Ce que je mettrais dans le MVP

Pour la première version :

| Fonction | MVP |
|---|---:|
| 10 biomes | ✅ |
| 4 saisons | ✅ |
| Météo persistante par zone | ✅ |
| Continuité d'un jour à l'autre | ✅ |
| Ciel | ✅ |
| Température qualitative | ✅ |
| Précipitations | ✅ |
| Vent | ✅ |
| Icône principale | ✅ |
| Description automatique | ✅ |
| Événements contextuels | ✅ |
| Historique 3–5 jours | ✅ |
| Publication dans le chat | ✅ |
| Override MJ | ✅ |
| Effets mécaniques COF2 automatiques | ❌ |
| Température en degrés | ❌ |
| Météo heure par heure | ❌ |
| Direction précise du vent | ❌ |
| Pression atmosphérique | ❌ |
| Humidité chiffrée | ❌ |
| Simulation de fronts géographiques | ❌ |
| Effets visuels automatiques sur les scènes | ❌ |
| Intégration calendrier externe | ❌ V2 |

C'est là que je mettrais la frontière. **Tout ce qui se trouve dans la colonne de droite ferait dériver la feature vers un simulateur météo dont tu n'as absolument pas besoin.**

---

# 18. Architecture fonctionnelle

Je découperais le code ainsi :

```text
weather/
├── engine/
│   ├── WeatherEngine.mjs
│   ├── WeatherTransition.mjs
│   └── WeatherConstraints.mjs
│
├── data/
│   ├── biomes.mjs
│   ├── seasons.mjs
│   └── weather-events.mjs
│
├── services/
│   ├── WeatherStateService.mjs
│   └── ZoneWeatherService.mjs
│
├── ui/
│   ├── WeatherDialog.mjs
│   └── weather-dialog.hbs
│
└── index.mjs
```

Le point important est de garder le moteur **indépendant de Foundry**.

Idéalement :

```js
WeatherEngine.next({
  biome,
  season,
  previousWeather,
  history,
  random
})
```

retourne simplement :

```js
Weather
```

Le code Foundry ne s'occupe alors que :

> stocker → afficher → publier.

Cela rendra les tests unitaires extrêmement simples.

---

# 19. Tests d'acceptation essentiels

Avant de considérer la feature terminée, je testerais au minimum ces cas :

```text
Semi-aride + été
→ aucune neige sur plusieurs milliers de générations.

Glaciaire + hiver
→ pluie liquide exceptionnelle ou impossible.

Marais
→ brouillard nettement plus fréquent que dans un désert.

Temps orageux aujourd'hui
→ demain a beaucoup plus de chances d'être couvert,
   venteux ou variable que parfaitement stable et clair.

Trois jours de pluie
→ événement "terrain détrempé" peut apparaître.

Trois jours secs
→ événement "terrain détrempé" ne peut pas apparaître.

Réouvrir la fenêtre
→ météo inchangée.

Changer de scène dans la même zone
→ météo inchangée.

Cliquer "Jour suivant"
→ nouvel état dérivé du précédent.

Changer de saison
→ la météo ne saute pas instantanément :
   le nouveau profil influence progressivement les jours suivants.
```

---

## La règle de conception que je retiendrais

Le moteur ne doit finalement répondre qu'à cette formule :

> **Météo du jour = climat du lieu + saison + météo d'hier + un peu de hasard.**

Et l'événement :

> **Événement = météo actuelle + éventuellement météo récente + biome + hasard.**

C'est suffisamment sophistiqué pour que les joueurs aient le sentiment qu'**un véritable temps passe sur Durotar**, tout en restant assez simple pour que le MJ clique une fois et obtienne immédiatement quelque chose d'exploitable.

Le point que je verrouillerais avant même de coder est donc : **la météo n'est pas une RollTable améliorée ; c'est un petit système persistant à transitions contraintes.** C'est ce choix qui fera toute la différence.