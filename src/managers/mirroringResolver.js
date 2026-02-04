import { logger } from '../utils.js'

function normalize(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/feat\.?|ft\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(s1, s2) {
  const len1 = s1.length
  const len2 = s2.length
  const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0))

  for (let i = 0; i <= len1; i++) dp[i][0] = i
  for (let j = 0; j <= len2; j++) dp[0][j] = j

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[len1][len2]
}

function calculateStringSimilarity(s1, s2) {
  if (s1 === s2) return 1.0
  if (!s1 || !s2) return 0.0
  if (s1.includes(s2) || s2.includes(s1)) return 0.85

  const distance = levenshteinDistance(s1, s2)
  const maxLen = Math.max(s1.length, s2.length)

  if (maxLen === 0) return 1.0
  return 1.0 - (distance / maxLen)
}

function calculateDurationSimilarity(duration1, duration2, tolerance) {
  if (duration1 <= 0 || duration2 <= 0) return 0.5

  const diff = Math.abs(duration1 - duration2)
  if (diff <= tolerance) return 1.0

  const maxDuration = Math.max(duration1, duration2)
  const ratio = 1.0 - (diff / maxDuration)

  return Math.max(0.0, ratio)
}

function calculateMatchScore(original, candidate, config) {
  const originalTitle = original.title || ''
  const candidateTitle = candidate.info?.title || candidate.title || ''
  const originalArtist = original.author || ''
  const candidateArtist = candidate.info?.author || candidate.author || ''

  const originalTitleLower = originalTitle.trim().toLowerCase()
  const candidateTitleLower = candidateTitle.trim().toLowerCase()

  const artistScore = calculateStringSimilarity(normalize(originalArtist), normalize(candidateArtist))
  const durationScore = calculateDurationSimilarity(
    original.length || 0,
    candidate.info?.length || candidate.length || 0,
    config.durationToleranceMs
  )

  let titleScore = 0
  if (originalTitleLower === candidateTitleLower) titleScore = 1.0
  else if (candidateTitleLower.startsWith(originalTitleLower)) titleScore = 0.95
  else if (candidateTitleLower.includes(originalTitleLower)) titleScore = 0.90
  else titleScore = calculateStringSimilarity(normalize(originalTitle), normalize(candidateTitle))

  return (titleScore * config.weights.title) + (artistScore * config.weights.artist) + (durationScore * config.weights.duration)
}

function findBestMatch(original, candidates, config, minThreshold) {
  if (!candidates || candidates.length === 0) return null

  let bestMatch = null
  let bestScore = 0.0

  const limit = Math.min(candidates.length, 10)

  for (let i = 0; i < limit; i++) {
    const candidate = candidates[i]
    const score = calculateMatchScore(original, candidate, config)

    logger(
      'debug',
      'Mirroring',
      `Candidate ${i + 1}: "${candidate.info?.title || candidate.title}" | Score: ${score.toFixed(2)}`
    )

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
    if (score >= 0.98) break
  }

  if (bestScore >= minThreshold) {
    return { match: bestMatch, score: bestScore }
  }

  return bestScore > 0 ? { match: bestMatch, score: bestScore } : null
}

async function resolveMirrorTrack(nodelink, track) {
  const mirroring = nodelink.options.mirroring || {}

  const config = {
    durationToleranceMs: mirroring.durationToleranceMs || 5000,
    minSimilarityThreshold: mirroring.minSimilarityThreshold || 0.55,
    highConfidenceThreshold: mirroring.highConfidenceThreshold || 0.80,
    immediateUseThreshold: mirroring.immediateUseThreshold || 0.85,
    weights: {
      title: mirroring.weights?.title || 0.45,
      artist: mirroring.weights?.artist || 0.35,
      duration: mirroring.weights?.duration || 0.20
    }
  }

  const providers = mirroring.sources || [
    { name: 'youtube', prefix: 'ytmsearch', isrc: true },
    { name: 'youtube', prefix: 'ytsearch', isrc: false }
  ]

  let globalBestMatch = null
  let globalBestScore = 0.0
  let globalBestProvider = null

  for (const provider of providers) {
    const providerName = provider.name || 'unknown'
    const searchPrefix = provider.prefix || 'ytsearch'
    const useIsrc = provider.isrc !== false && track.isrc

    let query = useIsrc 
      ? `${track.isrc.replace(/-/g, '')}`
      : `${track.author && track.author !== 'unknown' ? `${track.title} ${track.author}` : track.title}`

    let searchResult
    try {
      
      searchResult = await nodelink.sources.search(searchPrefix , query)
      logger('debug', 'Mirroring', `Searching [${providerName}] with query: ${query}`)
    
    } catch (e) {
      logger('warn', 'Mirroring', `Provider [${providerName}] failed: ${e.message}`)
      continue
    }

    if (searchResult.loadType !== 'search' || !searchResult.data?.length) continue

    const matchResult = findBestMatch(track, searchResult.data, config, config.highConfidenceThreshold)

    if (!matchResult) {
      const fallbackResult = findBestMatch(track, searchResult.data, config, 0)
      if (fallbackResult && fallbackResult.score > globalBestScore) {
        globalBestScore = fallbackResult.score
        globalBestMatch = fallbackResult.match
        globalBestProvider = providerName
      }
      continue
    }

    const { match, score } = matchResult
    if (score > globalBestScore) {
      globalBestScore = score
      globalBestMatch = match
      globalBestProvider = providerName
    }

    if (score >= config.immediateUseThreshold || score >= config.highConfidenceThreshold) {
      return { match, score, provider: providerName }
    }
  }

  if (globalBestMatch && globalBestScore >= config.minSimilarityThreshold) {
    return { match: globalBestMatch, score: globalBestScore, provider: globalBestProvider }
  }

  return null
}

export { resolveMirrorTrack }