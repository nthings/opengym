import { todayISO } from '../lib/format.js'
import { rpgState } from './xp.js'

// Three flagged workouts in the week and a friend is out of my ranking.
export const FLAGS_OUT = 3

/**
 * The weekly ranking from what GET /api/rpg/board returned: me and each friend, with XP of the last
 * 7 days computed by the same rpgState as the sheet, from the workouts that count (no flag: not late,
 * not edited afterwards, not dated ahead, and not flagged by me). Best first; ties share a rank. A
 * friend whose history does not add up (`broken`) or who has FLAGS_OUT flagged workouts this week is
 * listed last and not ranked. `viewer` carries the viewer's weekStart and unit; a friend's weights
 * arrive in their own unit (`f.unit`).
 */
export function rankBoard(board, today = todayISO(), viewer = {}) {
  if (!board) return []
  const row = ({ id, name, me, workouts, unit, flags = [], error = null, broken = null }) => {
    const flagged = new Set(flags)
    const counted = (workouts || []).filter(w => w.flag === '' && w.workout && !flagged.has(w.wid)).map(w => w.workout)
    const s = rpgState({ weekStart: viewer.weekStart, unit: me ? viewer.unit : unit, workouts: counted }, today)
    const inWeek = (workouts || []).filter(w => flagged.has(w.wid) && w.workout && w.workout.d >= s.recent.from).length
    return {
      id, name, me, unit: unit || 'kg', weekXp: s.recent.week, streak: s.stats.streak, workouts: counted.length,
      flags: inWeek, disqualified: inWeek >= FLAGS_OUT, error, broken, from: s.recent.from,
    }
  }
  const rows = [
    row({ id: 'me', name: board.me?.name || '', me: true, workouts: board.me?.workouts, unit: viewer.unit }),
    ...(board.friends || []).map(f => row({ ...f, me: false })),
  ]
  const out = r => !!(r.broken || r.disqualified)
  const ranked = rows.filter(r => !out(r)).sort((a, b) => b.weekXp - a.weekXp || b.streak - a.streak || a.name.localeCompare(b.name))
  let rank = 0
  ranked.forEach((r, i) => { if (i === 0 || r.weekXp !== ranked[i - 1].weekXp || r.streak !== ranked[i - 1].streak) rank = i + 1; r.rank = rank })
  return [...ranked, ...rows.filter(out).map(r => ({ ...r, rank: null }))]
}
