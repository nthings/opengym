// @vitest-environment happy-dom
// The RPG friends screen (/rpg/friends): invite links, adding a friend, the list.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Friends from './Friends.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => ({ api: vi.fn(), copy: vi.fn(async () => true) }))
vi.mock('../lib/api.js', () => ({ api: mocks.api }))
vi.mock('../lib/clipboard.js', () => ({ copyText: mocks.copy }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: o => o.onConfirm() }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ana = { id: 'f1', name: 'Ana', serverUrl: 'https://ana.example.com', publicKey: 'K'.repeat(43), since: 1 }
let friends, root, host, sheetRoot, sheetHost
const answer = (path, opts) => {
  if (path === '/api/rpg/status') return Promise.resolve({ on: mocks.on })
  if (path === '/api/rpg/friends') return Promise.resolve({ publicKey: 'P'.repeat(43), friends: [...friends], invites: 0 })
  if (path === '/api/rpg/board') return Promise.resolve(mocks.board)
  if (path === '/api/rpg/invite') return Promise.resolve({ link: 'https://me.example.com/#/rpg/invite/' + 'T'.repeat(43), expiresAt: 1 })
  if (path === '/api/rpg/add') {
    if (mocks.addError) return Promise.reject(Object.assign(new Error('server words'), { status: 400, data: { code: mocks.addError } }))
    friends.push(ana); return Promise.resolve({ friend: ana })
  }
  if (path === '/api/rpg/flag') {
    const b = JSON.parse(opts.body)
    mocks.flags = b.on === false ? mocks.flags.filter(x => x !== b.wid) : [...new Set([...mocks.flags, b.wid])]
    return Promise.resolve({ flags: mocks.flags })
  }
  if (path === '/api/rpg/remove') { friends = friends.filter(f => f.id !== JSON.parse(opts.body).id); return Promise.resolve({ ok: true }) }
  return Promise.reject(new Error('unexpected ' + path))
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
async function mount() {
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user: null })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<MemoryRouter><Friends /></MemoryRouter>) })
  await flush()
}
const btn = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const sheetBtn = text => [...sheetHost.querySelectorAll('button')].find(b => b.textContent.trim() === text)
// The app's sheets live in useUI and are rendered by its host; the test renders the last one itself.
async function openSheet() {
  const sheet = useUI.getState().sheets[useUI.getState().sheets.length - 1]
  sheetHost = document.createElement('div'); document.body.appendChild(sheetHost)
  sheetRoot = createRoot(sheetHost)
  await act(async () => { sheetRoot.render(sheet.render(() => {})) })
  await flush()
}
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

const wk = (id, d, w) => ({ wid: id, flag: '', workout: { id, d, name: 'x', entries: [{ id: '0025', sets: [{ w, r: 10, done: true }] }], prs: [] } })
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
beforeEach(() => { mocks.board = { me: { name: 'Me', workouts: [] }, friends: [] }; friends = []; mocks.on = true; mocks.addError = null; mocks.flags = []; mocks.api.mockReset(); mocks.api.mockImplementation(answer); mocks.copy.mockClear() })
afterEach(() => { act(() => root.unmount()); host.remove(); if (sheetRoot) act(() => sheetRoot.unmount()); if (sheetHost) sheetHost.remove(); sheetRoot = null; sheetHost = null })

describe('Friends', () => {
  it('on a server without the feature it says how to switch it on, and offers nothing else', async () => {
    mocks.on = false
    await mount()
    expect(host.textContent).toContain('RPG=on')
    expect(host.querySelector('input')).toBeFalsy()
    expect(mocks.api).not.toHaveBeenCalledWith('/api/rpg/friends', expect.anything())
  })

  it('lists the friends, or says there are none', async () => {
    await mount()
    expect(host.textContent).toContain('No friends yet.')
    act(() => root.unmount()); host.remove()
    friends = [ana]
    await mount()
    expect(host.textContent).toContain('Ana')
    expect(host.textContent).toContain('ana.example.com')
  })

  it('makes an invite link, shows it and copies it', async () => {
    await mount()
    await act(async () => { btn('Invite a friend').click() })
    await flush()
    const field = host.querySelector('input[readonly]')
    expect(field.value).toBe('https://me.example.com/#/rpg/invite/' + 'T'.repeat(43))
    expect(host.textContent).toContain('48 hours')
    await act(async () => { btn('Copy link').click() })
    expect(mocks.copy).toHaveBeenCalledWith(field.value)
    expect(host.textContent).toContain('Link copied')
  })

  it('adds a friend from a pasted link and refreshes the list', async () => {
    await mount()
    const link = 'https://ana.example.com/#/rpg/invite/' + 'A'.repeat(43)
    type(host.querySelector('input:not([readonly])'), link)
    await act(async () => { btn('Add a friend').click() })
    await flush()
    const call = mocks.api.mock.calls.find(c => c[0] === '/api/rpg/add')
    expect(JSON.parse(call[1].body)).toEqual({ link })
    expect(host.textContent).toContain('Ana')
    expect(host.querySelector('input:not([readonly])').value).toBe('')
  })

  it('says why an invite failed, in words of its own', async () => {
    await mount()
    const input = () => host.querySelector('input:not([readonly])')
    for (const [code, text] of [['invite-invalid', 'already used or has expired'], ['bad-link', 'not a valid invite link'], ['self', 'That invite is yours'], ['unreachable', 'Could not reach that server']]) {
      mocks.addError = code
      type(input(), 'https://x.example.com/#/rpg/invite/' + 'A'.repeat(43))
      await act(async () => { btn('Add a friend').click() })
      await flush()
      expect(host.textContent, code).toContain(text)
    }
    expect(host.textContent).not.toContain('server words')
  })

  it('removes a friend after confirming', async () => {
    friends = [ana]
    await mount()
    await act(async () => { btn('Remove').click() })
    await flush()
    expect(JSON.parse(mocks.api.mock.calls.find(c => c[0] === '/api/rpg/remove')[1].body)).toEqual({ id: 'f1' })
    expect(host.textContent).toContain('No friends yet.')
  })

  it('ranks me and my friends for the week, best first, with the rules underneath', async () => {
    friends = [ana]
    mocks.board = {
      me: { name: 'Me', workouts: [wk('m', today(), 100)] },
      friends: [{ ...ana, error: null, broken: null, workouts: [wk('a', today(), 300)] }],
    }
    await mount()
    const rows = [...host.querySelectorAll('.rpg-rank')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Ana')
    expect(rows[0].textContent).toContain('80 XP')
    expect(rows[1].textContent).toContain('You')
    expect(rows[1].textContent).toContain('60 XP')
    // A count of one must not read "1 semanas": the streak is a label and a number, not a plural.
    expect(rows[1].textContent).toContain('Streak: 1')
    expect(host.textContent).toContain('do not count')
  })

  it('shows a friend who cannot be updated, or whose history does not add up, without ranking them', async () => {
    friends = [ana]
    mocks.board = {
      me: { name: 'Me', workouts: [] },
      friends: [
        { ...ana, id: 'f1', name: 'Ana', error: 'unreachable', broken: null, workouts: [] },
        { ...ana, id: 'f2', name: 'Beto', error: null, broken: 'chain', workouts: [wk('z', today(), 9999)] },
      ],
    }
    await mount()
    const text = [...host.querySelectorAll('.rpg-rank')].map(r => r.textContent)
    expect(text.find(x => x.includes('Ana'))).toContain('Could not update')
    expect(text.find(x => x.includes('Beto'))).toContain('History does not add up')
    expect(text.find(x => x.includes('Beto'))).not.toContain('XP')
  })

  it('no ranking without friends', async () => {
    await mount()
    expect(host.querySelector('.rpg-rank')).toBeFalsy()
  })

  it('opens a friend week with their sets, and flags a doubtful workout', async () => {
    friends = [ana]
    mocks.board = {
      me: { name: 'Me', workouts: [] },
      friends: [{ ...ana, flags: [], error: null, broken: null, unit: 'kg', workouts: [wk('a', today(), 100)] }],
    }
    await mount()
    await act(async () => { host.querySelector('.rpg-rank').click() })
    await openSheet()
    expect(sheetHost.textContent).toContain('Ana')
    expect(sheetHost.textContent).toContain('100 × 10')
    await act(async () => { sheetBtn('Flag').click() })
    await flush()
    const call = mocks.api.mock.calls.find(c => c[0] === '/api/rpg/flag')
    expect(JSON.parse(call[1].body)).toEqual({ id: 'f1', wid: 'a', on: true })
    expect(sheetBtn('Unflag')).toBeTruthy()
    await act(async () => { sheetBtn('Unflag').click() })
    await flush()
    expect(JSON.parse(mocks.api.mock.calls.filter(c => c[0] === '/api/rpg/flag').at(-1)[1].body)).toEqual({ id: 'f1', wid: 'a', on: false })
    expect(sheetBtn('Flag')).toBeTruthy()
  })

  it('counts my flags, and three of them leave the friend unranked', async () => {
    friends = [ana]
    const three = ['a', 'b', 'c'].map((id, i) => wk(id, today(), 100 + i))
    mocks.board = { me: { name: 'Me', workouts: [] }, friends: [{ ...ana, flags: ['a'], error: null, broken: null, workouts: three }] }
    await mount()
    let row = host.querySelector('.rpg-rank')
    expect(row.textContent).toContain('1 flagged workout')
    expect(row.textContent).toContain('70 XP') // 50 for the day plus the two left: 10 + 10
    act(() => root.unmount()); host.remove()
    mocks.board = { me: { name: 'Me', workouts: [] }, friends: [{ ...ana, flags: ['a', 'b', 'c'], error: null, broken: null, workouts: three }] }
    await mount()
    row = [...host.querySelectorAll('.rpg-rank')].find(r => r.textContent.includes('Ana'))
    expect(row.textContent).toContain('Too many flagged workouts')
    expect(row.textContent).not.toContain('XP')
  })
})
