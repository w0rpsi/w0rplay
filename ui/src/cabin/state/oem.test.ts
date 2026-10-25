import { describe, expect, it } from 'vitest'
import { frameInsets, resolveOemStrip } from './oem'

describe('resolveOemStrip', () => {
  it("keeps screen edge-to-edge without cutout", () => {
    expect(resolveOemStrip('auto', 'scania-2025')).toBeNull()
    expect(resolveOemStrip('auto', null)).toBeNull()
  })

  it('can give CarPlay the whole screen', () => {
    expect(resolveOemStrip('off', 'daf-2021')).toBeNull()
  })
})

describe('frameInsets', () => {
  it("returns zero insets for edge-to-edge display", () => {
    expect(frameInsets({ left: 0, bottom: 106 }, 'daf-2021')).toEqual({ left: 0, bottom: 0 })
    expect(frameInsets({ left: 96, bottom: 80 }, 'scania-2025')).toEqual({ left: 0, bottom: 0 })
  })

  it('only overlaps on exact-size screens, and never past the screen edge', () => {
    expect(frameInsets({ left: 0, bottom: 106 }, 'generic')).toEqual({ left: 0, bottom: 0 })
    expect(frameInsets({ left: 0, bottom: 106 }, null)).toEqual({ left: 0, bottom: 0 })
    expect(frameInsets({ left: 96, bottom: 0 }, 'scania-2025')).toEqual({ left: 0, bottom: 0 })
    expect(frameInsets({ left: 1, bottom: 0 }, 'generic')).toEqual({ left: 0, bottom: 0 })
  })
})
