import { useEffect, useRef } from 'react'

/** How long the cursor stays visible without mouse movement before fading out (5s). */
const IDLE_MS = 5000

/**
 * High-performance, zero-latency interaction cursor.
 * Uses direct DOM manipulation and requestAnimationFrame to completely bypass React state
 * re-renders and eliminate layout thrashing, achieving butter-smooth 60-144 FPS pointer tracking.
 */
export function Cursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<number | null>(null)
  const rAF = useRef<number | null>(null)
  const state = useRef<{ x: number; y: number; pressed: boolean; visible: boolean }>({
    x: -100,
    y: -100,
    pressed: false,
    visible: false,
  })

  useEffect(() => {
    const updateDOM = () => {
      const el = cursorRef.current
      const dot = dotRef.current
      if (!el || !dot) return

      if (!state.current.visible) {
        el.style.opacity = '0'
        return
      }

      el.style.opacity = ''
      el.style.transform = `translate3d(${state.current.x}px, ${state.current.y}px, 0)`

      if (state.current.pressed) {
        dot.classList.add('pressed')
      } else {
        dot.classList.remove('pressed')
      }
    }

    const scheduleUpdate = () => {
      if (rAF.current !== null) return
      rAF.current = requestAnimationFrame(() => {
        rAF.current = null
        updateDOM()
      })
    }

    const awake = (pressed: boolean) => {
      const el = cursorRef.current
      if (el) el.classList.remove('idle')
      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current)
      }
      if (!pressed) {
        idleTimer.current = window.setTimeout(() => {
          if (cursorRef.current) cursorRef.current.classList.add('idle')
        }, IDLE_MS)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      state.current.x = event.clientX
      state.current.y = event.clientY
      state.current.pressed = (event.buttons & 1) !== 0
      state.current.visible = true
      awake(state.current.pressed)
      scheduleUpdate()
    }

    const onPointerDown = (event: PointerEvent) => {
      state.current.x = event.clientX
      state.current.y = event.clientY
      state.current.pressed = true
      state.current.visible = true
      awake(true)
      scheduleUpdate()
    }

    const onPointerUp = (event: PointerEvent) => {
      state.current.pressed = (event.buttons & 1) !== 0
      awake(state.current.pressed)
      scheduleUpdate()
    }

    const onWheel = (event: WheelEvent) => {
      awake((event.buttons & 1) !== 0)
    }

    const onLeave = () => {
      state.current.visible = false
      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current)
      }
      scheduleUpdate()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave, { passive: true })

    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
      if (rAF.current !== null) cancelAnimationFrame(rAF.current)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('wheel', onWheel)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={cursorRef}
      className="cursor"
      style={{
        opacity: 0,
        willChange: 'transform',
        transform: 'translate3d(-100px, -100px, 0)',
      }}
      aria-hidden
    >
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
