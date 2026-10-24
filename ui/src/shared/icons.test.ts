import { describe, expect, it } from 'vitest'
import { type AppIconRole, appIcon } from './icons'

// The icon files there are (public/icons/w0rplay), as Vite sees them.
const FILES = Object.keys(import.meta.glob('../../public/icons/w0rplay/*.svg')).map((path) =>
  path.replace('../../public', ''),
)

const ROLES: AppIconRole[] = [
  'maps',
  'music',
  'spotify',
  'podcasts',
  'messages',
  'phone',
  'settings',
  'weather',
  'youtube',
  'youtubeMusic',
]

describe('appIcon', () => {
  it('gives every role W0RPLAY’s icon in the look asked for, and each file is there', () => {
    for (const role of ROLES) {
      for (const look of ['light', 'dark'] as const) {
        expect(FILES).toContain(appIcon(role, look))
      }
    }
    expect(appIcon('youtubeMusic', 'dark')).toBe('/icons/w0rplay/youtube-music.dark.svg')
  })
})
