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
    for (const a of ['Legs', 'Back muscles', 'Chest', 'Shoulders', 'Arms', 'Core']) expect(text()).toContain(a)
  })

  it('a profile with no workouts is level 1 and does not crash', () => {
    mount({ workouts: [] })
    expect(text()).toContain('Level 1')
    expect(text()).toContain('100 XP to level 2')
  })

  it('badges live on their own screen: the sheet only links to it, with the count and the next one', () => {
    mount({ workouts: [{ id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 10, r: 10, done: true }] }] }] })
    expect(container.querySelector('.rpg-badge')).toBeFalsy()
    const link = container.querySelector('.rpg-badges-link')
    expect(link.textContent).toContain('1 / 6')
    expect(link.textContent).toContain('10 workouts')
  })

  it('the attribute bars are levels on one absolute scale, not relative to your best one', () => {
    mount({ workouts: [{ id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] }] })
    const rows = [...container.querySelectorAll('.rpg-attr')]
    expect(rows).toHaveLength(6)
    const chest = rows.find(r => r.textContent.includes('Chest'))
    expect(chest.textContent).toContain('Level 1')
    // A single set is far from level 2 (20 sets): the bar is nearly empty, not full.
    expect(Number(chest.querySelector('[data-pct]').getAttribute('data-pct'))).toBeLessThan(20)
  })

  it('shows XP gained today and this week, and where the XP comes from', () => {
    const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    mount({ workouts: [{ id: 'a', d: iso, entries: [{ id: '0025', sets: [{ w: 100, r: 10, done: true }] }] }] })
    expect(container.querySelector('.rpg-today').textContent).toContain('+60 XP')
    expect(container.querySelector('.rpg-week').textContent).toContain('+60 XP')
    const src = container.querySelector('.rpg-sources').textContent
    expect(src).toContain('Consistency')
    expect(src).toContain('Performance')
    expect(src).toContain('Streak')
    expect(src).toContain('50 XP')
  })

  it('names the next badge with its progress', () => {
    mount({ workouts: [{ id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 10, r: 10, done: true }] }] }] })
    const next = container.querySelector('.rpg-badges-link').textContent
    expect(next).toContain('10 workouts')
    expect(next).toContain('1 / 10')
  })
})
