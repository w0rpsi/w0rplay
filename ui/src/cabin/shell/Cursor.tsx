import { useEffect, useRef } from 'react'

/** How long the cursor stays without the mouse moving, clicking or scrolling, ms. */
const IDLE_MS = 5000

/**
 * Direct GPU-composited cursor for zero React re-render overhead during high-DPI mouse interaction.
 * Directly translates the DOM node using translate3d, completely eliminating main-thread virtual DOM diffing,
 * synchronous layout recalculations, and frame stalls while video is playing.
 */
export function Cursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const awake = (pressed: boolean) => {
      if (cursorRef.current) cursorRef.current.classList.remove('idle')
      clearTimeout(timer)
      if (!pressed) {
        timer = setTimeout(() => {
          if (cursorRef.current) cursorRef.current.classList.add('idle')
        }, IDLE_MS)
      }
    }

    const move = (event: PointerEvent) => {
      const pressed = (event.buttons & 1) !== 0
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`
        cursorRef.current.style.display = 'block'
      }
      if (dotRef.current) {
        if (pressed) {
          dotRef.current.classList.add('pressed')
        } else {
          dotRef.current.classList.remove('pressed')
        }
      }
      awake(pressed)
    }

    const wheel = (event: WheelEvent) => awake((event.buttons & 1) !== 0)

    const leave = () => {
      clearTimeout(timer)
      if (cursorRef.current) {
        cursorRef.current.style.display = 'none'
      }
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', move, { passive: true })
    window.addEventListener('pointerup', move, { passive: true })
    window.addEventListener('wheel', wheel, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
      window.removeEventListener('pointerup', move)
      window.removeEventListener('wheel', wheel)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  return (
    <div
      ref={cursorRef}
      className="cursor"
      style={{ display: 'none', viewTransitionName: 'cursor', willChange: 'transform' }}
      aria-hidden
    >
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
