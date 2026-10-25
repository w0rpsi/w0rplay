import type { ScreenLayoutId } from './screen'

/**
 * The truck brands' own screen strips that stay on screen around CarPlay (Glass style).
 * In W0RPLAY, edge-to-edge full screen is enforced so the game's stock screen never peeks through.
 */
export type OemStripId = 'daf-2021' | 'scania-2025'

/** How much of the screen's left and bottom edge a strip takes (on the 1280x720 canvas). */
export interface OemStripInsets {
  left: number
  bottom: number
}

export interface OemStrip {
  name: string
  insets: OemStripInsets
}

/** Insets from each layout's stock map area; CarPlay takes the full screen (0 insets). */
export const OEM_STRIPS: Record<OemStripId, OemStrip> = {
  'daf-2021': { name: 'DAF 2021', insets: { left: 0, bottom: 0 } },
  'scania-2025': { name: 'Scania Smart Dash', insets: { left: 0, bottom: 0 } },
}

export const NO_INSETS: OemStripInsets = { left: 0, bottom: 0 }

export const STRIP_OVERLAP = 0

export function frameInsets(_insets: OemStripInsets, _layout: ScreenLayoutId | null): OemStripInsets {
  return NO_INSETS
}

/** `auto` keeps the truck's strip; `off` gives CarPlay the whole screen. */
export type OemMode = 'auto' | 'off'

/** Always return null so CarPlay renders 100% full screen edge-to-edge without any stock game cutouts. */
export function resolveOemStrip(_mode: OemMode, _profileStrip: OemStripId | null): OemStripId | null {
  return null
}
