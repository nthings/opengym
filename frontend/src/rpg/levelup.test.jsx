// @vitest-environment happy-dom
// The level-up toast: once, when the level goes up after a workout; silent on first sight.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { levelUpOf, useLevelUp } from './levelup.js'

const toast = vi.hoisted(() => vi.fn())
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast }) } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const day = (d, w = 100, r = 10) => ({ id: 'w' + d, d, entries: [{ id: '0025', sets: [{ w, r, done: true }] }] })
let host, root
function Probe({ S }) { useLevelUp(S, 'u1'); return null }
const render = S => act(() => root.render(<Probe S={S} />))

beforeEach(() => { localStorage.clear(); toast.mockClear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('levelUpOf', () => {
  it('is the new level only when it went up from a known one', () => {
    expect(levelUpOf(null, 3)).toBe(null)
    expect(levelUpOf(2, 2)).toBe(null)
    expect(levelUpOf(3, 2)).toBe(null)
    expect(levelUpOf(2, 3)).toBe(3)
  })
})

describe('useLevelUp', () => {
  it('stays silent the first time it sees a profile, even a high level', () => {
    render({ modules: { rpg: true }, workouts: [day('2026-11-02')] })
    expect(toast).not.toHaveBeenCalled()
  })

  it('toasts once when a new workout lifts the level', () => {
    render({ modules: { rpg: true }, workouts: [day('2026-11-02', 10, 1)] })
    render({ modules: { rpg: true }, workouts: [day('2026-11-02', 10, 1), day('2026-11-03', 200, 20)] })
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toContain('level 2')
    render({ modules: { rpg: true }, workouts: [day('2026-11-02', 10, 1), day('2026-11-03', 200, 20)], restSec: 99 })
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('does nothing with the module off', () => {
    render({ workouts: [day('2026-11-02', 10, 1)] })
    render({ workouts: [day('2026-11-02', 10, 1), day('2026-11-03', 200, 20)] })
    expect(toast).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})
