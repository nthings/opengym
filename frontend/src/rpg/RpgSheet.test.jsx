// @vitest-environment happy-dom
// The RPG character sheet (module `rpg`).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RpgSheet from './RpgSheet.jsx'
import { DEF, useStore } from '../store/useStore.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))

let root, container
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null })

function mount(patch = {}) {
  const S = clone(DEF)
  Object.assign(S, patch)
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><RpgSheet /></MemoryRouter>))
}
const text = () => container.textContent

describe('RpgSheet', () => {
  it('shows level, title, XP to the next level and the six attributes', () => {
    mount({
      workouts: [
        { id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 100, r: 10, done: true }] }] },
        { id: 'b', d: '2026-11-03', entries: [{ id: '0025', sets: [{ w: 100, r: 10, done: true }] }] },
      ],
    })
    // Two days: 2 x (50 + 10), plus a best streak of 1 week (25) = 145 XP, level 2, 55 to go.
    expect(text()).toContain('Level 2')
    expect(text()).toContain('Novice')
    expect(text()).toContain('145 XP')
    expect(text()).toContain('155 XP to level 3')
    for (const a of ['Legs', 'Back', 'Chest', 'Shoulders', 'Arms', 'Core']) expect(text()).toContain(a)
  })

  it('a profile with no workouts is level 1 and does not crash', () => {
    mount({ workouts: [] })
    expect(text()).toContain('Level 1')
    expect(text()).toContain('100 XP to level 2')
  })

  it('earned badges are marked, the rest are shown as locked', () => {
    mount({ workouts: [{ id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 10, r: 10, done: true }] }] }] })
    const first = [...container.querySelectorAll('.rpg-badge')].find(b => b.textContent.includes('First workout'))
    const ten = [...container.querySelectorAll('.rpg-badge')].find(b => b.textContent.includes('10 workouts'))
    expect(first.getAttribute('data-earned')).toBe('true')
    expect(ten.getAttribute('data-earned')).toBe('false')
  })
})
