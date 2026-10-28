import { useEffect, useRef, useState } from 'react'
import { prepareWallpaper } from '../wallpapers'

/** Must match --motion-duration in shell.css: how long the outgoing wallpaper stays under the incoming one. */
const TRANSITION_MS = 650

interface Layer {
  src: string
  key: number
}

/**
 * The wallpaper behind everything. A change of image crossfades: the incoming layer fades in on top of
 * the outgoing one, which is removed once the fade is over. Every wallpaper is prepared as a screen-sized
 * bitmap when used, retaining only the two layers of an active crossfade.
 */
export function Wallpaper({ src }: { src: string }) {
  const [layers, setLayers] = useState<Layer[]>([{ src, key: 0 }])
  const prepared = usePreparedWallpapers(layers.map((layer) => layer.src))

  // A new image starts a crossfade. Adjusting state while rendering (instead of in an effect) is React's
  // pattern for state that follows a prop: the new layer is there in the very first render with it.
  const top = layers[layers.length - 1]
  if (top.src !== src) {
    setLayers([top, { src, key: top.key + 1 }])
  }

  useEffect(() => {
    if (layers.length < 2) return
    const timer = setTimeout(() => setLayers((current) => current.slice(-1)), TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [layers])

  return (
    <div className="wallpaper-stack">
      {layers.map((layer) => (
        <img key={layer.key} className="wallpaper" src={prepared[layer.src] ?? layer.src} alt="" />
      ))}
    </div>
  )
}

/** Prepare only displayed layers; release their bitmaps once the crossfade no longer uses them. */
function usePreparedWallpapers(sources: string[]): Record<string, string> {
  const [prepared, setPrepared] = useState<Record<string, string>>({})
  const urls = useRef(new Map<string, string>())
  const key = sources.join('\n')

  useEffect(() => {
    let cancelled = false
    for (const [source, url] of urls.current) {
      if (!sources.includes(source)) {
        URL.revokeObjectURL(url)
        urls.current.delete(source)
      }
    }
    setPrepared(Object.fromEntries(urls.current))
    for (const source of sources) {
      if (urls.current.has(source)) continue
      prepareWallpaper(source, window.innerWidth, window.innerHeight)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          urls.current.set(source, url)
          setPrepared(Object.fromEntries(urls.current))
        })
        .catch((error: unknown) => console.warn(`cannot prepare wallpaper ${source}`, error))
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    const made = urls.current
    return () => {
      made.forEach((url) => URL.revokeObjectURL(url))
      made.clear()
    }
  }, [])
  return prepared
}
