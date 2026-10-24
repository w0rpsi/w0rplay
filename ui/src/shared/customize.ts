import type { AppIconRole } from './icons'

/**
 * The player's own wallpapers and icon sets (the companion's Customize), as the app lists them
 * (`w0rplay_host::customize`). Their files' paths are relative to W0RPLAY's `customize` folder, served to
 * the cabin page at `https://w0rplay.customize/` and to the companion at its own address.
 */
export interface Customizations {
  wallpapers: CustomWallpaper[]
  iconSets: IconSet[]
}

export interface CustomWallpaper {
  /** `custom:` and its file's name (a pair's: the name before `.dark`/`.light`). */
  id: string
  name: string
  dark: string | null
  light: string | null
}

export interface IconSet {
  name: string
  /** The icons it has, by role, for a light screen and a dark one (the same file for both when it's one
   * icon); a role (or a look) it leaves out keeps W0RPLAY's own icon. */
  icons: Partial<Record<AppIconRole, { light: string | null; dark: string | null }>>
}

/** Which of an icon's looks shows: as the screen is (`auto`), or always one. */
export type IconStyle = 'auto' | 'light' | 'dark'

export const NO_CUSTOMIZATIONS: Customizations = { wallpapers: [], iconSets: [] }

/** Where the cabin page finds the player's files (the host maps the folder there). */
export const CABIN_FILES = 'https://w0rplay.customize/'
/** Where the companion finds them (the app's `w0rplay-customize` scheme, as WebView2 addresses it). */
export const COMPANION_FILES = 'http://w0rplay-customize.localhost/'

/** A file's address at `base`: each part of its path encoded (names have spaces, brackets, any letters). */
export function fileUrl(base: string, path: string): string {
  return base + path.split('/').map(encodeURIComponent).join('/')
}
