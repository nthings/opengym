// @vitest-environment happy-dom
// The RPG badges screen (/rpg/badges): every badge as a row, earned or locked, with its progress.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RpgBadges from './RpgBadges.jsx'
import { DEF, useStore } from '../store/useStore.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))

let root, container
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null })

function mount(patch = {}) {
  useStore.setState({ S: Object.assign(clone(DEF), patch), user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><RpgBadges /></MemoryRouter>))
}
const row = text => [...container.querySelectorAll('.lrow')].find(r => r.textContent.includes(text))

describe('RpgBadges', () => {
  it('lists all six badges, earned ones checked, locked ones with their progress', () => {
    mount({ workouts: [{ id: 'a', d: '2026-11-02', entries: [{ id: '0025', sets: [{ w: 10, r: 10, done: true }] }] }] })
    expect(container.querySelectorAll('.lrow')).toHaveLength(6)
    expect(row('First workout').classList.contains('rpg-badge-on')).toBe(true)
    expect(row('First workout').querySelector('.lrow-k')).toBeTruthy()
    expect(row('10 workouts').classList.contains('rpg-badge-on')).toBe(false)
    expect(row('10 workouts').textContent).toContain('1 / 10')
    expect(row('4 week streak').textContent).toContain('1 / 4')
  })

  it('an empty profile has nothing earned and does not crash', () => {
    mount({ workouts: [] })
    expect([...container.querySelectorAll('.lrow')].every(r => !r.classList.contains('rpg-badge-on'))).toBe(true)
  })
})
