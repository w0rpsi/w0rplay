import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import { isInHost } from '../../../shared/host'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import './tv.css'

export type ChannelCategory = 'Tümü' | 'Ulusal' | 'Haber' | 'Spor' | 'Müzik' | 'Belgesel'

export interface Channel {
  id: string
  name: string
  category: ChannelCategory
  subtitle: string
  streamUrl?: string
  youtubeId?: string
  badgeColor: string
}

const DEFAULT_CHANNELS: Channel[] = [
  {
    id: 'trt1',
    name: 'TRT 1 HD',
    category: 'Ulusal',
    subtitle: 'Dizi & Kültür',
    streamUrl: 'https://tv-trt1.medya.trt.com.tr/master.m3u8',
    badgeColor: '#e74c3c',
  },
  {
    id: 'atv',
    name: 'ATV HD',
    category: 'Ulusal',
    subtitle: 'Ulusal & Dizi',
    streamUrl: 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/atv/atv.m3u8',
    badgeColor: '#e67e22',
  },
  {
    id: 'trtspor',
    name: 'TRT Spor HD',
    category: 'Spor',
    subtitle: 'Canlı Maç & Spor',
    streamUrl: 'https://tv-trtspor1.medya.trt.com.tr/master.m3u8',
    badgeColor: '#27ae60',
  },
  {
    id: 'trtspor2',
    name: 'TRT Spor Yıldız',
    category: 'Spor',
    subtitle: 'Olimpik & Branş Sporları',
    streamUrl: 'https://tv-trtspor2.medya.trt.com.tr/master.m3u8',
    badgeColor: '#2ecc71',
  },
  {
    id: 'aspor',
    name: 'A Spor HD',
    category: 'Spor',
    subtitle: 'Canlı Spor & Yorum',
    streamUrl: 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8',
    badgeColor: '#16a085',
  },
  {
    id: 'redbull',
    name: 'Red Bull TV',
    category: 'Spor',
    subtitle: 'Motorspor & Aksiyon',
    streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    badgeColor: '#2980b9',
  },
  {
    id: 'trthaber',
    name: 'TRT Haber HD',
    category: 'Haber',
    subtitle: '24/7 Sıcak Gündem',
    streamUrl: 'https://tv-trthaber.medya.trt.com.tr/master.m3u8',
    badgeColor: '#d35400',
  },
  {
    id: 'haberturk',
    name: 'Habertürk TV',
    category: 'Haber',
    subtitle: 'Canlı Haber & Tartışma',
    streamUrl: 'https://tv.ensonhaber.com/haberturk/haberturk.m3u8',
    badgeColor: '#c0392b',
  },
  {
    id: 'haberglobal',
    name: 'Haber Global',
    category: 'Haber',
    subtitle: 'Analiz & Dünya',
    streamUrl: 'https://tv.ensonhaber.com/haberglobal/haberglobal.m3u8',
    badgeColor: '#8e44ad',
  },
  {
    id: 'ahaber',
    name: 'A Haber HD',
    category: 'Haber',
    subtitle: 'Günün Gelişmeleri',
    streamUrl: 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/ahaber/ahaber.m3u8',
    badgeColor: '#962d3e',
  },
  {
    id: 'powerturk',
    name: 'PowerTürk TV',
    category: 'Müzik',
    subtitle: 'Türkçe Pop Hit',
    streamUrl: 'https://live.artidijitalmedya.com/artidijital_powerturktv/powerturktv/playlist.m3u8',
    badgeColor: '#e84393',
  },
  {
    id: 'powertv',
    name: 'Power TV HD',
    category: 'Müzik',
    subtitle: 'Dünya Müziği & Pop',
    streamUrl: 'https://livetv.powerapp.com.tr/powerTV/powerhd.smil/playlist.m3u8',
    badgeColor: '#6c5ce7',
  },
  {
    id: 'trtmuzik',
    name: 'TRT Müzik HD',
    category: 'Müzik',
    subtitle: 'Klasik & Halk Müziği',
    streamUrl: 'https://tv-trtmuzik.medya.trt.com.tr/master.m3u8',
    badgeColor: '#fd79a8',
  },
  {
    id: 'trtbelgesel',
    name: 'TRT Belgesel HD',
    category: 'Belgesel',
    subtitle: 'Doğa, Tarih & Macera',
    streamUrl: 'https://tv-trtbelgesel.medya.trt.com.tr/master.m3u8',
    badgeColor: '#00b894',
  },
  {
    id: 'trtcocuk',
    name: 'TRT Çocuk',
    category: 'Belgesel',
    subtitle: 'Çocuk & Animasyon',
    streamUrl: 'https://tv-trtcocuk.medya.trt.com.tr/master.m3u8',
    badgeColor: '#0984e3',
  },
]

const CATEGORIES: ChannelCategory[] = ['Tümü', 'Ulusal', 'Haber', 'Spor', 'Müzik', 'Belgesel']

export function TVApp() {
  const text = useText()
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS)
  const [selectedChannel, setSelectedChannel] = useState<Channel>(DEFAULT_CHANNELS[0])
  const [activeCategory, setActiveCategory] = useState<ChannelCategory>('Tümü')
  const [showChannelsDrawer, setShowChannelsDrawer] = useState(false)
  const [isCinema, setIsCinema] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(() => {
    if (isInHost()) {
      const live = useLive.getState()
      // Do not auto-play audio/video if the game is not running or not focused
      if (!live.telemetry || !live.gameFocused) return false
    }
    return true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  // Reset auto-hide timer for OSD controls
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
    }, 2800)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
      }
    }
  }, [isCinema, resetHideTimer])

  // Play / Pause video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isPlaying])

  // Pause stream when user tabs away from game, vehicle stops, or game is paused/not running; resume when back in focus
  useEffect(() => {
    if (!isInHost()) return
    return useLive.subscribe((live, before) => {
      const away = ((live.telemetry?.paused ?? false) && !live.menuGone) || !live.gameFocused || !live.telemetry
      const wasAway = ((before.telemetry?.paused ?? false) && !before.menuGone) || !before.gameFocused || !before.telemetry

      const isStopped = live.telemetry ? (!live.telemetry.engineEnabled || !live.telemetry.electricEnabled) : false
      const wasStopped = before.telemetry ? (!before.telemetry.engineEnabled || !before.telemetry.electricEnabled) : false

      const video = videoRef.current
      if (!video) return

      // Stop playback when the truck engine or electrics are turned off
      if (isStopped && !wasStopped) {
        video.pause()
        setIsPlaying(false)
        return
      }

      if (away === wasAway) return
      if (away) {
        video.pause()
      } else if (isPlaying && !isStopped) {
        video.play().catch(() => {})
      }
    })
  }, [isPlaying])

  // Sync mute state
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.muted = isMuted
    }
  }, [isMuted])

  // Initialize and load HLS stream whenever selectedChannel changes
  useEffect(() => {
    const video = videoRef.current
    setStreamError(null)
    setIsLoading(true)

    // Destroy existing Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!selectedChannel.streamUrl) {
      setIsLoading(false)
      return
    }

    const streamUrl = selectedChannel.streamUrl

    if (Hls.isSupported()) {
      const hls = new Hls({
        capLevelToPlayerSize: true,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        backBufferLength: 0,
        maxBufferSize: 6 * 1024 * 1024,
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: 0,
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 3,
      })
      hlsRef.current = hls

      hls.loadSource(streamUrl)
      if (video) {
        hls.attachMedia(video)
      }

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false)
        // Cap max level to 720p/480p for fluid, stutter-free performance inside the game
        let maxAllowedLevel = -1
        let preferredLevel = -1
        hls.levels.forEach((lvl, idx) => {
          const isLowRes = lvl.height > 0 ? lvl.height <= 720 : lvl.bitrate <= 3_500_000
          if (isLowRes) {
            maxAllowedLevel = idx
            if ((lvl.height > 0 && lvl.height <= 540) || lvl.bitrate <= 1_500_000) {
              preferredLevel = idx
            }
          }
        })
        if (maxAllowedLevel === -1 && hls.levels.length > 0) {
          maxAllowedLevel = 0
          preferredLevel = 0
        }
        if (maxAllowedLevel >= 0) {
          hls.autoLevelCapping = maxAllowedLevel
          hls.currentLevel = preferredLevel >= 0 ? preferredLevel : maxAllowedLevel
        }

        if (video && isPlaying) {
          video.play().catch(() => {
            if (video) {
              video.muted = true
              setIsMuted(true)
              video.play().catch(() => {})
            }
          })
        }
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[TVApp] Network error, recovering...', data)
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[TVApp] Media error, recovering...', data)
              hls.recoverMediaError()
              break
            default:
              console.error('[TVApp] Unrecoverable error:', data)
              setStreamError('Yayın akışı geçici olarak yüklenemedi.')
              setIsLoading(false)
              hls.destroy()
              break
          }
        }
      })
    } else if (video && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false)
        if (isPlaying) video.play().catch(() => {})
      })
      video.addEventListener('error', () => {
        setStreamError('Yayın yüklenemedi.')
        setIsLoading(false)
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [selectedChannel])

  // Filter channels based on active category
  const filteredChannels = useMemo(() => {
    if (activeCategory === 'Tümü') return channels
    return channels.filter((c) => c.category === activeCategory)
  }, [channels, activeCategory])

  const handleAddCustomStream = (e: React.FormEvent) => {
    e.preventDefault()
    const input = customInput.trim()
    if (!input) return

    const title = customTitle.trim() || `Özel Kanal #${channels.length + 1}`
    const ytMatch = input.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
    )

    const newChan: Channel = {
      id: `custom-${Date.now()}`,
      name: title,
      category: 'Ulusal',
      subtitle: ytMatch ? 'YouTube Canlı' : 'Özel HLS Akışı',
      streamUrl: ytMatch ? undefined : input,
      youtubeId: ytMatch ? ytMatch[1] : undefined,
      badgeColor: '#e67e22',
    }

    setChannels((prev) => [newChan, ...prev])
    setSelectedChannel(newChan)
    setCustomInput('')
    setCustomTitle('')
    setShowCustomModal(false)
    setShowChannelsDrawer(false)
  }

  const handleNextChannel = () => {
    const currIdx = channels.findIndex((c) => c.id === selectedChannel.id)
    const nextIdx = (currIdx + 1) % channels.length
    setSelectedChannel(channels[nextIdx])
  }

  const handlePrevChannel = () => {
    const currIdx = channels.findIndex((c) => c.id === selectedChannel.id)
    const prevIdx = (currIdx - 1 + channels.length) % channels.length
    setSelectedChannel(channels[prevIdx])
  }

  return (
    <section
      className={`app-panel tv-app ${isCinema ? 'tv-cinema-mode' : ''}`}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Top Header */}
      <header className={`tv-header ${!controlsVisible && isCinema ? 'tv-hidden' : ''}`}>
        <div className="tv-header-left">
          <div className="tv-badge-live">
            <span className="live-dot" />
            {text.tvApp.live}
          </div>
          <span className="tv-title">{selectedChannel.name}</span>
          <span className="tv-chan-sub-badge">{selectedChannel.subtitle}</span>
        </div>

        <div className="tv-header-actions">
          <button
            type="button"
            className={`tv-action-btn ${showChannelsDrawer ? 'active' : ''}`}
            onClick={() => setShowChannelsDrawer((v) => !v)}
            title="Kanal Listesini Aç / Kapat"
          >
            📺 Kanallar ({channels.length})
          </button>
          <button
            type="button"
            className="tv-action-btn"
            onClick={() => setShowCustomModal(true)}
            title={text.tvApp.customStream}
          >
            ➕ URL
          </button>
          <button
            type="button"
            className={`tv-action-btn tv-cinema-btn ${isCinema ? 'active' : ''}`}
            onClick={() => setIsCinema((prev) => !prev)}
            title={isCinema ? text.tvApp.exitFullscreen : text.tvApp.cinemaMode}
          >
            {isCinema ? '⏹️ Çıkış' : '🎬 Tam Ekran'}
          </button>
        </div>
      </header>

      {/* Main Player Container */}
      <div className="tv-main-layout">
        {/* Channel Drawer / List */}
        {showChannelsDrawer && (
          <aside className="tv-channels-drawer">
            <div className="tv-drawer-top">
              <span>{text.tvApp.channels}</span>
              <button
                type="button"
                className="tv-drawer-close"
                onClick={() => setShowChannelsDrawer(false)}
              >
                ✕
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="tv-category-bar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tv-category-pill ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Channels List */}
            <div className="tv-channel-list">
              {filteredChannels.map((chan) => {
                const isActive = selectedChannel.id === chan.id
                const globalIndex = channels.findIndex((c) => c.id === chan.id) + 1
                return (
                  <button
                    key={chan.id}
                    type="button"
                    className={`tv-channel-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedChannel(chan)
                      setIsPlaying(true)
                      setShowChannelsDrawer(false)
                    }}
                  >
                    <div
                      className="tv-chan-badge"
                      style={{ backgroundColor: chan.badgeColor }}
                    >
                      {globalIndex}
                    </div>
                    <div className="tv-chan-info">
                      <div className="tv-chan-name">{chan.name}</div>
                      <div className="tv-chan-sub">{chan.subtitle}</div>
                    </div>
                    {isActive && (
                      <div className="tv-chan-active-wave">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>
        )}

        {/* Video Player Stage */}
        <main
          className="tv-player-stage"
          onDoubleClick={() => setIsCinema((prev) => !prev)}
        >
          {/* Native HTML5 Video Element for HLS Broadcast Streams */}
          <video
            ref={videoRef}
            className={`tv-video ${selectedChannel.youtubeId ? 'tv-hidden-video' : ''}`}
            playsInline
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
          />

          {/* YouTube Embed Fallback (only for user-added YouTube links) */}
          {selectedChannel.youtubeId && (
            <div className="tv-iframe-container">
              <iframe
                title={selectedChannel.name}
                src={`https://www.youtube-nocookie.com/embed/${selectedChannel.youtubeId}?autoplay=${
                  isPlaying ? 1 : 0
                }&mute=${isMuted ? 1 : 0}&controls=1&modestbranding=1&rel=0`}
                className="tv-iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* Buffering Indicator */}
          {isLoading && !streamError && (
            <div className="tv-buffering-overlay">
              <div className="tv-spinner" />
              <span>Yayın Bağlanıyor...</span>
            </div>
          )}

          {/* Error Overlay */}
          {streamError && (
            <div className="tv-error-overlay">
              <div className="tv-error-icon">⚠️</div>
              <div className="tv-error-msg">{streamError}</div>
              <button
                type="button"
                className="tv-retry-btn"
                onClick={() => {
                  setStreamError(null)
                  setIsLoading(true)
                  if (hlsRef.current && selectedChannel.streamUrl) {
                    hlsRef.current.loadSource(selectedChannel.streamUrl)
                    if (videoRef.current) hlsRef.current.attachMedia(videoRef.current)
                  }
                }}
              >
                Yeniden Dene
              </button>
            </div>
          )}

          {/* OSD Floating Controls (Auto-Hides, positioned cleanly at the bottom) */}
          <div className={`tv-osd-controls ${!controlsVisible ? 'tv-hidden' : ''}`}>
            <div className="tv-osd-info">
              <span className="tv-osd-channel-num">
                CH {channels.findIndex((c) => c.id === selectedChannel.id) + 1}
              </span>
              <span className="tv-osd-channel-name">{selectedChannel.name}</span>
            </div>

            <div className="tv-osd-buttons">
              <button
                type="button"
                className="tv-osd-btn"
                onClick={handlePrevChannel}
                title="Önceki Kanal"
              >
                ⏮️
              </button>

              <button
                type="button"
                className="tv-osd-btn tv-osd-play"
                onClick={() => setIsPlaying((p) => !p)}
                title={isPlaying ? text.tvApp.pause : text.tvApp.play}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

              <button
                type="button"
                className="tv-osd-btn"
                onClick={handleNextChannel}
                title="Sonraki Kanal"
              >
                ⏭️
              </button>

              <button
                type="button"
                className="tv-osd-btn"
                onClick={() => setIsMuted((m) => !m)}
                title={isMuted ? text.tvApp.unmute : text.tvApp.mute}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>

              <button
                type="button"
                className="tv-osd-btn tv-osd-cinema"
                onClick={() => setIsCinema((c) => !c)}
                title={isCinema ? text.tvApp.exitFullscreen : text.tvApp.cinemaMode}
              >
                {isCinema ? '🗗' : '⛶'}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Custom Stream Input Modal */}
      {showCustomModal && (
        <div className="tv-modal-backdrop" onClick={() => setShowCustomModal(false)}>
          <div className="tv-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{text.tvApp.customStream}</h3>
            <p>Doğrudan canlı yayın URL'si (.m3u8) veya YouTube canlı linki ekleyin:</p>
            <form onSubmit={handleAddCustomStream}>
              <div className="tv-form-group">
                <label>Kanal Adı</label>
                <input
                  type="text"
                  className="tv-input"
                  placeholder="Örn: Özel TV HD"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>

              <div className="tv-form-group">
                <label>Yayın URL'si (.m3u8 veya YouTube linki)</label>
                <input
                  type="text"
                  className="tv-input"
                  placeholder="https://.../master.m3u8"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="tv-modal-actions">
                <button
                  type="button"
                  className="tv-modal-cancel"
                  onClick={() => setShowCustomModal(false)}
                >
                  İptal
                </button>
                <button type="submit" className="tv-modal-submit">
                  Yayını Başlat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
