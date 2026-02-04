import { logger } from '../utils.js'

const normalize = (str) => {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/\s*\([^)]*\)|\s*\[[^\]]*\]|feat\.?|ft\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const levenshteinDistance = (s1, s2) => {
  const len1 = s1.length
  const len2 = s2.length

  if (len1 === 0) return len2
  if (len2 === 0) return len1

  let prevRow = new Array(len2 + 1)
  let currRow = new Array(len2 + 1)

  for (let j = 0; j <= len2; j++) prevRow[j] = j

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i

    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      )
    }

    const temp = prevRow
    prevRow = currRow
    currRow = temp
  }

  return prevRow[len2]
}

const calculateStringSimilarity = (s1, s2) => {
  if (s1 === s2) return 1.0
  if (!s1 || !s2) return 0.0
  if (s1.includes(s2) || s2.includes(s1)) return 0.85

  const distance = levenshteinDistance(s1, s2)
  const maxLen = Math.max(s1.length, s2.length)

  if (maxLen === 0) return 1.0
  return 1.0 - (distance / maxLen)
}

const calculateDurationSimilarity = (duration1, duration2, tolerance) => {
  if (duration1 <= 0 || duration2 <= 0) return 0.5

  const diff = Math.abs(duration1 - duration2)
  if (diff <= tolerance) return 1.0

  const maxDuration = Math.max(duration1, duration2)
  const ratio = 1.0 - (diff / maxDuration)

  return Math.max(0.0, ratio)
}

const calculateMatchScore = (original, candidate, config, precomputed) => {
  const candidateTitle = candidate.info?.title || candidate.title || ''
  const candidateArtist = candidate.info?.author || candidate.author || ''

  const candidateTitleLower = candidateTitle.trim().toLowerCase()

  const artistScore = calculateStringSimilarity(precomputed.artistNorm, normalize(candidateArtist))
  const durationScore = calculateDurationSimilarity(
    original.length || 0,
    candidate.info?.length || candidate.length || 0,
    config.durationToleranceMs
  )

  let titleScore = 0
  if (precomputed.titleLower === candidateTitleLower) titleScore = 1.0
  else if (candidateTitleLower.startsWith(precomputed.titleLower)) titleScore = 0.95
  else if (candidateTitleLower.includes(precomputed.titleLower)) titleScore = 0.90
  else titleScore = calculateStringSimilarity(precomputed.titleNorm, normalize(candidateTitle))

  return (titleScore * config.weights.title) + (artistScore * config.weights.artist) + (durationScore * config.weights.duration)
}

const getScoredMatches = (original, candidates, config, precomputed) => {
  if (!candidates || candidates.length === 0) return []

  const limit = Math.min(candidates.length, 10)
  const scored = []

  for (let i = 0; i < limit; i++) {
    const candidate = candidates[i]
    const score = calculateMatchScore(original, candidate, config, precomputed)
    scored.push({ match: candidate, score })

    logger('debug', 'Mirroring', `Candidate ${i + 1}: "${candidate.info?.title || candidate.title}" | Score: ${score.toFixed(2)}`)
  }

  return scored.sort((a, b) => b.score - a.score)
}

const getValidatedStreamUrl = async (nodelink, match) => {
  const trackTitle = match?.info?.title || match?.title || 'unknown'

  try {
    logger('debug', 'Mirroring', `Validating stream URL for: "${trackTitle}"`)
    const streamInfo = await nodelink.sources.getTrackUrl(match.info || match)

    if (!streamInfo || streamInfo.exception || !streamInfo.url) {
      const error = streamInfo?.exception?.message || 'No URL returned'
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

const findValidMatch = async (nodelink, scoredMatches, minThreshold) => {
  for (const { match, score } of scoredMatches) {
    if (score < minThreshold) {
      logger('debug', 'Mirroring', `Score ${score.toFixed(2)} below threshold ${minThreshold.toFixed(2)}, stopping validation`)
      break
    }

    const validation = await getValidatedStreamUrl(nodelink, match)
    if (validation.valid) {
      return { match, score, streamInfo: validation.streamInfo }
    }
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

  const providers = mirroring.sources || [
    { name: 'youtube', prefix: 'ytmsearch', isrc: true },
    { name: 'youtube', prefix: 'ytsearch', isrc: false }
  ]

  const precomputed = {
    titleNorm: normalize(track.title || ''),
    titleLower: (track.title || '').trim().toLowerCase(),
    artistNorm: normalize(track.author || '')
  }

  let globalBestMatch = null
  let globalBestScore = 0.0
  let globalBestProvider = null
  let globalBestStreamInfo = null

  for (const provider of providers) {
    const providerName = provider.name || 'unknown'
    const searchPrefix = provider.prefix || 'ytsearch'
    const useIsrc = provider.isrc !== false && track.isrc

    const query = useIsrc 
      ? `${track.isrc.replace(/-/g, '')}`
      : `${track.author && track.author !== 'unknown' ? `${track.title} ${track.author}` : track.title}`

    logger('debug', 'Mirroring', `Searching [${providerName}] with query: "${query}"`)

    let searchResult
    try {
      searchResult = await nodelink.sources.search(searchPrefix, query)
    } catch (e) {
      logger('warn', 'Mirroring', `Provider [${providerName}] search failed: ${e.message}`)
      continue
    }

    if (searchResult.loadType !== 'search' || !searchResult.data?.length) {
      logger('debug', 'Mirroring', `No results from [${providerName}]`)
      continue
    }

    const scoredMatches = getScoredMatches(track, searchResult.data, config, precomputed)

    if (scoredMatches.length === 0) continue

    const topScore = scoredMatches[0].score

    if (topScore >= config.immediateUseThreshold) {
      logger('debug', 'Mirroring', `Top score ${topScore.toFixed(2)} >= immediate threshold, validating only top match`)
      const result = await findValidMatch(nodelink, [scoredMatches[0]], config.immediateUseThreshold)
      if (result) {
        return { ...result, provider: providerName }
      }
    } else if (topScore >= config.highConfidenceThreshold) {
      logger('debug', 'Mirroring', `Top score ${topScore.toFixed(2)} >= high confidence, validating top 3 matches`)
      const result = await findValidMatch(nodelink, scoredMatches.slice(0, 3), config.highConfidenceThreshold)
      if (result) {
        if (result.score > globalBestScore) {
          globalBestScore = result.score
          globalBestMatch = result.match
          globalBestProvider = providerName
          globalBestStreamInfo = result.streamInfo
        }
        if (result.score >= config.immediateUseThreshold) {
          return { ...result, provider: providerName }
        }
      }
    } else {
      logger('debug', 'Mirroring', `Top score ${topScore.toFixed(2)} < high confidence, validating top 5 matches`)
      const result = await findValidMatch(nodelink, scoredMatches.slice(0, 5), config.minSimilarityThreshold)
      if (result && result.score > globalBestScore) {
        globalBestScore = result.score
        globalBestMatch = result.match
        globalBestProvider = providerName
        globalBestStreamInfo = result.streamInfo
      }
    }
  }

  if (globalBestMatch && globalBestScore >= config.minSimilarityThreshold && globalBestStreamInfo) {
    return { 
      match: globalBestMatch, 
      score: globalBestScore, 
      provider: globalBestProvider,
      streamInfo: globalBestStreamInfo
    }
  }

  logger('warn', 'Mirroring', 'No valid mirror found across all providers')
  return null
}

export { resolveMirrorTrack }