import { beforeEach, describe, expect, it } from 'vitest'
import type { GameplayEvent, JobInfo } from '../../../shared/host'
import { scoreDelivery, useDispatch } from './dispatch'

const job: JobInfo = {
  active: true,
  cargoLoaded: true,
  special: false,
  cargo: 'Glass',
  cargoMass: 18000,
  sourceCity: 'Berlin',
  sourceCompany: 'A',
  destinationCity: 'Prague',
  destinationCompany: 'B',
  deliveryTime: 1200,
  plannedDistanceKm: 350,
  income: 5500,
}
const event = (patch: Partial<GameplayEvent> = {}): GameplayEvent => ({
  sequence: 1,
  kind: 1,
  gameTime: 1100,
  job,
  amount: 5500,
  damage: 0,
  distanceKm: 350,
  xp: 210,
  autopark: false,
  provided: 31,
  ...patch,
})
beforeEach(() => useDispatch.getState().clear())

describe('SDK-confirmed dispatch results', () => {
  it('scores actual criteria and refuses to invent missing results', () => {
    expect(scoreDelivery(event(), 'professional')).toBe(100)
    expect(scoreDelivery(event({ damage: 0.05, autopark: true, gameTime: 1300 }), 'professional')).toBe(25)
    expect(scoreDelivery(event({ provided: 1 }), 'careful')).toBeNull()
    expect(scoreDelivery(event({ damage: NaN }), 'careful')).toBeNull()
    expect(scoreDelivery(event({ gameTime: 0 }), 'express')).toBeNull()
    expect(scoreDelivery(event({ kind: 2 }), 'professional')).toBeNull()
  })
  it('deduplicates reloads, distinguishes cancellation/fines and retains the event’s own job', () => {
    const receive = useDispatch.getState().receive
    receive('session-1', [event(), event({ sequence: 2, kind: 2 }), event({ sequence: 3, kind: 3 })])
    receive('session-1', [event()])
    expect(useDispatch.getState().history.map((r) => r.event.kind)).toEqual([3, 2, 1])
    expect(useDispatch.getState().history[0].score).toBeNull()
    expect(useDispatch.getState().history[2].event.job.cargo).toBe('Glass')
    receive('session-2', [event()])
    expect(useDispatch.getState().history).toHaveLength(4)
  })
  it('bounds the journal and messages during long sessions', () => {
    useDispatch.getState().receive(
      's',
      Array.from({ length: 300 }, (_, i) => event({ sequence: i + 1 })),
    )
    for (let i = 0; i < 100; i++) useDispatch.getState().report('break')
    expect(useDispatch.getState().history).toHaveLength(50)
    expect(useDispatch.getState().seen).toHaveLength(128)
    expect(useDispatch.getState().messages).toHaveLength(30)
  })
  it('uses the chosen virtual target without changing the game offer', () => {
    useDispatch.getState().choose(job, 'express')
    useDispatch.getState().receive('s', [event({ gameTime: 1300 })])
    expect(useDispatch.getState().history[0].score).toBe(0)
    expect(job.income).toBe(5500)
  })
})
