import { useEffect, useState } from 'react'
import { isInHost, postToHost } from '../shared/host'
import { appleMusicPlayer, pauseAppleMusicWithGame } from './apps/music/pauseWithGame'
import { keybinds } from './apps/keybinds'
import { oneAtATime } from './apps/oneAtATime'
import { pauseSpotifyWithGame, spotifyPlayer } from './apps/spotify/pauseWithGame'
import { pauseYouTubeWithGame, youtubePlayer } from './apps/youtube/pauseWithGame'
import { pauseYouTubeMusicWithGame, youtubeMusicPlayer } from './apps/youtubeMusic/pauseWithGame'
import { AppScreen } from './apps/AppScreen'
import { BootScreen } from './boot/BootScreen'
import { Dashboard } from './dashboard/Dashboard'
import { Home } from './home/Home'
import { followTruckersMp } from './maps/truckersmp'
import { routeClicksDuringTransitions } from './shell/clickThrough'
import { installDragScroll } from './shell/dragScroll'
import { Cursor } from './shell/Cursor'
import { Shell } from './shell/Shell'
import { showVolume } from './shell/volumeShown'
import { type Route, routeKey } from './state/navigation'
import { nextPhaseAt, type PowerPhase } from './state/power'
import { connectHost, useCabin, useLive } from './state/store'
import { languageOf } from './state/strings'
import { followTimeZone } from './state/timeZone'

/**
 * Plain browser previews have no truck to power the screen; they show it as if the electrics were on.
 * `?power` simulates the real sequence there too (drive it with `useCabin.getState().powerEvent`).
 */
// Keep CarPlay screen powered on even when truck is stopped or ignition is turned off
const FOLLOW_POWER = false

/** The in-cabin screen: the shell around the screen for the current route, after the boot sequence. */
export function CabinApp() {
  const route = useCabin((state) => state.navigation.route)
  const phase = useCabin((state) => state.power.phase)
  useEffect(() => connectHost(), [])
  // YouTube, Spotify, Apple Music and YouTube Music pause with the game (its menu, tabbing out) and play on after.
  useEffect(() => pauseYouTubeWithGame(), [])
  useEffect(() => pauseSpotifyWithGame(), [])
  useEffect(() => pauseAppleMusicWithGame(), [])
  useEffect(() => pauseYouTubeMusicWithGame(), [])
  // One of them at a time: the newest to start plays on, the others pause (apps/oneAtATime.ts).
  useEffect(() => oneAtATime([youtubePlayer, spotifyPlayer, appleMusicPlayer, youtubeMusicPlayer]), [])
  // The player's keybinds pressed in the game: the music's volume, or play/pause (apps/keybinds.ts).
  useEffect(() => followKeybinds(), [])
  // The clock where the truck is: its country's time zone, as the game's own clock (state/timeZone.ts).
  useEffect(() => followTimeZone(), [])
  // TruckersMP: its other players, read while the game runs under it (the map's dots, a route's traffic).
  useEffect(() => followTruckersMp(), [])
  useEffect(() => routeClicksDuringTransitions(), [])
  // Lists follow a drag, as on a touch screen (the cab has a mouse).
  useEffect(() => installDragScroll(), [])
  // The page's language, so text set in capitals follows its rules (Turkish: i to İ, not I).
  const language = languageOf(useLive((state) => state.gameLanguage))
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  usePowerClock()
  const entering = usePowerOnEntry(phase)
  // For the host's startup log: when each boot screen comes up.
  useEffect(() => postToHost({ type: 'startup', stage: `power ${phase}` }), [phase])

  const powered = !FOLLOW_POWER || phase === 'on'
  useRenderHeartbeat(powered)

  return (
    <Shell
      entering={entering}
      overlay={
        <>
          {FOLLOW_POWER && phase !== 'on' && <BootScreen phase={phase} />}
          {/* In a plain browser the system cursor is there already. */}
          {isInHost() && <Cursor />}
        </>
      }
    >
      {/* The screen mounts when the power is on, and fades in after the boot. */}
      {powered && <Screens route={route} />}
    </Shell>
  )
}

/** Acts on each keybind pressed in the game, for the cab's players, showing a volume it sets. Returns the
 * function that stops it. */
function followKeybinds(): () => void {
  const binds = keybinds([youtubePlayer, spotifyPlayer, appleMusicPlayer, youtubeMusicPlayer])
  const stop = useLive.subscribe((live, before) => {
    if (!live.keybind || live.keybind.count === before.keybind?.count) return
    const shown = binds.press(live.keybind.action)
    if (shown) showVolume(shown.volume)
  })
  return () => {
    stop()
    binds.stop()
  }
}

/** Must match --motion-duration in shell.css: how long the first screen takes to fade in. */
const ENTRY_MS = 650

/** True for the first moments after the power sequence ends, while the first screen fades in. */
function usePowerOnEntry(phase: PowerPhase): boolean {
  const [entering, setEntering] = useState(false)
  // Adjusting state during render: the phase is a prop-like value this state follows.
  const [lastPhase, setLastPhase] = useState(phase)
  if (phase !== lastPhase) {
    setLastPhase(phase)
    if (phase === 'on') setEntering(true)
  }
  useEffect(() => {
    if (!entering) return
    const timer = setTimeout(() => setEntering(false), ENTRY_MS)
    return () => clearTimeout(timer)
  }, [entering])
  return entering
}

/** Advances timed power phases (splash, connecting) when their time is up. A timer may fire a little early
 * (browsers round its delay down to whole milliseconds), so its tick says the moment it was set for, at the
 * earliest: a tick that didn't advance the phase would leave it there, with no timer left to try again. */
function usePowerClock() {
  const power = useCabin((state) => state.power)
  const powerEvent = useCabin((state) => state.powerEvent)
  useEffect(() => {
    const due = nextPhaseAt(power)
    if (due === null) return
    const wait = Math.ceil(Math.max(0, due - performance.now()))
    const timer = setTimeout(() => powerEvent({ type: 'tick', at: Math.max(performance.now(), due) }), wait)
    return () => clearTimeout(timer)
  }, [power, powerEvent])
}

/** Must match --switch-duration in shell/transitions.css. */
const SWITCH_MS = 420

/**
 * The screen for the route. Home and the Dashboard trade places live: the old one stays a moment, moving
 * and fading out while the new one comes in (shell/transitions.css). Any other change swaps at once; app
 * launches are animated by View Transitions (state/launch.ts). A press during a switch starts the next one
 * from wherever things are.
 */
function Screens({ route }: { route: Route }) {
  const [shown, setShown] = useState(route)
  const [leaving, setLeaving] = useState<{ route: Route; to: 'home' | 'dashboard' } | null>(null)

  // Adjusting state during render: the shown screen follows the route.
  if (routeKey(route) !== routeKey(shown)) {
    const betweenBases = shown.kind !== 'app' && route.kind !== 'app'
    setLeaving(betweenBases ? { route: shown, to: route.kind as 'home' | 'dashboard' } : null)
    setShown(route)
  }

  // The switch ends when its animation does: it starts on the first frame after the change, which a busy
  // page draws late (the Dashboard starting its map), so a timer from the change would cut it off before
  // its end. The timer is there only for an animation that never runs.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), SWITCH_MS * 3)
    return () => clearTimeout(timer)
  }, [leaving])

  const switching = leaving ? ` to-${leaving.to}` : ''
  return (
    <>
      {leaving && (
        <div key={`out:${routeKey(leaving.route)}`} className={`screen-slot leaving${switching}`} aria-hidden>
          <RouteScreen route={leaving.route} />
        </div>
      )}
      <div
        key={routeKey(shown)}
        className={leaving ? `screen-slot entering${switching}` : 'screen-slot'}
        // Its own animation, not one of its icons' (theirs bubble up here too).
        onAnimationEnd={(event) => {
          if (leaving && event.target === event.currentTarget) setLeaving(null)
        }}
      >
        <RouteScreen route={shown} />
      </div>
    </>
  )
}

/** The screen of one route. */
function RouteScreen({ route }: { route: Route }) {
  switch (route.kind) {
    case 'home':
      return <Home />
    case 'dashboard':
      return <Dashboard />
    case 'app':
      return <AppScreen app={route.app} />
  }
}

/**
 * Rock-solid render heartbeat for the in-cabin infotainment screen.
 * Maintains a guaranteed, smooth 30 FPS baseline at all times (so the truck screen
 * never freezes or drops to 0-3 FPS while driving), and boosts to 60 FPS during
 * active user interaction (drag, clicks).
 */
function useRenderHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isInHost()) return
    let animId: number
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvas.style.position = 'fixed'
    canvas.style.bottom = '0'
    canvas.style.right = '0'
    canvas.style.width = '2px'
    canvas.style.height = '2px'
    canvas.style.opacity = '0.04'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '999999'
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d', { alpha: true })

    let highFpsUntil = 0
    let lastTick = 0
    let flip = false

    const boost = (ms = 1500) => {
      highFpsUntil = Math.max(highFpsUntil, performance.now() + ms)
    }

    // Boost to 60 FPS whenever there is pointer activity, clicks, or keypresses
    const onActivity = () => boost(1500)
    window.addEventListener('pointermove', onActivity, { passive: true })
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })

    const renderPixel = () => {
      if (ctx) {
        flip = !flip
        ctx.fillStyle = flip ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
        ctx.fillRect(0, 0, 2, 2)
      }
    }

    const tick = (now: number) => {
      // 60 FPS (16.6ms) during interaction, rock-solid 30 FPS (33.3ms) minimum always
      const targetInterval = now < highFpsUntil ? 16 : 33
      if (now - lastTick >= targetInterval) {
        lastTick = now
        renderPixel()
      }
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)

    // Fallback interval ensures compositor never stalls even if headless Chromium throttles rAF
    const fallbackInterval = setInterval(() => {
      const now = performance.now()
      if (now - lastTick >= 33) {
        lastTick = now
        renderPixel()
      }
    }, 33)

    return () => {
      cancelAnimationFrame(animId)
      clearInterval(fallbackInterval)
      window.removeEventListener('pointermove', onActivity)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      canvas.remove()
    }
  }, [enabled])
}
