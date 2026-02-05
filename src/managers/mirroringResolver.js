import { logger } from '../utils.js'

function normalize(str) {
  if (!str) return ''
  return str.toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/\b(?:feat|ft)\.?\s*/gi, '')
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[len1][len2]
}

function calculateStringSimilarity(s1, s2) {
  if (s1 === s2) return 1.0
  if (!s1 || !s2) return 0.0
  if (s1.includes(s2) || s2.includes(s1)) return 0.85
  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 1.0
  return 1.0 - (levenshteinDistance(s1, s2) / maxLen)
}

function calculateDurationSimilarity(duration1, duration2, tolerance) {
  if (duration1 <= 0 || duration2 <= 0) return 0.5
  const diff = Math.abs(duration1 - duration2)
  if (diff <= tolerance) return 1.0
  return Math.max(0.0, 1.0 - (diff / Math.max(duration1, duration2)))
}

function calculateMatchScore(original, candidate, config) {
  const origTitle = (original.title || '').trim().toLowerCase()
  const candTitle = ((candidate.info?.title || candidate.title) || '').trim().toLowerCase()

  let titleScore = 0
  if (origTitle === candTitle) {
    titleScore = 1.0
  } else if (candTitle.startsWith(origTitle) || candTitle.includes(origTitle)) {
    titleScore = candTitle.startsWith(origTitle) ? 0.95 : 0.90
  } else {
    titleScore = calculateStringSimilarity(normalize(origTitle), normalize(candTitle))
  }

  const artistScore = calculateStringSimilarity(
    normalize(original.author || ''),
    normalize(candidate.info?.author || candidate.author || '')
  )

  const durationScore = calculateDurationSimilarity(
    original.length || 0,
    candidate.info?.length || candidate.length || 0,
    config.durationToleranceMs
  )

  return (titleScore * config.weights.title) + (artistScore * config.weights.artist) + (durationScore * config.weights.duration)
}

function getScoredMatches(original, candidates, config) {
  if (!candidates?.length) return []
  const limit = Math.min(candidates.length, 10)
  const scored = []
  for (let i = 0; i < limit; i++) {
    const candidate = candidates[i]
    const score = calculateMatchScore(original, candidate, config)
    scored.push({ match: candidate, score })
    logger('debug', 'Mirroring', `Candidate ${i + 1}: "${candidate.info?.title || candidate.title}" | Score: ${score.toFixed(2)}`)
  }
  return scored.sort((a, b) => b.score - a.score)
}

async function getValidatedStreamUrl(nodelink, match) {
  const trackTitle = match?.info?.title || match?.title || 'unknown'
  try {
    logger('debug', 'Mirroring', `Validating stream URL for: "${trackTitle}"`)
    const streamInfo = await nodelink.sources.getTrackUrl(match.info || match)
    if (!streamInfo || streamInfo.exception || !streamInfo.url) {
      const error = streamInfo?.exception?.message || 'Invalid or missing streaming URL in response'
      logger('debug', 'Mirroring', `Stream validation failed for "${trackTitle}": ${error}`)
      return { valid: false, error }
    }
    logger('debug', 'Mirroring', `Stream URL validated for "${trackTitle}": ${streamInfo.url}`)
    return { valid: true, streamInfo }
  } catch (e) {
    logger('debug', 'Mirroring', `Stream validation exception for "${trackTitle}": ${e.message}`)
    return { valid: false, error: e.message }
  }
}

async function findValidMatch(nodelink, scoredMatches, minThreshold) {
  const filtered = scoredMatches.filter(({ score }) => score >= minThreshold)
  if (filtered.length === 0) {
    logger('debug', 'Mirroring', `All scores below threshold ${minThreshold.toFixed(2)}`)
    return null
  }
  const validationPromises = filtered.map(async ({ match, score }) => {
    const validation = await getValidatedStreamUrl(nodelink, match)
    return validation.valid ? { match, score, streamInfo: validation.streamInfo } : null
  })
  const results = await Promise.all(validationPromises)
  const validMatches = results.filter(r => r !== null)
  if (validMatches.length > 0) {
    const best = validMatches.sort((a, b) => b.score - a.score)[0]
    logger('info', 'Mirroring', `Found valid match: "${best.match?.info?.title || best.match?.title}" (score: ${best.score.toFixed(2)})`)
    return best
  }
  return null
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

  const excludeSource = track.sourceName?.toLowerCase()
  if (excludeSource) {
    logger('debug', 'Mirroring', `Excluding failed source: [${excludeSource}]`)
  }

  const allProviders = mirroring.sources || [
    { name: 'youtube', prefix: 'ytmsearch', isrc: true },
    { name: 'youtube', prefix: 'ytsearch', isrc: false }
  ]

  const providers = allProviders.filter(p => (p.name || 'unknown').toLowerCase() !== excludeSource)
  if (providers.length === 0) {
    logger('warn', 'Mirroring', 'No providers available after exclusion')
    return null
  }

  let globalBestMatch = null
  let globalBestScore = 0.0
  let globalBestProvider = null
  let globalBestStreamInfo = null
  let globalBestPriority = 999

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]
    const providerName = provider.name || 'unknown'
    const useIsrc = provider.isrc !== false && track.isrc
    const query = useIsrc ? track.isrc.replace(/-/g, '') : 
      (track.author && track.author !== 'unknown' ? `${track.title} ${track.author}` : track.title)

    logger('debug', 'Mirroring', `Searching [${providerName}] (priority: ${i}) with query: "${query}"`)

    let searchResult
    try {
      searchResult = await nodelink.sources.search(provider.prefix || 'ytsearch', query)
    } catch (e) {
      logger('warn', 'Mirroring', `Provider [${providerName}] search failed: ${e.message}`)
      continue
    }

    if (searchResult.loadType !== 'search' || !searchResult.data?.length) continue

    const scoredMatches = getScoredMatches(track, searchResult.data, config)
    if (!scoredMatches.length) continue

    const topScore = scoredMatches[0].score
    let result = null
    let candidateCount = 1

    if (topScore >= config.immediateUseThreshold) {
      logger('debug', 'Mirroring', `Top score ${topScore.toFixed(2)} >= immediate threshold`)
      result = await findValidMatch(nodelink, [scoredMatches[0]], config.immediateUseThreshold)
      if (result) return { ...result, provider: providerName }
    } else if (topScore >= config.highConfidenceThreshold) {
      candidateCount = 2
    } else {
      candidateCount = 3
    }

    if (!result) {
      logger('debug', 'Mirroring', `Validating top ${candidateCount} matches`)
      result = await findValidMatch(nodelink, scoredMatches.slice(0, candidateCount), 
        topScore >= config.highConfidenceThreshold ? config.highConfidenceThreshold : config.minSimilarityThreshold)
    }

    if (result) {
      const scoreDiff = result.score - globalBestScore
      if (scoreDiff > 0.10 || (scoreDiff >= -0.05 && i < globalBestPriority)) {
        if (scoreDiff < 0 && i < globalBestPriority) {
          logger('debug', 'Mirroring', `Preferring [${providerName}] (priority ${i}) over (priority ${globalBestPriority})`)
        }
        globalBestScore = result.score
        globalBestMatch = result.match
        globalBestProvider = providerName
        globalBestStreamInfo = result.streamInfo
        globalBestPriority = i
      }
      if (result.score >= config.immediateUseThreshold) {
        return { ...result, provider: providerName }
      }
    }
  }

  if (globalBestMatch && globalBestStreamInfo) {
    logger('info', 'Mirroring', `Best match from [${globalBestProvider}]: "${globalBestMatch?.info?.title || 'unknown'}" (score: ${globalBestScore.toFixed(2)})`)
    return { match: globalBestMatch, score: globalBestScore, provider: globalBestProvider, streamInfo: globalBestStreamInfo }
  }

  logger('warn', 'Mirroring', 'No valid mirror found')
  return null
}

export { resolveMirrorTrack }