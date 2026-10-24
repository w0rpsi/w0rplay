import { useEffect, useState } from 'react'
import { call, CURRENT_SERIAL_VERSION, on, openUrl } from './bridge'

export const GITHUB_REPO = 'w0rpsi/w0rplay'

/** An update to W0RPLAY, found on its releases. Mirrors the app's `update::Offer`. */
export interface Offer {
  version: string
  /** What's new: the changelog's notes for it (Markdown, a list). */
  notes: string
  /** When it was released, `YYYY-MM-DD`. */
  date: string | null
  url?: string
}

/** How far the download is. */
export interface Progress {
  done: number
  total: number | null
}

/** The update found, if one is: checked on startup against GitHub releases and periodically. */
export function useUpdateOffer(): Offer | null {
  const [offer, setOffer] = useState<Offer | null>(null)
  useEffect(() => {
    let live = true
    const take = (found: Offer | null) => live && found && setOffer(found)

    // Check GitHub releases on app launch
    lookForUpdate().then(take, () => {})

    // Fallback to Tauri updater if configured
    call<Offer | null>('update_offer').then(take, () => {})
    const stop = on<Offer>('update-found', setOffer)
    return () => {
      live = false
      stop()
    }
  }, [])
  return offer
}

/** Looks for an update now from GitHub releases. */
export async function lookForUpdate(): Promise<Offer | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const latestTag = (data.tag_name || '').replace(/^v/, '').trim()
    if (!latestTag) return null

    // If latest release tag is different from current serial version, offer update
    if (latestTag !== CURRENT_SERIAL_VERSION) {
      return {
        version: latestTag,
        notes: data.body || 'Yeni W0RPLAY sürümü yayınlandı.',
        date: data.published_at ? data.published_at.slice(0, 10) : null,
        url: data.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${data.tag_name}`,
      }
    }
  } catch (err) {
    console.warn('[update] GitHub release check failed:', err)
  }
  return null
}

/** Installs/downloads the update: opens the release download page. */
export async function installUpdate(url?: string): Promise<void> {
  const targetUrl = url || `https://github.com/${GITHUB_REPO}/releases/latest`
  openUrl(targetUrl)
}

/** Follows the download of the update being installed. */
export function onUpdateProgress(handler: (progress: Progress) => void): () => void {
  return on<Progress>('update-progress', handler)
}

/** The notes' lines: the changelog's list items, without their Markdown, each whole (the changelog wraps an
 * item onto indented lines after its first). */
export function noteLines(notes: string): string[] {
  const items: string[] = []
  let inItem = false
  for (const raw of notes.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('- ') || line.startsWith('* ')) {
      items.push(line.slice(2))
      inItem = true
    } else if (inItem && line && /^\s/.test(raw)) {
      items[items.length - 1] += ` ${line}`
    } else {
      inItem = false
    }
  }
  return items.map((item) => item.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1'))
}
