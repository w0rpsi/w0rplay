import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { useAskOnce, useSignedIn } from './accounts'
import { call, PREVIEW_TUTORIAL } from './bridge'
import { Onboarding } from './onboarding/Onboarding'
import { languageOf, wordsFor } from './onboarding/words'
import { About } from './pages/About'
import { useHeldKey } from './pages/heldKey'
import { Lesson, TouchLayer } from './pages/Lesson'
import { Launch, TourCard } from './pages/Tour'
import { Accounts } from './pages/Accounts'
import { Controls } from './pages/Controls'
import { Customize } from './pages/Customize'
import { useMapProgress } from './mapProgress'
import { MapPage } from './pages/MapPage'
import { screenState } from './pages/page'
import { ScreenPage } from './pages/ScreenPage'
import { Setup } from './pages/Setup'
import { UninstallSheet } from './pages/UninstallSheet'
import { FinishUpdate, UpdateSheet } from './pages/UpdateSheet'
import { type CompanionWords, companionWords, type SectionId } from './pages/words'
import { RoomText, WordsContext } from './room/room'
import './room/room.css'
import { GLOW, type Screen, ScreenContext } from './room/screen'
import { type Banner, GlassCursor, type Pose, TruckScreen } from './room/TruckScreen'
import { useDemo } from './room/useDemo'
import './companion.css'
import { defaultMapAddress, type GameCheck, type SetupState, setupState } from './setup'
import { FILES_BASE, useCustomizations } from './customize'
import { type Offer, useUpdateOffer } from './update'
import { type HostStatus, useHostStatus } from './useHostStatus'
import { DEFAULT_KEY, type SettingsState, useSettings } from './useSettings'

/**
 * The companion window: its onboarding on the first run (until it's gone through), then the room it ends in.
 * The truck's screen stays in its dark room, turned aside at the right, the live W0RPLAY on it; the
 * sections are a list at the left, each with what it is now; the page in between. Each section shows on the
 * screen what it's about (its app, its banner, the cursor using it), as the onboarding's steps did.
 */
export function Companion() {
  const status = useHostStatus()
  const settings = useSettings()
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  // After the onboarding, its tutorial (from its start, or skipped to its end), before setup's finished.
  const [tutorial, setTutorial] = useState<'lesson' | 'launch' | null>(PREVIEW_TUTORIAL)
  useEffect(() => {
    setupState()
      .then(setSetup)
      .catch((e: unknown) => setSetupError(String(e)))
  }, [])
  useShowWhenReady(setup !== null || setupError !== null)

  if (!setup) return <div className="cp-blank">{setupError ?? ''}</div>
  if (!setup.finished && !tutorial) {
    // The onboarding set the game up: what's set up is read again (the companion read it before), then its
    // tutorial.
    const onboarded = (start: 'lesson' | 'launch') => {
      setupState()
        .then(setSetup, () => {})
        .finally(() => setTutorial(start))
    }
    return <Onboarding initial={setup} status={status} settings={settings} onFinished={onboarded} />
  }
  return (
    <Room
      setup={setup}
      status={status}
      settings={settings}
      tutorial={tutorial}
      tutorialDone={() => {
        setTutorial(null)
        setupState().then(setSetup, () => setSetup({ ...setup, finished: true }))
      }}
    />
  )
}

const SECTIONS: SectionId[][] = [
  ['screen', 'controls', 'customize'],
  ['accounts', 'map'],
  ['setup', 'about'],
]
/** The sections in order: the tutorial's tour goes through them. */
const TOUR = SECTIONS.flat()

/** The room as it is: the tutorial's lesson (the screen full size), its tour of the sections, its end
 * (what to do in the game), or the companion. */
type Phase = 'lesson' | 'tour' | 'launch' | 'room'

/** Where the screen stands in each. */
const POSE: Record<Phase, Pose> = { lesson: 'full', tour: 'aside', launch: 'final', room: 'aside' }

/** The light the screen casts while each section is up. */
const SECTION_GLOW: Record<SectionId, string> = {
  screen: GLOW.home,
  controls: GLOW.home,
  customize: GLOW.home,
  accounts: GLOW.youtube,
  map: GLOW.maps,
  setup: GLOW.scan,
  about: GLOW.dashboard,
}

/** How long a page's words take to leave before the next one's arrive. */
const LEAVE_MS = 220
/** The screen coming out of the onboarding's dive into its place (companion.css `.cp .ts`). */
const ARRIVE_MS = 1300

function Room({
  setup,
  status,
  settings,
  tutorial = null,
  tutorialDone,
}: {
  setup: SetupState
  status: HostStatus | null
  settings: SettingsState
  /** The tutorial, from where it starts; `null`: the companion. */
  tutorial?: 'lesson' | 'launch' | null
  tutorialDone?: () => void
}) {
  const [code] = useState(() => setup.language ?? languageOf(navigator.languages))
  const words = wordsFor(code)
  const cw = companionWords(code)
  const [section, setSection] = useState<SectionId>('screen')
  const [leaving, setLeaving] = useState(false)
  const [phase, setPhase] = useState<Phase>(tutorial ?? 'room')
  // The screen comes out of the dive the onboarding ended in, to where the phase has it.
  const [arrivedPose, setArrivedPose] = useState(false)
  const pose: Pose = arrivedPose ? POSE[phase] : 'dive'
  const interactionKey = settings.settings?.interaction.key ?? DEFAULT_KEY
  const held = useHeldKey(interactionKey, settings.settings?.interaction.mode ?? 'hold', phase === 'lesson')
  const demo = useDemo()
  const [powered, setPowered] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [scanning, setScanning] = useState(false)
  const [glow, setGlow] = useState(GLOW.home)
  const [cursor, setCursor] = useState<{ x: number; y: number; pressing: boolean } | null>(null)
  // What a check of the game found, for the pages that show it (Setup, Map): checked once, as they open.
  const [check, setCheck] = useState<GameCheck | null>(null)
  // Who's signed in, known at once (what was last known), and asked as the companion opens if never known.
  const signedIn = useSignedIn(status)
  useAskOnce()
  // The uninstall sheet over the room, and the room fading as W0RPLAY leaves.
  const [uninstalling, setUninstalling] = useState(false)
  const [leavingPc, setLeavingPc] = useState(false)
  // An update found, offered in its sheet once per version (Later puts it off; About opens it again).
  const update = useUpdateOffer()
  // The player's wallpapers and icon sets, for Customize and the room's screen.
  const { custom, refresh: refreshCustom } = useCustomizations()
  const [updateShown, setUpdateShown] = useState(false)
  const offered = useRef<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const arrived = useRef(performance.now() + ARRIVE_MS)

  // Next frame, so the dive is drawn before it moves on; a window not drawing (minimised) gets there anyway.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrivedPose(true))
    const timer = window.setTimeout(() => setArrivedPose(true), 150)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  const { send } = demo
  // The room's screen looks as the truck's does: the player's wallpaper and icons, as chosen.
  const look = settings.settings?.look
  useEffect(() => {
    if (!demo.ready || !custom) return
    send({
      type: 'looks',
      custom,
      base: FILES_BASE,
      wallpaper: look?.wallpaper ?? null,
      iconSet: look?.iconSet ?? null,
      iconStyle: look?.iconStyle ?? 'auto',
    })
  }, [demo.ready, custom, look?.wallpaper, look?.iconSet, look?.iconStyle, send])
  const lastGo = useRef<{ route: string; at: number } | null>(null)
  const screen: Screen = {
    send,
    go: (route) => {
      const now = performance.now()
      if (lastGo.current?.route === route && now - lastGo.current.at < 500) return
      lastGo.current = { route, at: now }
      send({ type: 'go', to: route })
    },
    locate: demo.locate,
    ready: demo.ready,
    banner: setBanner,
    scan: setScanning,
    glow: setGlow,
    cursor: setCursor,
    reboot: () => {
      send({ type: 'power', on: false })
      window.setTimeout(() => send({ type: 'power', on: true }), 450)
    },
    powered,
    leaving,
    settling: () => Math.max(0, arrived.current - performance.now()),
  }

  // On as soon as W0RPLAY in it is ready: it's been on all along (the player dove into it).
  useEffect(() => {
    if (!demo.ready || powered) return
    send({ type: 'power', on: true })
    setPowered(true)
  }, [demo.ready, powered, send])
  useEffect(() => {
    if (demo.ready) send({ type: 'language', code })
  }, [demo.ready, code, send])
  // The player's map, on the screen's Maps.
  const map = defaultMapAddress(status)
  const mapKey = map ? `${map.base}#${map.built}` : ''
  useEffect(() => {
    if (map) send({ type: 'map', base: map.base, built: map.built })
    // Keyed by the map's address and build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, demo.ready, send])

  const open = (next: SectionId) => {
    if (next === section || leaving) return
    setLeaving(true)
    window.setTimeout(() => {
      setSection(next)
      setLeaving(false)
    }, LEAVE_MS)
  }

  const tilt = (event: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect()
    if (!box) return
    root.current?.style.setProperty('--tilt-x', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    root.current?.style.setProperty('--tilt-y', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  }

  const nextInTour = () => {
    const at = TOUR.indexOf(section)
    if (at === TOUR.length - 1) setPhase('launch')
    else open(TOUR[at + 1])
  }
  const roomShown = phase === 'tour' || phase === 'room'
  useEffect(() => {
    if (!update || phase !== 'room' || offered.current === update.version) return
    offered.current = update.version
    setUpdateShown(true)
  }, [update, phase])

  // The maps being prepared, worked out once: the Map page's bar and the sidebar show the same.
  const mapProgress = useMapProgress(status)
  const page = {
    status,
    settings,
    setup,
    cw,
    check,
    mapProgress,
    checked: setCheck,
    signedIn,
    uninstall: () => setUninstalling(true),
    update,
    showUpdate: () => setUpdateShown(true),
    custom,
    refreshCustom,
    tutorial: () => setPhase('lesson'),
  }
  return (
    <div
      ref={root}
      className="ob cp"
      lang={words.locale}
      data-power={powered || undefined}
      data-leaving-pc={leavingPc || undefined}
      data-phase={phase}
      style={{ '--section-glow': SECTION_GLOW[section] } as CSSProperties}
      onPointerMove={tilt}
    >
      <TruckScreen frame={demo.frame} ready={demo.ready} pose={pose} glow={glow} banner={banner} scanning={scanning}>
        <GlassCursor
          x={cursor?.x ?? 640}
          y={cursor?.y ?? 420}
          pressing={cursor?.pressing ?? false}
          visible={cursor !== null}
        />
        {phase === 'lesson' && <TouchLayer active={held} press={(at) => send({ type: 'press', ...at })} />}
      </TruckScreen>
      <WordsContext.Provider value={{ words, code }}>
        <RoomText.Provider value={{ locale: words.locale, back: words.back }}>
          <ScreenContext.Provider value={screen}>
            {phase === 'lesson' && (
              <Lesson
                cw={cw}
                interactionKey={interactionKey}
                held={held}
                route={demo.route}
                next={() => {
                  open('screen')
                  setPhase('tour')
                }}
              />
            )}
            {phase === 'launch' && (
              <Launch
                done={() => {
                  setPhase('room')
                  tutorialDone?.()
                }}
              />
            )}
            {roomShown && (
              <Sidebar
                section={section}
                open={open}
                cw={cw}
                status={status}
                update={update}
              />
            )}
            {roomShown && section === 'screen' && <ScreenPage {...page} />}
            {roomShown && section === 'controls' && <Controls {...page} />}
            {roomShown && section === 'customize' && <Customize {...page} />}
            {roomShown && section === 'accounts' && <Accounts {...page} />}
            {roomShown && section === 'map' && <MapPage {...page} />}
            {roomShown && section === 'setup' && <Setup {...page} />}
            {roomShown && section === 'about' && <About {...page} />}
            {phase === 'tour' && (
              <TourCard cw={cw} section={section} last={section === TOUR[TOUR.length - 1]} next={nextInTour} />
            )}
            {uninstalling && (
              <UninstallSheet cw={cw} close={() => setUninstalling(false)} farewell={() => setLeavingPc(true)} />
            )}
            {updateShown && update && !uninstalling && (
              <UpdateSheet cw={cw} offer={update} close={() => setUpdateShown(false)} />
            )}
            {phase === 'room' && <FinishUpdate cw={cw} setup={setup} />}
          </ScreenContext.Provider>
        </RoomText.Provider>
      </WordsContext.Provider>
    </div>
  )
}

function ScreenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}

function ControlsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" x2="10" y1="12" y2="12" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="15" x2="15.01" y1="13" y2="13" />
      <line x1="18" x2="18.01" y1="11" y2="11" />
      <rect width="20" height="12" x="2" y="6" rx="6" />
    </svg>
  )
}

function CustomizeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.562C22 6.5 17.5 2 12 2z" />
    </svg>
  )
}

function AccountsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" x2="9" y1="3" y2="18" />
      <line x1="15" x2="15" y1="6" y2="21" />
    </svg>
  )
}

function SetupIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function AboutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="16" y2="12" />
      <line x1="12" x2="12.01" y1="8" y2="8" />
    </svg>
  )
}

const SIDEBAR_ICONS: Record<SectionId, () => ReactNode> = {
  screen: ScreenIcon,
  controls: ControlsIcon,
  customize: CustomizeIcon,
  accounts: AccountsIcon,
  map: MapIcon,
  setup: SetupIcon,
  about: AboutIcon,
}

function Sidebar({
  section,
  open,
  cw,
  status,
  update,
}: {
  section: SectionId
  open(section: SectionId): void
  cw: CompanionWords
  status: HostStatus | null
  update: Offer | null
}) {
  const state = screenState(status)

  return (
    <aside className="cp-sidebar" aria-label="W0RPLAY">
      <header className="cp-sidebar-brand">
        <img src="/w0rplay.png" alt="W0RPLAY" className="cp-sidebar-logo" />
        <div className="cp-sidebar-brand-meta">
          <div className="cp-sidebar-brand-title">
            <b>W<span className="w0-slash">0</span>RPLAY</b>
            <span className="cp-sidebar-serial">1b267</span>
          </div>
          <span className="cp-sidebar-brand-sub">In-Cab Infotainment</span>
        </div>
      </header>

      <nav className="cp-sidebar-nav" aria-label="Bölümler">
        {TOUR.map((id) => {
          const isActive = id === section
          const Icon = SIDEBAR_ICONS[id]
          return (
            <button
              key={id}
              type="button"
              className="cp-sidebar-row"
              data-active={isActive || undefined}
              data-section={id}
              onClick={() => open(id)}
            >
              <span className="cp-row-icon">
                <Icon />
              </span>
              <span className="cp-row-label">{cw.sections[id]}</span>
              {id === 'about' && update && <span className="cp-row-dot" />}
            </button>
          )
        })}
      </nav>

      <footer className="cp-sidebar-footer">
        <div className="cp-sidebar-status" data-state={state} title={cw.state[state]}>
          <i className="cp-status-dot" />
          <span className="cp-status-text">{cw.state[state]}</span>
        </div>
        <div className="cp-sidebar-fps" title="Sabit 30 FPS Optimizasyonu">
          30 FPS
        </div>
      </footer>
    </aside>
  )
}


/** The window starts hidden (so it never shows blank while this page loads): it shows once `ready`, after the
 * page has painted. */
function useShowWhenReady(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    // Two frames: the first screen is laid out, then painted.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        call('companion_ready').catch((error: unknown) => console.error('The window could not be shown', error))
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [ready])
}
