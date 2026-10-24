import { type CustomWallpaper, fileUrl } from '../shared/customize'
import type { Appearance } from './state/appearance'

/**
 * Wallpapers by id: W0RPLAY's own here, and the player's (the companion's Customize, `customWallpaper`). Like
 * icons (icons.ts), the UI refers to wallpapers through this registry only.
 *
 * A wallpaper has a dark and a light variant: two pictures, or one picture for both (a player's own image).
 * Should one be missing, the other wins and the UI follows it (dark glass on a dark-only wallpaper).
 */
export interface Wallpaper {
  id: string
  name: string
  variants: Partial<Record<Appearance, string>>
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** A wallpaper of one colour, at the screen's size (a wallpaper's image declares its size: `prepareWallpaper`). */
function plain(colour: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="${colour}"/></svg>`
  return svgDataUrl(svg)
}

function carbonFiber(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <radialGradient id="cg" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="#1c2028" stop-opacity="0.85"/>
        <stop offset="65%" stop-color="#0a0b0e" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#020304" stop-opacity="1"/>
      </radialGradient>
      <pattern id="cp" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#0d0e12"/>
        <rect width="6" height="6" fill="#171920"/>
        <rect x="6" y="6" width="6" height="6" fill="#171920"/>
        <line x1="0" y1="0" x2="6" y2="6" stroke="#252934" stroke-width="0.8"/>
        <line x1="6" y1="6" x2="12" y2="12" stroke="#252934" stroke-width="0.8"/>
      </pattern>
    </defs>
    <rect width="1280" height="720" fill="url(#cp)"/>
    <rect width="1280" height="720" fill="url(#cg)"/>
  </svg>`
  return svgDataUrl(svg)
}

function cyberpunkNeon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="csky" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#07020e"/>
        <stop offset="55%" stop-color="#140524"/>
        <stop offset="78%" stop-color="#360846"/>
        <stop offset="100%" stop-color="#07000d"/>
      </linearGradient>
      <linearGradient id="cneon" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.6"/>
        <stop offset="50%" stop-color="#9b51e0" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#fe0979" stop-opacity="0.6"/>
      </linearGradient>
      <radialGradient id="csun" cx="50%" cy="66%" r="35%">
        <stop offset="0%" stop-color="#ff007f" stop-opacity="0.6"/>
        <stop offset="45%" stop-color="#7928ca" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#csky)"/>
    <rect width="1280" height="720" fill="url(#csun)"/>
    <line x1="0" y1="465" x2="1280" y2="465" stroke="url(#cneon)" stroke-width="2"/>
    <line x1="0" y1="480" x2="1280" y2="480" stroke="#00f2fe" stroke-opacity="0.35" stroke-width="1.5"/>
    <line x1="0" y1="515" x2="1280" y2="515" stroke="#00f2fe" stroke-opacity="0.25" stroke-width="1.5"/>
    <line x1="0" y1="570" x2="1280" y2="570" stroke="#00f2fe" stroke-opacity="0.2" stroke-width="1.5"/>
    <line x1="0" y1="650" x2="1280" y2="650" stroke="#00f2fe" stroke-opacity="0.15" stroke-width="1.5"/>
    <line x1="640" y1="465" x2="180" y2="720" stroke="#ff007f" stroke-opacity="0.3" stroke-width="1.5"/>
    <line x1="640" y1="465" x2="1100" y2="720" stroke="#ff007f" stroke-opacity="0.3" stroke-width="1.5"/>
    <line x1="640" y1="465" x2="460" y2="720" stroke="#00f2fe" stroke-opacity="0.35" stroke-width="1.5"/>
    <line x1="640" y1="465" x2="820" y2="720" stroke="#00f2fe" stroke-opacity="0.35" stroke-width="1.5"/>
  </svg>`
  return svgDataUrl(svg)
}

function midnightHorizon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="mbg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#02050e"/>
        <stop offset="50%" stop-color="#071024"/>
        <stop offset="72%" stop-color="#0f1c3b"/>
        <stop offset="100%" stop-color="#020409"/>
      </linearGradient>
      <radialGradient id="mhalo" cx="50%" cy="66%" r="42%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25"/>
        <stop offset="55%" stop-color="#0284c7" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#mbg)"/>
    <rect width="1280" height="720" fill="url(#mhalo)"/>
    <line x1="0" y1="475" x2="1280" y2="475" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1.2"/>
  </svg>`
  return svgDataUrl(svg)
}

function amoledStealth(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <radialGradient id="asg" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#141824" stop-opacity="0.6"/>
        <stop offset="70%" stop-color="#05070a" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="#000000"/>
    <rect width="1280" height="720" fill="url(#asg)"/>
  </svg>`
  return svgDataUrl(svg)
}

function nordicSunset(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="nsd" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0c1222"/>
        <stop offset="42%" stop-color="#2a225e"/>
        <stop offset="70%" stop-color="#6e2518"/>
        <stop offset="86%" stop-color="#d95414"/>
        <stop offset="100%" stop-color="#080b12"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#nsd)"/>
    <circle cx="640" cy="530" r="130" fill="#f97316" fill-opacity="0.25"/>
  </svg>`
  return svgDataUrl(svg)
}

/** W0RPLAY's built-in wallpapers: Silk, Carbon, Cyber Neon, Midnight Horizon, Nordic Sunset, AMOLED and Plain. */
export const BUILT_IN_WALLPAPERS: Wallpaper[] = [
  { id: 'silk', name: 'Silk', variants: { dark: '/wallpapers/silk.dark.jpg', light: '/wallpapers/silk.jpg' } },
  { id: 'carbon', name: 'Carbon Stealth', variants: { dark: carbonFiber() } },
  { id: 'cyberpunk', name: 'Cyber Neon', variants: { dark: cyberpunkNeon() } },
  { id: 'midnight', name: 'Midnight Horizon', variants: { dark: midnightHorizon() } },
  { id: 'sunset', name: 'Nordic Sunset', variants: { dark: nordicSunset() } },
  { id: 'amoled', name: 'AMOLED Pure', variants: { dark: amoledStealth() } },
  { id: 'plain', name: 'Plain', variants: { dark: plain('#0b0b0d'), light: plain('#eceef2') } },
]

export const DEFAULT_WALLPAPER_ID = BUILT_IN_WALLPAPERS[0].id

/** The wallpaper `id` names among `wallpapers`, or the default (one the player removed, say). */
export function findWallpaper(id: string, wallpapers: Wallpaper[]): Wallpaper {
  return (
    wallpapers.find((wallpaper) => wallpaper.id === id) ??
    wallpapers.find((wallpaper) => wallpaper.id === DEFAULT_WALLPAPER_ID) ??
    BUILT_IN_WALLPAPERS[0]
  )
}

/** One of the player's wallpapers, its files at `base`. */
export function customWallpaper(wallpaper: CustomWallpaper, base: string): Wallpaper {
  const variants: Wallpaper['variants'] = {}
  if (wallpaper.dark) variants.dark = fileUrl(base, wallpaper.dark)
  if (wallpaper.light) variants.light = fileUrl(base, wallpaper.light)
  return { id: wallpaper.id, name: wallpaper.name, variants }
}

/** The variant to show for `appearance`, and the appearance the UI must then use on top of it. */
export function pickVariant(wallpaper: Wallpaper, appearance: Appearance): { appearance: Appearance; src: string } {
  const wanted = wallpaper.variants[appearance]
  if (wanted) return { appearance, src: wanted }
  const other: Appearance = appearance === 'dark' ? 'light' : 'dark'
  const fallback = wallpaper.variants[other]
  if (fallback) return { appearance: other, src: fallback }
  throw new Error(`wallpaper ${wallpaper.id} has no variants`)
}

/** Every image file any of `wallpapers` can show (for preparing them up front). */
export function allWallpaperSources(wallpapers: Wallpaper[]): string[] {
  return wallpapers.flatMap((wallpaper) => Object.values(wallpaper.variants))
}

/**
 * Draws a wallpaper once into a bitmap of exactly `width` x `height` (cover-cropped, high-quality
 * downscale) and returns an object URL for it. Screens then only ever show these prepared bitmaps:
 * huge photos and filter-heavy SVGs would otherwise make crossfades (and the glass blur on top of them)
 * stutter, because the GPU would scale or re-render the full source every frame.
 */
export async function prepareWallpaper(src: string, width: number, height: number): Promise<string> {
  const image = new Image()
  image.src = src
  await image.decode()
  // An SVG without width/height attributes reports a tiny default size (e.g. 267x150) and would be drawn
  // that small, then stretched into a blur. Wallpaper SVGs must declare their size; catch it if not.
  if (src.endsWith('.svg') && image.naturalWidth < width / 2) {
    console.warn(`wallpaper ${src} has no intrinsic size; add width/height to its <svg> element`)
  }

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const cropWidth = width / scale
  const cropHeight = height / scale
  const cropX = (image.naturalWidth - cropWidth) / 2
  const cropY = (image.naturalHeight - cropHeight) / 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return src
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? URL.createObjectURL(blob) : src
}
