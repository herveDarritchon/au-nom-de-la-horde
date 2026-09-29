import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { WeatherEngine, REGIME_DESCRIPTORS } from './WeatherEngine.mjs'
import { WeatherEventSelector } from './WeatherEventSelector.mjs'
import { applyConstraints } from './WeatherConstraints.mjs'

describe('applyConstraints — unitaires', () => {
  test('arid hors saison chaude : poids du régime 4 réduit d\'un facteur 10', () => {
    const base = [0.65, 0.22, 0.08, 0.04, 0.01]
    const [ , , , , severe] = applyConstraints({
      weights: base, dominantTemp: 'warm', biome: 'arid', season: 'autumn',
    })
    // 0.01 * 0.1 = 0.001 sur un total de 0.991
    assert.ok(severe < 0.005, `Poids du régime severe en arid hors saison chaude = ${severe} (attendu < 0.005)`)
  })

  test('biome non aride : poids du régime 4 inchangé', () => {
    const base = [0.65, 0.22, 0.08, 0.04, 0.01]
    const [ , , , , severe] = applyConstraints({
      weights: base, dominantTemp: 'warm', biome: 'semiArid', season: 'autumn',
    })
    assert.equal(severe, 0.01, `Poids du régime severe en semiArid = ${severe} (attendu 0.01, inchangé)`)
  })

  test('descripteur clear + précipitation : poids mis à zéro', () => {
    const descriptors = [
      { sky: 'clear', precipitation: 'heavy', wind: 'calm' },
      { sky: 'overcast', precipitation: 'moderate', wind: 'moderate' },
    ]
    const [ impossible, valid ] = applyConstraints({
      weights: [0.5, 0.5], dominantTemp: 'mild', biome: 'temperatePlain', season: 'spring', descriptors,
    })
    assert.equal(impossible, 0, 'Le descripteur clear+heavy doit recevoir un poids nul')
    assert.equal(valid, 1, 'Le descripteur valide doit absorber toute la masse')
  })

  test('glacial×winter : poids du régime 3 mis à zéro', () => {
    const base = [0.05, 0.12, 0.23, 0.30, 0.30]
    const weights = applyConstraints({ weights: base, dominantTemp: 'glacial', biome: 'glacial', season: 'winter' })
    assert.equal(weights[3], 0, 'Le régime 3 doit être interdit en glacial×winter')
  })

  test('sortie normalisée : somme à 1', () => {
    for (const biome of ['arid', 'glacial', 'wetland', 'temperatePlain']) {
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const weights = applyConstraints({
          weights: [0.3, 0.3, 0.2, 0.15, 0.05], dominantTemp: 'mild', biome, season,
        })
        const sum = weights.reduce((a, b) => a + b, 0)
        assert.ok(Math.abs(sum - 1) < 1e-9, `Somme = ${sum} pour ${biome}×${season}`)
      }
    }
  })
})

describe('WeatherConstraints — descripteurs impossibles', () => {
  test('aucun régime ne combine sky=clear + precipitation!=none', () => {
    for (const desc of REGIME_DESCRIPTORS) {
      assert.ok(
        !(desc.sky === 'clear' && desc.precipitation !== 'none'),
        `Descripteur invalide : sky=clear + precipitation=${desc.precipitation}`,
      )
    }
  })

  test('aucun régime ne combine orage (sky=stormy) + ciel clair', () => {
    for (const desc of REGIME_DESCRIPTORS) {
      assert.ok(
        !(desc.sky === 'stormy' && desc.precipitation === 'none'),
        `Descripteur invalide : orage sans précipitation (${JSON.stringify(desc)})`,
      )
    }
  })

  test('sky=clear + precipitation=heavy absent sur 10 000 générations (temperatePlain×summer)', () => {
    let prev = null
    for (let i = 0; i < 10_000; i++) {
      prev = WeatherEngine.next({ biome: 'temperatePlain', season: 'summer', previousWeather: prev })
      assert.ok(
        !(prev.sky === 'clear' && prev.precipitation === 'heavy'),
        `sky=clear + precipitation=heavy à l'itération ${i}`,
      )
    }
  })
})

describe('WeatherConstraints — semiArid×summer sans neige', () => {
  test('aucun descripteur ne porte de précipitation neigeuse', () => {
    for (const desc of REGIME_DESCRIPTORS) {
      assert.ok(
        !['snow', 'sleet', 'hail'].includes(desc.precipitation),
        `Descripteur neigeux inattendu : ${JSON.stringify(desc)}`,
      )
    }
  })

  test('précipitation forte jamais associée à une température froide sur 10 000 générations', () => {
    const COLD = ['cold', 'freezing', 'glacial']
    let prev = null
    for (let i = 0; i < 10_000; i++) {
      prev = WeatherEngine.next({ biome: 'semiArid', season: 'summer', previousWeather: prev })
      assert.equal(prev.temperature, 'hot', `Température inattendue en semiArid×summer : ${prev.temperature}`)
      if (prev.precipitation === 'heavy' || prev.precipitation === 'moderate') {
        assert.ok(
          !COLD.includes(prev.temperature),
          `Précipitation ${prev.precipitation} avec température froide ${prev.temperature} à l'itération ${i}`,
        )
      }
    }
  })
})

describe('WeatherConstraints — glacial×winter', () => {
  test('régime 3 (pluie forte) impossible sur 10 000 générations', () => {
    let prev = null
    for (let i = 0; i < 10_000; i++) {
      prev = WeatherEngine.next({ biome: 'glacial', season: 'winter', previousWeather: prev })
      assert.notEqual(prev.regime, 3, `Régime 3 (pluie forte) apparu en glacial×winter à l'itération ${i}`)
    }
  })
})

describe('WeatherConstraints — arid orage rare', () => {
  test('régime 4 (stormy) < 2 % sur 10 000 générations en arid×summer', () => {
    let prev = null
    let count = 0
    for (let i = 0; i < 10_000; i++) {
      prev = WeatherEngine.next({ biome: 'arid', season: 'summer', previousWeather: prev })
      if (prev.regime === 4) count++
    }
    const rate = count / 10_000
    assert.ok(rate < 0.02, `Taux stormy en arid = ${(rate * 100).toFixed(2)} % (max toléré 2 %)`)
  })
})

describe('WeatherConstraints — événements météo', () => {
  test('fog-bank absent si wind=violent', () => {
    const weather = { sky: 'stormy', precipitation: 'heavy', wind: 'violent', temperature: 'mild' }
    for (let i = 0; i < 1000; i++) {
      const event = WeatherEventSelector.select({ biome: 'coastal', weather, history: [] })
      assert.ok(
        event === null || !event.id.startsWith('fog-bank'),
        `fog-bank déclenché avec wind=violent à l'itération ${i}`,
      )
    }
  })

  test('dust-storm absent si historique contient pluie récente', () => {
    const weather = { sky: 'overcast', precipitation: 'moderate', wind: 'moderate', temperature: 'hot' }
    const history = [
      { precipitation: 'heavy' },
      { precipitation: 'moderate' },
      { precipitation: 'moderate' },
    ]
    for (let i = 0; i < 1000; i++) {
      const event = WeatherEventSelector.select({ biome: 'arid', weather, history })
      assert.ok(
        event === null || event.id !== 'dust-storm',
        `dust-storm déclenché malgré historique pluvieux à l'itération ${i}`,
      )
    }
  })

  test('fog-bank en wetland×calme plus fréquent qu\'en arid×calme sur 10 000 tirages', () => {
    const weather = { sky: 'clear', precipitation: 'none', wind: 'calm', temperature: 'mild' }
    let fogWetland = 0
    let fogArid = 0
    for (let i = 0; i < 10_000; i++) {
      const wetlandEvent = WeatherEventSelector.select({ biome: 'wetland', weather, history: [] })
      if (wetlandEvent?.id?.startsWith('fog-bank')) fogWetland++
      const aridEvent = WeatherEventSelector.select({ biome: 'arid', weather, history: [] })
      if (aridEvent?.id?.startsWith('fog-bank')) fogArid++
    }
    assert.ok(
      fogWetland > fogArid,
      `fog en wetland (${fogWetland}) devrait être > fog en arid (${fogArid})`,
    )
  })

  test('blizzard absent en biome arid', () => {
    const weather = { sky: 'stormy', precipitation: 'heavy', wind: 'violent', temperature: 'cold' }
    for (let i = 0; i < 1000; i++) {
      const event = WeatherEventSelector.select({ biome: 'arid', weather, history: [] })
      assert.ok(
        event === null || event.id !== 'blizzard',
        `blizzard déclenché en biome arid à l'itération ${i}`,
      )
    }
  })
})

describe('WeatherConstraints — éligibilité des nouveaux événements', () => {
  test('dust-storm éligible en arid après 3 jours secs et vent ≥ moderate', () => {
    const weather = { sky: 'clear', precipitation: 'none', wind: 'moderate', temperature: 'hot' }
    const history = [{ precipitation: 'none' }, { precipitation: 'none' }, { precipitation: 'none' }]
    let hits = 0
    for (let i = 0; i < 1000; i++) {
      if (WeatherEventSelector.select({ biome: 'arid', weather, history })?.id === 'dust-storm') hits++
    }
    assert.ok(hits > 0, 'dust-storm devrait être éligible en arid après 3 jours secs')
  })

  test('blizzard éligible en glacial avec forte précip, vent fort et froid', () => {
    const weather = { sky: 'stormy', precipitation: 'heavy', wind: 'violent', temperature: 'cold' }
    let hits = 0
    for (let i = 0; i < 1000; i++) {
      if (WeatherEventSelector.select({ biome: 'glacial', weather, history: [] })?.id === 'blizzard') hits++
    }
    assert.ok(hits > 0, 'blizzard devrait être éligible en glacial')
  })

  test('fog-bank (weight 1) plus rare que fog-bank-wetland (weight 3) en wetland×calme', () => {
    const weather = { sky: 'clear', precipitation: 'none', wind: 'calm', temperature: 'mild' }
    let wetlandFog = 0
    let genericFog = 0
    for (let i = 0; i < 10_000; i++) {
      const event = WeatherEventSelector.select({ biome: 'wetland', weather, history: [] })
      if (event?.id === 'fog-bank-wetland') wetlandFog++
      if (event?.id === 'fog-bank') genericFog++
    }
    assert.ok(wetlandFog > genericFog, `fog-bank-wetland (${wetlandFog}) devrait être > fog-bank (${genericFog})`)
  })

  test('sélection pondérée respectée sur une liste de candidats', () => {
    const weather = { sky: 'clear', precipitation: 'none', wind: 'calm', temperature: 'mild' }
    let wetlandFog = 0
    let total = 0
    for (let i = 0; i < 10_000; i++) {
      const event = WeatherEventSelector.select({ biome: 'wetland', weather, history: [] })
      if (event === null) continue
      total++
      if (event.id === 'fog-bank-wetland') wetlandFog++
    }
    // Seuls fog-bank (poids 1) et fog-bank-wetland (poids 3) sont éligibles ici : ~75 % attendus.
    assert.equal(total, 10_000, `Tous les tirages wetland×calme devraient produire un événement (${total}/10000)`)
    const rate = wetlandFog / total
    assert.ok(rate > 0.70 && rate < 0.80, `Part de fog-bank-wetland = ${(rate * 100).toFixed(1)} % (attendu ~75 %)`)
  })
})
