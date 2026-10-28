import { create } from 'zustand'
import { isInHost, postToHost, type CabinActionState, type CabinBindings } from '../../../shared/host'

type Control = 'light' | 'curtain'
let sequence = 0
export const useCabinControl = create<{
  bindings: CabinBindings
  curtain: { available: boolean; progress: number }
  setCurtain: (closed: boolean) => void
  pending: { id: number; control: Control; state: CabinActionState } | null
  bind: (control: Control, key: number | null) => void
  press: (control: Control) => void
  answer: (id: number, state: CabinActionState) => void
}>()((set, get) => ({
  bindings: { lightKey: null, curtainKey: null },
  curtain: { available: false, progress: 0 },
  setCurtain: (closed) => {
    if (isInHost()) postToHost({ type: 'curtain', closed })
  },
  pending: null,
  bind: (control, key) => {
    if (isInHost()) postToHost({ type: 'cabinBinding', control, key })
    else set({ bindings: { ...get().bindings, [control === 'light' ? 'lightKey' : 'curtainKey']: key } })
  },
  press: (control) => {
    if (!isInHost()) return
    const id = ++sequence
    set({ pending: { id, control, state: 'waiting' } })
    postToHost({ type: 'cabinAction', id, control })
  },
  answer: (id, state) => {
    const pending = get().pending
    if (pending?.id === id) set({ pending: { ...pending, state } })
  },
}))
