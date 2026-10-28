/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { COUNTRIES, parsePlaylist, countryName } from './catalog'
const fixture = '#EXTM3U\n#EXTINF:-1 tvg-id="One.de" group-title="News",One\nhttps://example.com/live.m3u8?token=1'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
describe('country TV catalogue', () => {
  it('ships flags and playable fallback lists for every selectable country', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(50)
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
    for (const c of COUNTRIES) {
      expect(existsSync(resolve('public/tv/flags', c.code + '.svg'))).toBe(true)
      const channels = parsePlaylist(readFileSync(resolve('public/tv/playlists', c.code + '.m3u'), 'utf8'), c.code)
      expect(channels.length, c.code).toBeGreaterThan(0)
      expect(channels.length).toBeLessThanOrEqual(1000)
    }
    expect(countryName('de', 'en')).toBe('Germany')
    expect(countryName('de', 'tr')).toBe('Almanya')
  })
  it('parses quoted commas, categories, BOM and duplicate backup streams', () => {
    const parsed = parsePlaylist(
      '\ufeff' + fixture + '\n#EXTINF:-1 group-title="News, General",One (720p)\nhttps://example.com/backup.m3u8',
      'de',
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      name: 'One',
      category: 'Haber',
      streamUrl: 'https://example.com/live.m3u8?token=1',
    })
  })
  it('rejects non-playlists, unsupported schemes, embedded credentials and required custom headers', () => {
    expect(() => parsePlaylist('<html>error</html>', 'de')).toThrow()
    const list =
      '#EXTM3U\n#EXTINF:-1,Unsafe\njavascript:alert(1)\n#EXTINF:-1,Credentials\nhttps://user:pass@example.com/a.m3u8\n#EXTINF:-1,Headers\n#EXTVLCOPT:http-referrer=https://example.com\nhttps://example.com/b.m3u8\n#EXTINF:-1,DASH\nhttps://example.com/c.mpd'
    expect(parsePlaylist(list, 'de')).toEqual([])
  })
  it('uses bundled fallback offline and caches a bounded set of country lists', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https:')) throw new Error('offline')
      return { ok: true, text: async () => fixture }
    })
    vi.stubGlobal('fetch', fetcher)
    const { loadCountry } = await import('./catalog')
    const signal = new AbortController().signal
    expect(await loadCountry('de', signal)).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await loadCountry('de', signal)
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const c of ['fr', 'it', 'es']) await loadCountry(c, signal)
    await loadCountry('de', signal)
    expect(fetcher).toHaveBeenCalledTimes(10)
    const controller = new AbortController()
    controller.abort()
    await expect(loadCountry('de', controller.signal)).rejects.toThrow('Aborted')
  })
})
