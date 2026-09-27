export function applyConstraints({ weights, dominantTemp }) {
  const w = weights.slice()

  if (dominantTemp === 'hot') w[4] = 0
  if (dominantTemp === 'glacial') w[1] = 0

  const sum = w.reduce((a, b) => a + b, 0)
  if (sum === 0) return normalize(weights)

  return normalize(w)
}

function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return [0.2, 0.2, 0.2, 0.2, 0.2]
  return weights.map(w => w / sum)
}
