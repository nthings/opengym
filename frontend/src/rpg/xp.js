// The RPG character sheet's engine (module `rpg`). Level, XP, six attributes, a title and badges,
// all read back from the workouts: nothing here is stored, so two devices, a restored backup or an
// import arrive at the same character, and there is nothing for a sync to merge (same idea as
// lib/streak.js).
//
// XP, per training day:
//   consistency  50 for showing up (once a day, however many workouts)
//   performance  1 per 100 kg of ticked-off work sets, 25 per personal record, and a flat 15 for a
//                session with stretching or cooldown work. Capped at 400 a day, so one monster
//                session cannot buy a level.
// and 25 per week of the best weekly streak (lib/streak.js), the long-haul consistency reward.
import { todayISO, isoOf } from '../lib/format.js'
import { streakInfo } from '../lib/streak.js'
import { loadOfWorkouts } from '../lib/muscles.js'
import { exOr } from '../lib/exercises.js'
import { workoutAt } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'

export const DAY_XP = 50
export const KG_PER_XP = 100
export const PR_XP = 25
export const STRETCH_XP = 15
export const DAY_PERFORMANCE_CAP = 400
export const STREAK_WEEK_XP = 25
// Catalogue categories (exercise `cat`) that count as stretching or cooldown work.
export const STRETCH_CATS = ['stretching', 'mobility', 'yoga', 'pilates', 'rehab']

export const ATTRIBUTES = [
  { id: 'legs', title: 'Legs', muscles: ['quadriceps', 'hamstring', 'gluteal', 'adductors', 'calves', 'hip-flexors', 'tibialis'] },
  { id: 'back', title: 'Back', muscles: ['lats', 'upper-back', 'lower-back', 'trapezius'] },
  { id: 'chest', title: 'Chest', muscles: ['chest', 'serratus'] },
  { id: 'shoulders', title: 'Shoulders', muscles: ['front-delts', 'side-delts', 'rear-delts'] },
  { id: 'arms', title: 'Arms', muscles: ['biceps', 'triceps', 'forearm'] },
  { id: 'core', title: 'Core', muscles: ['abs', 'obliques'] },
]

const TITLES = [[35, 'Legend'], [20, 'Champion'], [10, 'Warrior'], [5, 'Apprentice'], [1, 'Novice']]
export const titleFor = level => (TITLES.find(([from]) => level >= from) || TITLES[TITLES.length - 1])[1]

/** Total XP needed to reach `level` (level 1 is 0). */
export const xpForLevel = level => 50 * level * (level - 1)

/** { level, xp, into, span, toNext }: `into` XP since this level began, `span` what it needs. */
export function levelOf(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0))
  let level = 1
  while (xpForLevel(level + 1) <= x) level++
  const into = x - xpForLevel(level)
  const span = xpForLevel(level + 1) - xpForLevel(level)
  return { level, xp: x, into, span, toNext: span - into }
}

// A usable number: finite and never negative, so one odd set cannot turn the total into NaN.
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
const ISO = /^\d{4}-\d{2}-\d{2}$/
const dayOf = w => {
  if (typeof w?.d === 'string' && ISO.test(w.d)) return w.d
  const at = workoutAt(w)
  return Number.isFinite(at) ? isoOf(new Date(at)) : null
}

const BADGES = [
  { id: 'first-workout', title: 'First workout', test: x => x.workouts >= 1 },
  { id: 'workouts-10', title: '10 workouts', test: x => x.workouts >= 10 },
  { id: 'workouts-50', title: '50 workouts', test: x => x.workouts >= 50 },
  { id: 'workouts-100', title: '100 workouts', test: x => x.workouts >= 100 },
  { id: 'streak-4', title: '4 week streak', test: x => x.bestStreak >= 4 },
  { id: 'streak-12', title: '12 week streak', test: x => x.bestStreak >= 12 },
]

/**
 * The whole sheet as of `today`: { xp, level, into, span, toNext, title, attributes, badges, stats }.
 * Never throws on a missing or odd profile: that is level 1.
 */
export function rpgState(S, today = todayISO()) {
  const workouts = (Array.isArray(S?.workouts) ? S.workouts : []).filter(w => w && typeof w === 'object')
  const days = new Map() // day -> { volume, prs, stretch }
  for (const w of workouts) {
    const day = dayOf(w)
    if (!day) continue
    const d = days.get(day) || { volume: 0, prs: 0, stretch: false, worked: false }
    for (const e of Array.isArray(w.entries) ? w.entries : []) {
      let worked = false
      for (const s of Array.isArray(e?.sets) ? e.sets : []) {
        if (!s?.done || isWarmupRow(s)) continue
        worked = true
        d.worked = true
        d.volume += num(s.w) * num(s.r)
      }
      if (worked && STRETCH_CATS.includes(exOr(e.id)?.cat)) d.stretch = true
    }
    d.prs += Array.isArray(w.prs) ? w.prs.length : 0
    days.set(day, d)
  }

  let xp = 0
  let volume = 0
  let prs = 0
  for (const [day, d] of days) {
    if (!d.worked) { days.delete(day); continue } // nothing ticked off: showing up needs a set
    const performance = Math.floor(d.volume / KG_PER_XP) + d.prs * PR_XP + (d.stretch ? STRETCH_XP : 0)
    xp += DAY_XP + Math.min(DAY_PERFORMANCE_CAP, performance)
    volume += d.volume
    prs += d.prs
  }
  const bestStreak = workouts.length ? streakInfo(S, today).best : 0
  xp += bestStreak * STREAK_WEEK_XP

  const load = loadOfWorkouts(workouts)
  const attributes = ATTRIBUTES.map(a => ({
    id: a.id, title: a.title, value: Math.round(a.muscles.reduce((n, m) => n + (load[m] || 0), 0)),
  }))
  const stats = { workouts: workouts.length, days: days.size, volume, prs, bestStreak }
  const lv = levelOf(xp)
  return {
    ...lv,
    title: titleFor(lv.level),
    attributes,
    badges: BADGES.map(b => ({ id: b.id, title: b.title, earned: b.test(stats) })),
    stats,
  }
}
