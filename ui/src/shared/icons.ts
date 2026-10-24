/**
 * App icons by role. The UI only ever asks for a role (and a look, light or dark), so replacing the icon set
 * means changing this file.
 *
 * W0RPLAY's own icons (public/icons/w0rplay), each in a light and a dark look: drawn in the logo's style, and
 * for the music services their companies' own marks, from their official files (on their own background in the
 * light look, on W0RPLAY's dark card in the dark look).
 */
export type AppIconRole =
  | 'maps'
  | 'music'
  | 'spotify'
  | 'podcasts'
  | 'messages'
  | 'phone'
  | 'settings'
  | 'weather'
  | 'youtube'
  | 'youtubeMusic'
  | 'vehicle'
  | 'delivery'
  | 'camera'
  | 'tv'

/** Each role's files' name. */
const FILES: Record<AppIconRole, string> = {
  maps: 'maps',
  music: 'music',
  spotify: 'spotify',
  podcasts: 'podcasts',
  messages: 'messages',
  phone: 'phone',
  settings: 'settings',
  weather: 'weather',
  youtube: 'youtube',
  youtubeMusic: 'youtube-music',
  vehicle: 'vehicle',
  delivery: 'delivery',
  camera: 'camera',
  tv: 'tv',
}

/** W0RPLAY's own icon for `role`, for a light or a dark screen. */
export function appIcon(role: AppIconRole, look: 'light' | 'dark' = 'light'): string {
  return `/icons/w0rplay/${FILES[role]}.${look}.svg`
}
