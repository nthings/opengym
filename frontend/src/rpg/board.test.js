import { describe, expect, it } from 'vitest'
import { rankBoard } from './board.js'

const wk = (id, d, w = 100, r = 10) => ({ wid: id, flag: '', workout: { id, d, name: 'x', entries: [{ id: '0025', sets: [{ w, r, done: true }] }], prs: [] } })
const friend = (id, name, workouts, extra = {}) => ({ id, name, serverUrl: 'https://x', fetchedAt: 1, error: null, broken: null, workouts, ...extra })
const TODAY = '2026-11-23'

describe('rankBoard', () => {
  it('ranks me and my friends by XP of the last 7 days, best first', () => {
    const b = rankBoard({
      me: { name: 'Me', workouts: [wk('a', '2026-11-23')] }, // 50 + 10
      friends: [friend('f1', 'Ana', [wk('b', '2026-11-23', 200), wk('c', '2026-11-22', 200)]), friend('f2', 'Beto', [])],
    }, TODAY)
    expect(b.map(r => [r.rank, r.name, r.weekXp])).toEqual([[1, 'Ana', 140], [2, 'Me', 60], [3, 'Beto', 0]])
    expect(b.find(r => r.me).name).toBe('Me')
  })

  it('only counts workouts with no flag, and only the last 7 days', () => {
    const late = { ...wk('l', '2026-11-23', 999), flag: 'late' }
    const edited = { ...wk('e', '2026-11-23', 999), flag: 'edited' }
    const b = rankBoard({
      me: { name: 'Me', workouts: [wk('a', '2026-11-23'), late, edited, wk('old', '2026-11-01', 500)] },
      friends: [],
    }, TODAY)
    expect(b[0].weekXp).toBe(60)
    expect(b[0].workouts).toBe(2)
  })

  it('ties share a rank, broken friends are listed last and unranked, errors are carried', () => {
    const b = rankBoard({
      me: { name: 'Me', workouts: [wk('a', '2026-11-23')] },
      friends: [
        friend('f1', 'Ana', [wk('b', '2026-11-23')]),
        friend('f2', 'Beto', [wk('z', '2026-11-23', 9999)], { broken: 'chain' }),
        friend('f3', 'Cris', [], { error: 'unreachable' }),
      ],
    }, TODAY)
    expect(b.map(r => [r.name, r.rank])).toEqual([['Ana', 1], ['Me', 1], ['Cris', 3], ['Beto', null]])
    expect(b.find(r => r.name === 'Cris').error).toBe('unreachable')
    expect(b.find(r => r.name === 'Beto').broken).toBe('chain')
  })

  it('carries the current streak, and an empty board does not crash', () => {
    const b = rankBoard({ me: { name: 'Me', workouts: [wk('a', '2026-11-23')] }, friends: [] }, TODAY)
    expect(b[0].streak).toBe(1)
    expect(rankBoard({ me: { name: 'Me', workouts: [] }, friends: [] }, TODAY)[0].weekXp).toBe(0)
    expect(rankBoard(null, TODAY)).toEqual([])
  })

  it('weighs a friend in pounds as kilos, so 225 lb is not worth more than 100 kg', () => {
    const b = rankBoard({
      me: { name: 'Me', workouts: [] },
      friends: [
        friend('f1', 'Lb', [{ ...wk('a', '2026-11-23', 225), workout: { id: 'a', d: '2026-11-23', name: 'x', entries: [{ id: '0025', sets: [{ w: 225, r: 10, done: true }] }], prs: [] } }], { unit: 'lb' }),
        friend('f2', 'Kg', [wk('b', '2026-11-23', 100)], { unit: 'kg' }),
      ],
    }, TODAY, { unit: 'kg' })
    expect(b.filter(r => !r.me).map(r => [r.name, r.weekXp])).toEqual([['Kg', 60], ['Lb', 60]])
  })
})
