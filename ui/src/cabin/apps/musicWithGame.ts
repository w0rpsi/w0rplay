import { type LiveState, useLive } from '../state/store'
import { fadeOutAndPause, playAndFadeIn } from './fade'
import { withGame } from './youtube/withGame'

/**
 * A music app with the game (YouTube, Spotify, Apple Music, YouTube Music; the rule: youtube/withGame.ts):
 * the music playing here fades out and pauses while the player is away from the game (it's paused, or tabbed
 * out of) and plays on fading in as they come back, only if it was W0RPLAY that paused it; it stops at once
 * as the truck's electrics go off, and nothing plays while they're off. Music playing elsewhere (Spotify on a
 * phone) is left as it is.
 */
export interface MusicPlayer {
  /** Its name: one fade at a time for each (fade.ts). */
  name: string
  /** Whether music plays here now. */
  playingHere(): boolean
  pauseHere(): void
  resumeHere(): void
  /** The volume it plays at here (0 to 1), as the player chose it; `null` if there's none to set. */
  volume(): number | null
  /** Sets the volume it plays at (0 to 1) without making it the player's choice: for a fade. */
  sendVolume(share: number): void
  /** Sets the volume it plays at (0 to 1) as the player's choice, as its own slider does: a keybind. */
  setVolume(share: number): void
  /** Called whenever the app's music changes: `started` when it just began playing here. */
  subscribe(changed: (started: boolean) => void): () => void
}

/** Away: tabbed out, or the game paused with its menu up (its menu gone, it's about to run: back, owner
 * 2026-10-21; the game itself says it runs some 1.5 s later). */
function isAway(live: LiveState): boolean {
  return ((live.telemetry?.paused ?? false) && !live.menuGone) || !live.gameFocused
}

/** Pauses `player` with the game menu/alt-tab or when vehicle stops/engine turns off. Returns the function that stops it. */
export function pauseMusicWithGame(player: MusicPlayer): () => void {
  let paused = false
  const game = useLive.subscribe((live, before) => {
    // When the truck engine is stopped or electrics are turned off, pause the music immediately
    const isEngineOff = live.telemetry ? !live.telemetry.engineEnabled : false
    const wasEngineOff = before.telemetry ? !before.telemetry.engineEnabled : false
    const isElectricOff = live.telemetry ? !live.telemetry.electricEnabled : false
    const wasElectricOff = before.telemetry ? !before.telemetry.electricEnabled : false

    if ((isEngineOff && !wasEngineOff) || (isElectricOff && !wasElectricOff)) {
      if (player.playingHere()) {
        fadeOutAndPause(player)
        paused = false
      }
    }

    const away = isAway(live)
    const wasAway = isAway(before)
    if (away === wasAway) return
    const action = withGame(away, wasAway, player.playingHere(), paused, true)
    if (action === 'pause') {
      fadeOutAndPause(player)
      paused = true
    } else if (action === 'play') {
      playAndFadeIn(player)
    }
    if (!away) paused = false
  })
  return () => {
    game()
  }
}
