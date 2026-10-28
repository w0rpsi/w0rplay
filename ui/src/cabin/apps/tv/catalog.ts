import countryData from './countries.json'
import type { Channel, ChannelCategory } from './TVApp'

export const COUNTRIES = countryData
export const countryName = (code: string, language: string) =>
  new Intl.DisplayNames([language], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase()
export const countryFlag = (code: string) => `/tv/flags/${code}.svg`
export function savedCountry(): string {
  try {
    const code = localStorage.getItem('w0rplay.tv.country')
    if (COUNTRIES.some((c) => c.code === code)) return code!
  } catch {
    /* Optional preference storage. */
  }
  return 'tr'
}
export function saveCountry(code: string) {
  try {
    localStorage.setItem('w0rplay.tv.country', code)
  } catch {
    /* Still usable without storage. */
  }
}
const categories: Record<string, ChannelCategory> = {
  news: 'Haber',
  sports: 'Spor',
  music: 'Müzik',
  documentary: 'Belgesel',
  general: 'Ulusal',
}
/** Parse only browser-playable HLS entries; never evaluate playlist directives. */
export function parsePlaylist(text: string, country: string): Channel[] {
  if (text.length > 4_000_000 || !text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid playlist')
  const channels: Channel[] = [],
    seen = new Set<string>()
  let info: { name: string; group: string } | null = null
  let headersRequired = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#EXTINF:')) {
      let quoted = false,
        comma = -1
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') quoted = !quoted
        else if (line[i] === ',' && !quoted) {
          comma = i
          break
        }
      }
      const name = line
        .slice(comma + 1)
        .trim()
        .slice(0, 160)
      info = comma >= 0 && name ? { name, group: /group-title="([^"\n]*)"/i.exec(line)?.[1] ?? '' } : null
      headersRequired = false
    } else if (line.startsWith('#EXTVLCOPT:') || line.startsWith('#KODIPROP:')) {
      headersRequired = true
    } else if (line && !line.startsWith('#')) {
      if (info && !headersRequired) {
        try {
          const url = new URL(line)
          const key = info.name.replace(/\s*\([^)]*\)\s*/g, '').toLowerCase()
          if (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            url.pathname.toLowerCase().endsWith('.m3u8') &&
            !seen.has(key)
          ) {
            seen.add(key)
            channels.push({
              id: `${country}:${channels.length}`,
              name: info.name,
              category: categories[info.group.toLowerCase()] ?? 'Ulusal',
              subtitle: info.group || country.toUpperCase(),
              streamUrl: url.href,
              badgeColor: '#24446b',
            })
          }
        } catch {
          /* Malformed entries are skipped, not opened. */
        }
      }
      info = null
      if (channels.length >= 1000) break
    }
  }
  return channels
}
const cache = new Map<string, { at: number; channels: Channel[] }>()
export async function loadCountry(code: string, signal: AbortSignal, refresh = false): Promise<Channel[]> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const country = COUNTRIES.find((c) => c.code === code)
  if (!country) throw new Error('Unknown country')
  const hit = cache.get(code)
  if (!refresh && hit && Date.now() - hit.at < 30 * 60_000) return hit.channels
  let result: Channel[] | null = null
  try {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)])
    const response = await fetch(`https://iptv-org.github.io/iptv/countries/${country.playlistCode}.m3u`, {
      signal: timeout,
      credentials: 'omit',
    })
    if (!response.ok) throw new Error('Playlist unavailable')
    result = parsePlaylist(await response.text(), code)
    if (!result.length) throw new Error('Empty playlist')
  } catch (error) {
    if (signal.aborted) throw error
    const response = await fetch(`/tv/playlists/${code}.m3u`, { signal })
    if (!response.ok) throw new Error('Backup unavailable')
    result = parsePlaylist(await response.text(), code)
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!result?.length) throw new Error('No playable channels')
  cache.delete(code)
  cache.set(code, { at: Date.now(), channels: result })
  while (cache.size > 3) cache.delete(cache.keys().next().value!)
  return result
}
