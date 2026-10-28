import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GameplayEvent, JobInfo } from '../../../shared/host'

export type Goal = 'careful' | 'express' | 'professional'
export type DriverStatus = 'departed' | 'break' | 'delay'
export interface Delivery {
  id: string
  event: GameplayEvent
  goal: Goal
  score: number | null
}
export const jobKey = (job: JobInfo) =>
  [job.cargo, job.sourceCity, job.destinationCity, job.deliveryTime, job.income].join('|')

/** Scores only SDK-confirmed criteria. Missing data gives no score, never an invented success. */
export function scoreDelivery(event: GameplayEvent, goal: Goal): number | null {
  if (event.kind !== 1) return null
  const damageKnown = !!(event.provided & 2) && Number.isFinite(event.damage)
  const timeKnown = event.job.deliveryTime > 0 && event.gameTime > 0
  const manualKnown = !!(event.provided & 16)
  if (goal === 'careful')
    return damageKnown ? Math.round(100 * (1 - Math.min(1, Math.max(0, event.damage) * 10))) : null
  if (goal === 'express') return timeKnown ? (event.gameTime <= event.job.deliveryTime ? 100 : 0) : null
  if (!damageKnown || !timeKnown || !manualKnown) return null
  return (
    Math.round(50 * (1 - Math.min(1, Math.max(0, event.damage) * 10))) +
    (event.gameTime <= event.job.deliveryTime ? 30 : 0) +
    (!event.autopark ? 20 : 0)
  )
}

interface DispatchState {
  goals: Record<string, Goal>
  history: Delivery[]
  seen: string[]
  messages: { id: number; status: DriverStatus }[]
  choose: (job: JobInfo, goal: Goal) => void
  report: (status: DriverStatus) => void
  receive: (session: string, events: GameplayEvent[]) => void
  clear: () => void
}

export const useDispatch = create<DispatchState>()(
  persist(
    (set) => ({
      goals: {},
      history: [],
      seen: [],
      messages: [],
      choose: (job, goal) =>
        set((s) => ({
          goals: Object.fromEntries(
            [...Object.entries(s.goals).filter(([k]) => k !== jobKey(job)), [jobKey(job), goal]].slice(-50),
          ),
        })),
      report: (status) => set((s) => ({ messages: [...s.messages, { id: Date.now(), status }].slice(-30) })),
      receive: (session, events) =>
        set((s) => {
          const seen = new Set(s.seen)
          const history = [...s.history]
          for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
            if (
              !Number.isSafeInteger(event.sequence) ||
              event.sequence <= 0 ||
              ![1, 2, 3].includes(event.kind) ||
              !event.job
            )
              continue
            const id = `${session}:${event.sequence}`
            if (seen.has(id)) continue
            seen.add(id)
            const goal = s.goals[jobKey(event.job)] ?? 'careful'
            history.unshift({ id, event, goal, score: scoreDelivery(event, goal) })
          }
          return { seen: [...seen].slice(-128), history: history.slice(0, 50) }
        }),
      clear: () => set({ history: [], seen: [], messages: [], goals: {} }),
    }),
    {
      name: 'w0rplay-dispatch-v1',
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return globalThis.localStorage?.getItem(key) ?? null
          } catch {
            return null
          }
        },
        setItem: (key, value) => {
          try {
            globalThis.localStorage?.setItem(key, value)
          } catch {
            /* Journal remains available in memory. */
          }
        },
        removeItem: (key) => {
          try {
            globalThis.localStorage?.removeItem(key)
          } catch {
            /* Optional local cache. */
          }
        },
      })),
      version: 1,
      partialize: ({ goals, history, seen, messages }) => ({ goals, history, seen, messages }),
      // A corrupt or older local journal must not prevent the cabin from booting.
      merge: (saved, current) => {
        const s = saved as Partial<DispatchState> | null
        if (!s || typeof s !== 'object') return current
        return {
          ...current,
          goals:
            s.goals && typeof s.goals === 'object'
              ? Object.fromEntries(
                  Object.entries(s.goals)
                    .filter(([, g]) => ['careful', 'express', 'professional'].includes(g))
                    .slice(-50),
                )
              : {},
          history: Array.isArray(s.history)
            ? s.history
                .filter((r) => r && typeof r.id === 'string' && r.event?.job && [1, 2, 3].includes(r.event.kind))
                .slice(0, 50)
            : [],
          seen: Array.isArray(s.seen) ? s.seen.filter((v) => typeof v === 'string').slice(-128) : [],
          messages: Array.isArray(s.messages)
            ? s.messages.filter((v) => v && ['departed', 'break', 'delay'].includes(v.status)).slice(-30)
            : [],
        }
      },
    },
  ),
)
