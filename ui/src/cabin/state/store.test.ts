import { afterEach, describe, expect, it, vi } from 'vitest'

/** A browser's storage holding what an earlier W0RPLAY saved (and the page around it, outside W0RPLAY). */
function savedStorage(state: unknown) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  const items = new Map([['w0rplay.cabin', JSON.stringify({ state, version: 1 })]])
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the saved Settings choices', () => {
  it('come back as they were', async () => {
    vi.stubGlobal(
      'localStorage',
      savedStorage({ dashboardWidgets: { nowPlaying: false, destination: true, weather: false }, albumArt: false }),
    )
    const { useCabin } = await import('./store')
    expect(useCabin.getState().dashboardWidgets).toEqual({ nowPlaying: false, destination: true, weather: false })
    expect(useCabin.getState().albumArt).toBe(false)
  })

  it('keep a widget shown unless it was turned off, and ignore what isn’t a choice', async () => {
    vi.stubGlobal(
      'localStorage',
      savedStorage({ dashboardWidgets: { weather: false, nowPlaying: 'no' }, albumArt: 'off' }),
    )
    const { useCabin } = await import('./store')
    expect(useCabin.getState().dashboardWidgets).toEqual({ nowPlaying: true, destination: true, weather: false })
    expect(useCabin.getState().albumArt).toBe(true)
  })

  it('are all on when nothing was saved (an earlier W0RPLAY)', async () => {
    vi.stubGlobal('localStorage', savedStorage({ appearanceMode: 'dark' }))
    const { useCabin } = await import('./store')
    expect(useCabin.getState().dashboardWidgets).toEqual({ nowPlaying: true, destination: true, weather: true })
    expect(useCabin.getState().albumArt).toBe(true)
    expect(useCabin.getState().appearanceMode).toBe('dark')
  })
})
