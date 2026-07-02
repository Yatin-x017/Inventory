// Lightweight Devanagari -> Roman phonetic transliteration + fuzzy matching.
// Purpose: when someone speaks a product name in Hindi (e.g. "आईफोन सोलह प्रो"),
// Chrome's hi-IN recognizer returns Devanagari script even for English brand
// names ("iPhone" -> "आईफोन"). Inventory item names are stored in English, so a
// literal substring match against the Hindi transcript never succeeds. This
// module converts the transcript into a rough phonetic Roman string and scores
// it against item names/brands/SKUs so voice queries resolve correctly
// regardless of which script the recognizer chose.

const INDEPENDENT_VOWELS = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
}

// Base form includes the inherent "a" sound; stripped when a matra or virama follows.
const CONSONANTS = {
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va',
  'श': 'sha', 'ष': 'sha', 'स': 'sa', 'ह': 'ha',
  'क़': 'qa', 'ख़': 'kha', 'ग़': 'gha', 'ज़': 'za', 'ड़': 'da', 'ढ़': 'dha', 'फ़': 'fa',
}

const MATRAS = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
}

const OTHERS = { 'ं': 'n', 'ँ': 'n', 'ः': 'h' }
const VIRAMA = '्'

export function devanagariToRoman(text) {
  const chars = Array.from(text)
  let result = ''
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    const next = chars[i + 1]
    if (CONSONANTS[c]) {
      const base = CONSONANTS[c]
      const sound = base.slice(0, -1) // strip inherent "a"
      if (next === VIRAMA) {
        result += sound
        i++ // skip virama
      } else if (next && MATRAS[next]) {
        result += sound + MATRAS[next]
        i++ // skip matra
      } else {
        result += base
      }
    } else if (INDEPENDENT_VOWELS[c]) {
      result += INDEPENDENT_VOWELS[c]
    } else if (OTHERS[c]) {
      result += OTHERS[c]
    } else {
      // Latin letters, digits, spaces, punctuation pass through untouched —
      // this also handles mixed-script speech where brand names stay in English.
      result += c
    }
  }
  // Modern spoken Hindi drops the word-final inherent vowel ("बुक" is said
  // "buk", not "buka") — strip it per word so phonetic matching isn't thrown
  // off by a schwa nobody actually says out loud.
  return result
    .split(' ')
    .map((word) => (word.length > 1 && word.endsWith('a') ? word.slice(0, -1) : word))
    .join(' ')
}

export function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Dice coefficient over character bigrams — tolerant of the vowel insertions/
// drops that phonetic transliteration introduces (e.g. "aiphona" vs "iphone").
function diceCoefficient(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = (s) => {
    const arr = []
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2))
    return arr
  }
  const aBigrams = bigrams(a)
  const bBigrams = bigrams(b)
  let matches = 0
  const pool = [...bBigrams]
  for (const bg of aBigrams) {
    const idx = pool.indexOf(bg)
    if (idx !== -1) {
      matches++
      pool.splice(idx, 1)
    }
  }
  return (2 * matches) / (aBigrams.length + bBigrams.length)
}

// Longest common subsequence ratio — more forgiving than bigram overlap for
// short strings with a few inserted/dropped vowels, which transliteration noise
// produces constantly.
function lcsRatio(a, b) {
  if (!a || !b) return 0
  const dp = Array(a.length + 1)
    .fill(null)
    .map(() => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length] / Math.max(a.length, b.length)
}

function fieldScore(candidates, fieldNorm) {
  if (!fieldNorm) return 0
  let best = 0
  for (const c of candidates) {
    if (!c) continue
    if (fieldNorm.includes(c) || c.includes(fieldNorm)) {
      best = Math.max(best, 0.95)
    }
    best = Math.max(best, diceCoefficient(c, fieldNorm), lcsRatio(c, fieldNorm) * 0.85)
  }
  return best
}

// Returns items sorted by relevance. Uses two filters: an absolute threshold
// (so a completely unrelated query doesn't return a confident-sounding wrong
// answer) and a relative band around the top score (so a shared generic word
// like "pro" across several products doesn't drag in every item that has it).
export function findVoiceMatches(rawTranscript, items, threshold = 0.3) {
  const rawNorm = normalize(rawTranscript)
  const translitNorm = normalize(devanagariToRoman(rawTranscript))
  const candidates = [...new Set([rawNorm, translitNorm])]

  const scored = items
    .map((item) => ({
      item,
      score: Math.max(
        fieldScore(candidates, normalize(item.name)),
        fieldScore(candidates, normalize(item.brand)) * 0.85,
        fieldScore(candidates, normalize(item.sku)) * 0.7
      ),
    }))
    .filter((s) => s.score >= threshold)

  if (scored.length === 0) return []
  const topScore = Math.max(...scored.map((s) => s.score))

  return scored
    .filter((s) => s.score >= topScore * 0.7)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item)
}

// Exposed for tuning/debugging — same scoring path as findVoiceMatches but
// returns raw scores instead of filtering, so thresholds can be picked deliberately.
export function debugVoiceScores(rawTranscript, items) {
  const rawNorm = normalize(rawTranscript)
  const translitNorm = normalize(devanagariToRoman(rawTranscript))
  const candidates = [...new Set([rawNorm, translitNorm])]
  return items
    .map((item) => ({
      name: item.name,
      score: Math.max(
        fieldScore(candidates, normalize(item.name)),
        fieldScore(candidates, normalize(item.brand)) * 0.85,
        fieldScore(candidates, normalize(item.sku)) * 0.7
      ),
    }))
    .sort((a, b) => b.score - a.score)
}
