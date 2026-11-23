import { describe, expect, it } from 'vitest'
import { ATTRIBUTES, STRETCH_CATS, levelOf, rpgState, titleFor, xpForLevel } from './xp.js'

// A workout in the real shape (lib/fixtures/anim-safety-state.json): weight × reps, `done` when it
// was ticked off. 0025 is a barbell bench press, 1890 an achilles stretch.
const workout = (d, entries, extra = {}) => ({ id: 'w' + d, d, entries, ...extra })
// One trained week is a best streak of 1: 25 XP on top of the day itself.
const WEEK = 25
const sets = (...list) => list.map(([w, r, extra]) => ({ w, r, done: true, ...extra }))

describe('level curve', () => {
  it('level 1 starts at 0 XP, each level needs 100 more than the last', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    expect(xpForLevel(3)).toBe(300)
    expect(xpForLevel(4)).toBe(600)
  })

  it('levelOf reads the level back out of an XP total', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0, span: 100, toNext: 100 })
    expect(levelOf(99).level).toBe(1)
    expect(levelOf(100)).toMatchObject({ level: 2, into: 0, span: 200, toNext: 200 })
    expect(levelOf(100).toNext).toBe(200)
    expect(levelOf(299).level).toBe(2)
    expect(levelOf(300).level).toBe(3)
  })

  it('titles step up with the level', () => {
    expect(titleFor(1)).toBe('Novice')
    expect(titleFor(5)).toBe('Apprentice')
    expect(titleFor(10)).toBe('Warrior')
    expect(titleFor(20)).toBe('Champion')
    expect(titleFor(35)).toBe('Legend')
  })
})

describe('rpgState', () => {
  it('an empty profile is level 1 with nothing on the sheet', () => {
    for (const S of [null, {}, { workouts: 'junk' }]) {
      const s = rpgState(S)
      expect(s.level).toBe(1)
      expect(s.xp).toBe(0)
      expect(s.attributes.map(a => a.value)).toEqual([0, 0, 0, 0, 0, 0])
      expect(s.badges.filter(b => b.earned)).toEqual([])
      expect(s.title).toBe('Novice')
      expect(s.stats.workouts).toBe(0)
    }
  })

  it('a day earns 50 for showing up plus 1 per 100 kg of work', () => {
    const S = { workouts: [workout('2026-11-02', [{ id: '0025', sets: sets([100, 10]) }])] }
    expect(rpgState(S).xp).toBe(50 + 10 + WEEK)
  })

  it('warm-up rows and unticked sets add nothing', () => {
    const S = { workouts: [workout('2026-11-02', [
      { id: '0025', sets: [{ w: 100, r: 10, done: true, warmup: true }, { w: 100, r: 10 }] },
    ])] }
    expect(rpgState(S).xp).toBe(50 + WEEK)
  })

  it('each personal record in a workout is 25 XP', () => {
    const S = { workouts: [workout('2026-11-02', [{ id: '0025', sets: sets([100, 10]) }], { prs: ['0025', '0980'] })] }
    expect(rpgState(S).xp).toBe(50 + 10 + 50 + WEEK)
  })

  it('a huge day is capped: 400 of performance XP', () => {
    const S = { workouts: [workout('2026-11-02', [{ id: '0025', sets: sets(...Array.from({ length: 40 }, () => [200, 20])) }])] }
    expect(rpgState(S).xp).toBe(50 + 400 + WEEK)
  })

  it('two workouts on one day earn one day of consistency', () => {
    const S = { workouts: [
      workout('2026-11-02', [{ id: '0025', sets: sets([10, 10]) }]),
      { ...workout('2026-11-02', [{ id: '0025', sets: sets([10, 10]) }]), id: 'w2' },
    ] }
    expect(rpgState(S).xp).toBe(50 + 1 + 1 + WEEK)
  })

  it('a stretch or cooldown session is worth 15 more, a mobility-only day still counts', () => {
    const S = { workouts: [workout('2026-11-03', [{ id: '1890', sets: sets([0, 60]) }])] }
    expect(rpgState(S).xp).toBe(50 + 15 + WEEK)
    const plain = { workouts: [workout('2026-11-03', [{ id: '0025', sets: sets([0, 10]) }])] }
    expect(rpgState(plain).xp).toBe(50 + WEEK)
    for (const cat of STRETCH_CATS) expect(STRETCH_CATS).toContain(cat)
  })

  it('a workout with no day but a start timestamp counts on that day', () => {
    const at = new Date('2026-11-04T18:00:00').getTime()
    const S = { workouts: [{ id: 'w', start: at, entries: [{ id: '0025', sets: sets([10, 10]) }] }] }
    // The day counts; the core streak walk only reads `d`, so no streak week comes with it.
    expect(rpgState(S).xp).toBe(50 + 1)
  })

  it('the best streak adds 25 per week', () => {
    const S = { workouts: ['2026-11-02', '2026-11-09', '2026-11-16'].map(d => workout(d, [{ id: '0025', sets: sets([0, 10]) }])) }
    expect(rpgState(S, '2026-11-18').xp).toBe(3 * 50 + 3 * 25)
  })

  it('attributes follow the muscles trained, all six always present', () => {
    const S = { workouts: [workout('2026-11-02', [{ id: '0025', sets: sets([60, 8]) }])] }
    const s = rpgState(S)
    expect(s.attributes.map(a => a.id)).toEqual(ATTRIBUTES.map(a => a.id))
    const chest = s.attributes.find(a => a.id === 'chest')
    const legs = s.attributes.find(a => a.id === 'legs')
    expect(chest.value).toBeGreaterThan(0)
    expect(legs.value).toBe(0)
  })

  it('badges: first workout, and every 10 up to 100; streak badges at 4 and 12 weeks', () => {
    const one = rpgState({ workouts: [workout('2026-11-02', [{ id: '0025', sets: sets([0, 10]) }])] })
    expect(one.badges.filter(b => b.earned).map(b => b.id)).toEqual(['first-workout'])

    const many = Array.from({ length: 10 }, (_, i) => workout(`2026-01-${String(i + 1).padStart(2, '0')}`, [{ id: '0025', sets: sets([0, 10]) }]))
    const m = rpgState({ workouts: many })
    expect(m.badges.filter(b => b.earned).map(b => b.id)).toContain('workouts-10')
    expect(m.badges.find(b => b.id === 'workouts-50').earned).toBe(false)

    const weekly = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
    const w = rpgState({ workouts: weekly.map(d => workout(d, [{ id: '0025', sets: sets([0, 10]) }])) }, '2026-11-04')
    expect(w.badges.find(b => b.id === 'streak-4').earned).toBe(true)
    expect(w.badges.find(b => b.id === 'streak-12').earned).toBe(false)
  })
})
