export default {
  server: {
    host: '0.0.0.0',
    port: 3000,
    password: 'youshallnotpass',
    useBunServer: false // set to true to use Bun.serve websocket (experimental)
  },
  cluster: {
    enabled: true, // active cluster (or use env CLUSTER_ENABLED)
    workers: 0, // 0 => uses os.cpus().length, or specify a number (1 = 2 processes total: master + 1 worker)
    minWorkers: 1, // Minimum workers to keep alive (improves availability during bursts)
    specializedSourceWorker: {
      enabled: true, // If true, source loading (search, lyrics, etc.) is delegated to dedicated workers to prevent voice worker lag
      count: 1, // Number of separate process clusters for source operations
      microWorkers: 2, // Number of worker threads per process cluster
      tasksPerWorker: 32, // Number of parallel tasks each micro-worker can handle before queuing
      silentLogs: true // If true, micro-workers will only log warnings and errors
    },
    commandTimeout: 6000, // Timeout for heavy operations like loadTracks (6s)
    fastCommandTimeout: 4000, // Timeout for player commands like play/pause (4s)
    maxRetries: 2, // Number of retry attempts on timeout or worker failure
    hibernation: {
      enabled: true,
      timeoutMs: 1200000
    },
    scaling: {
      //scaling configurations
      maxPlayersPerWorker: 20, // Reference capacity for utilization calculation
      targetUtilization: 0.7, // Target utilization for scaling up/down
      scaleUpThreshold: 0.75, // Utilization threshold to scale up
      scaleDownThreshold: 0.3, // Utilization threshold to scale down
      checkIntervalMs: 5000, // Interval to check for scaling needs
      idleWorkerTimeoutMs: 60000, // Time in ms an idle worker should wait before being removed
      queueLengthScaleUpFactor: 5, // How many commands in queue per active worker trigger scale up
      lagPenaltyLimit: 60, // Event loop lag threshold (ms) to penalize worker cost
      cpuPenaltyLimit: 0.85 // CPU usage threshold (85% of a core) to force scale up
    },
    endpoint: {
      patchEnabled: true,
      allowExternalPatch: false,
      code: 'CAPYBARA'
    }
  },
  logging: {
    level: 'debug',
    file: {
      enabled: false,
      path: 'logs',
      rotation: 'daily',
      ttlDays: 7
    },
    debug: {
      all: true,
      request: true,
      session: true,
      player: true,
      filters: true,
      sources: true,
      lyrics: true,
      youtube: true,
      'youtube-cipher': true,
      sabr: false,
      potoken: false
    }
  },
  connection: {
    logAllChecks: false,
    interval: 300000, // 5 minutes
    timeout: 10000, // 10 seconds
    thresholds: {
      bad: 1, // Mbps
      average: 5 // Mbps
    }
  },
  maxSearchResults: 10,
  maxAlbumPlaylistLength: 100,
  playerUpdateInterval: 2000,
  statsUpdateInterval: 30000,
  trackStuckThresholdMs: 10000,
  eventTimeoutMs: 15000,
  zombieThresholdMs: 60000,
  enableHoloTracks: false,
  enableTrackStreamEndpoint: false,
  enableLoadStreamEndpoint: false,
  resolveExternalLinks: false,
  fetchChannelInfo: false,
  filters: {
    enabled: {
      tremolo: true,
      vibrato: true,
      lowpass: true,
      highpass: true,
      rotation: true,
      karaoke: true,
      distortion: true,
      channelMix: true,
      equalizer: true,
      chorus: true,
      compressor: true,
      echo: true,
      phaser: true,
      timescale: true
    }
  },
  defaultSearchSource: ['youtube', 'soundcloud'],
  unifiedSearchSources: ['youtube', 'soundcloud'],
  mirroring: {
    // Mirroring configuration - defines which sources to use for finding playable versions of tracks for sources which doesn't support streaming
    // Providers are tried in order until a match with score ≥  highConfidenceThreshold is found, or all are exhausted
    sources: [
      {
        name: 'youtube', // Source name (must match an enabled source in the sources config)
        prefix: 'ytmsearch', // Search prefix to use (ytmsearch = YouTube Music, ytsearch = YouTube, scsearch = SoundCloud, etc.)
        isrc: true // If true and track has ISRC, searches using ISRC code for more accurate matching. If false or no ISRC, uses title+artist
      },
      {
        name: 'youtube', // Same source can be used multiple times with different configs
        prefix: 'ytsearch', // Regular YouTube search (fallback if YouTube Music fails)
        isrc: false // Disable ISRC for this attempt (will use title+artist search)
      },
      {
        name: 'soundcloud', // Third fallback - SoundCloud
        prefix: 'scsearch',
        isrc: false
      }
    ],
    minSimilarityThreshold: 0.55, // Minimum match score to accept (0.0-1.0). Lower = more permissive but less accurate (default: 0.55)
    highConfidenceThreshold: 0.80, // Score threshold to use match immediately without trying other providers (default: 0.85)
    immediateUseThreshold: 0.85, // Score threshold to use match and skip all remaining providers (default: 0.90)
    weights: {
      // How much each component contributes to final score (must sum to 1.0)
      title: 0.45, // Title similarity weight (default: 0.45 = 45%)
      artist: 0.35, // Artist similarity weight (default: 0.35 = 35%)
      duration: 0.20 // Duration similarity weight (default: 0.20 = 20%)
    },
    durationToleranceMs: 5000 // Duration difference tolerance in milliseconds (default: 5000 = ±5 seconds)
  },
  sources: {
    
    amazonmusic: {
      enabled: true
    },
    songlink: {
      enabled: true,
      apiKey: '',
      userCountry: 'US',
      songIfSingle: true,
      useApi: true,
      useScrapeFallback: true,
      preferredPlatforms: [
        'spotify',
        'appleMusic',
        'youtubeMusic',
        'youtube',
        'deezer',
        'tidal',
        'amazonMusic',
        'soundcloud',
        'bandcamp',
        'audius',
        'audiomack',
        'pandora',
        'itunes',
        'amazonStore'
      ],
      fallbackToAny: true
    },
    mixcloud: {
      enabled: true
    },
    audiomack: {
      enabled: true
    },
    deezer: {
      // arl: '',
      // decryptionKey: '',
      enabled: true
    },
    bandcamp: {
      enabled: true
    },
    soundcloud: {
      enabled: true
      // clientId: ""
    },
    local: {
      enabled: true,
      basePath: './local-music/'
    },
    http: {
      enabled: true
    },
    eternalbox: {
      enabled: true,
      baseUrl: 'https://eternalboxmirror.xyz',
      searchResults: 30,
      enrichSpotify: true,
      includeAnalysis: true,
      includeAnalysisSummary: true,
      eternalStream: true,
      cacheMaxBytes: 20 * 1024 * 1024,
      maxBranches: 4,
      maxBranchThreshold: 75,
      branchThresholdStart: 10,
      branchThresholdStep: 5,
      branchTargetDivisor: 6,
      addLastEdge: true,
      justBackwards: false,
      justLongBranches: false,
      removeSequentialBranches: true,
      useFilteredSegments: true,
      minRandomBranchChance: 0.18,
      maxRandomBranchChance: 0.5,
      randomBranchChanceDelta: 0.09,
      timbreWeight: 1,
      pitchWeight: 10,
      loudStartWeight: 1,
      loudMaxWeight: 1,
      durationWeight: 100,
      confidenceWeight: 1,
      infiniteStream: true,
      maxReconnects: 0,
      reconnectDelayMs: 1000
    },
    shazam: {
      enabled: true,
      allowExplicit: true
    },
    bilibili: {
      enabled: true,
      sessdata: '' // Optional, improves access to some videos (premium and 4k+)
    },
    genius: {
      enabled: true
    },
    jiosaavn: {
      enabled: true,
      playlistLoadLimit: 50,
      artistLoadLimit: 20
      // "secretKey": "38346591" // Optional, defaults to standard key
    },
    gaana: {
      enabled: true,
      apiUrl: 'https://gaana.1lucas1apk.fun/api', // if you want to host your server https://github.com/notdeltaxd/Gaana-API
      streamQuality: 'high',
      playlistLoadLimit: 100,
      albumLoadLimit: 100,
      artistLoadLimit: 100
    },
    youtube: {
      enabled: true,
      allowItag: [], // additional itags for audio streams, e.g., [140, 141]
      targetItag: null, // force a specific itag for audio streams, overriding the quality option
      getOAuthToken: false,
      hl: 'en',
      gl: 'US',
      clients: {
        search: ['Android'], // Clients used for searching tracks
        playback: ['AndroidVR', 'TV', 'WebEmbedded', 'WebParentTools', 'Web', 'IOS'], // Clients used for playback/streaming
        resolve: ['AndroidVR', 'TV', 'WebEmbedded', 'WebParentTools', 'IOS', 'Web'], // Clients used for resolving detailed track information (channel, external links, etc.)
        settings: {
          TV: {
            refreshToken: [''] // You can use a string "token" or an array ["token1", "token2"] for rotation/fallback
          }
        }
      },
      cipher: {
        url: 'https://cipher.kikkia.dev/api',
        token: null
      }
    },
    spotify: {
      enabled: true,
      clientId: '',
      clientSecret: '',
      externalAuthUrl: 'http://get.1lucas1apk.fun/spotify/gettoken', // URL to external token provider (e.g. http://localhost:8080/api/token - use https://github.com/topi314/spotify-tokener or https://github.com/1Lucas1apk/gettoken)
      market: 'US',
      playlistLoadLimit: 1, // 0 means no limit (loads all tracks), 1 = 100 tracks, 2 = 100 and so on!
      playlistPageLoadConcurrency: 10, // How many pages to load simultaneously
      albumLoadLimit: 1, // 0 means no limit (loads all tracks), 1 = 50 tracks, 2 = 100 tracks, etc.
      albumPageLoadConcurrency: 5, // How many pages to load simultaneously
      allowExplicit: true, // If true plays the explicit version of the song, If false plays the Non-Explicit version of the song. Normal songs are not affected.
      sp_dc: '' // fot getting mobile token (optional) get from spotify in browser devtools -> Application -> Cookies -> sp_dc (requered for canvas)
    },
    applemusic: {
      enabled: true,
      mediaApiToken: 'token_here', //manually | or "token_here" to get a token automatically
      market: 'US',
      playlistLoadLimit: 0,
      albumLoadLimit: 0,
      playlistPageLoadConcurrency: 5,
      albumPageLoadConcurrency: 5,
      allowExplicit: true
    },
    tidal: {
      enabled: true,
      token: 'token_here', //manually | or "token_here" to get a token automatically, get from tidal web player devtools; using login google account
      countryCode: 'US',
      playlistLoadLimit: 2, // 0 = no limit, 1 = 50 tracks, 2 = 100 tracks, etc.
      playlistPageLoadConcurrency: 5 // How many pages to load simultaneously
    },
    pandora: {
      enabled: true,
      // Optional, setting this manually can help unblocking countries (since pandora is US only.). May need to be updated periodically.
      // fetching manually: use a vpn connected to US, go on pandora.com, open devtools, Network tab, first request to appear and copy the 2nd csrfToken= value.
      // csrfToken: '',
      remoteTokenUrl: 'https://get.1lucas1apk.fun/pandora/gettoken' // URL to a remote provider that returns { success: true, authToken: "...", csrfToken: "...", expires_in_seconds: ... } //https://github.com/1Lucas1apk/gettoken
    },
    qobuz: {
      enabled: true,
      userToken: '', // (optional) get from play.qobuz.com in browser devtools -> Application -> Local Storage -> localuser -> token
      formatId: '5', // 5 = MP3 320kbps, 6 = FLAC (requires Studio subscription), 27 = Hi-Res FLAC
      allowExplicit: true
    },
    lastfm: {
      enabled: true
    },
  },
  lyrics: {
    fallbackSource: 'genius',
    youtube: {
      enabled: true
    },
    genius: {
      enabled: true
    },
    musixmatch: {
      enabled: true
      // signatureSecret: ''
    },
    lrclib: {
      enabled: true
    },
    bilibili: {
      enabled: true
    },
  },
  meanings: {
    
    wikipedia: {
      enabled: true
    }
  },
  audio: {
    quality: 'high', // high, medium, low, lowest
    encryption: 'aead_aes256_gcm_rtpsize',
    resamplingQuality: 'best', // best, medium, fastest, zero order holder, linear
    fading: {
      enabled: false,
      // curve meanings:
      // linear = constant rate, exponential = slow start then faster,
      // logarithmic = fast start then slower, s-curve = smooth start/end
      trackStart: {
        duration: 0,
        curve: 'linear'
      },
      trackEnd: {
        duration: 0,
        curve: 'linear'
      },
      trackStop: {
        duration: 0,
        curve: 'linear'
      },
      seek: {
        duration: 0,
        curve: 'linear'
      },
      ducking: {
        enabled: false,
        duration: 0,
        targetVolume: 0.3,
        curve: 'linear'
      }
    }
  },
  voiceReceive: {
    enabled: false,
    format: 'opus' // pcm_s16le, opus
  },
  routePlanner: {
    strategy: 'RotateOnBan', // RotateOnBan, RoundRobin, LoadBalance
    bannedIpCooldown: 600000, // 10 minutes
    ipBlocks: []
  },
  rateLimit: {
    enabled: true,
    global: {
      maxRequests: 1000,
      timeWindowMs: 60000 // 1 minute
    },
    perIp: {
      maxRequests: 100,
      timeWindowMs: 10000 // 10 seconds
    },
    perUserId: {
      maxRequests: 50,
      timeWindowMs: 5000 // 5 seconds
    },
    perGuildId: {
      maxRequests: 20,
      timeWindowMs: 5000 // 5 seconds
    },
    ignorePaths: [],
    ignore: {
      userIds: [],
      guildIds: [],
      ips: []
    }
  },
  dosProtection: {
    enabled: true,
    thresholds: {
      burstRequests: 50,
      timeWindowMs: 10000 // 10 seconds
    },
    mitigation: {
      delayMs: 500,
      blockDurationMs: 300000 // 5 minutes
    },
    ignore: {
      userIds: [],
      guildIds: [],
      ips: []
    }
  },
  metrics: {
    enabled: true,
    authorization: {
      type: 'Bearer', // Bearer or Basic.
      username: 'admin',
      password: '' // If empty, uses server.password
    }
  },
  mix: {
    enabled: true,
    defaultVolume: 0.8,
    maxLayersMix: 5,
    autoCleanup: true
  },
  plugins: [
    /* {
          name: 'nodelink-sample-plugin',
          source: 'local'
        } */
  ],
  pluginConfig: {}
};