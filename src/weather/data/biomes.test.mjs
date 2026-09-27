import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { BIOMES } from './biomes.mjs'
import { SEASONS } from './seasons.mjs'

const BIOME_NAMES = [
  'arid', 'semiArid', 'temperatePlain', 'temperateForest',
  'humidForest', 'wetland', 'coastal', 'mountain', 'tundra', 'glacial',
]

describe('BIOMES — structure', () => {
  test('10 biomes définis', () => {
    assert.deepEqual(Object.keys(BIOMES).sort(), BIOME_NAMES.slice().sort())
  })

  for (const biome of BIOME_NAMES) {
    test(`${biome} : 4 saisons`, () => {
      assert.deepEqual(Object.keys(BIOMES[biome]).sort(), SEASONS.slice().sort())
    })

    for (const season of SEASONS) {
      test(`${biome}×${season} : transitions de longueur 5`, () => {
        assert.equal(BIOMES[biome][season].transitions.length, 5)
      })

      test(`${biome}×${season} : somme des transitions ≈ 1.0`, () => {
        const sum = BIOMES[biome][season].transitions.reduce((a, b) => a + b, 0)
        assert.ok(Math.abs(sum - 1.0) <= 0.001, `somme = ${sum}`)
      })

      test(`${biome}×${season} : dominantTemp défini`, () => {
        assert.ok(typeof BIOMES[biome][season].dominantTemp === 'string')
      })
    }
  }
})

describe('BIOMES — critères d\'acceptation spécifiques', () => {
  test('semiArid×summer : neige (régime 4) interdite', () => {
    assert.equal(BIOMES.semiArid.summer.transitions[4], 0)
  })

  for (const season of SEASONS) {
    test(`arid×${season} : ciel clair (régime 0) ≥ 0.60`, () => {
      assert.ok(
        BIOMES.arid[season].transitions[0] >= 0.60,
        `transitions[0] = ${BIOMES.arid[season].transitions[0]}`
      )
    })
  }

  test('glacial×winter : dominantTemp glacial', () => {
    assert.equal(BIOMES.glacial.winter.dominantTemp, 'glacial')
  })

  test('glacial×winter : régime sévère (4) ≥ 0.30', () => {
    assert.ok(
      BIOMES.glacial.winter.transitions[4] >= 0.30,
      `transitions[4] = ${BIOMES.glacial.winter.transitions[4]}`
    )
  })

  for (const season of SEASONS) {
    test(`wetland×${season} : couvert (régime 2) > arid×${season}`, () => {
      assert.ok(
        BIOMES.wetland[season].transitions[2] > BIOMES.arid[season].transitions[2],
        `wetland=${BIOMES.wetland[season].transitions[2]}, arid=${BIOMES.arid[season].transitions[2]}`
      )
    })
  }
})
