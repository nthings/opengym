import { todayISO } from '../lib/format.js'
import { rpgState } from './xp.js'

/**
 * The weekly ranking from what GET /api/rpg/board returned: me and each friend, with XP of the last
 * 7 days computed by the same rpgState as the sheet, from the workouts that count (no flag: not late,
 * not edited afterwards, not dated ahead). Best first; ties share a rank; a friend whose history does
 * not add up (`broken`) is listed last and not ranked. `viewer` carries the viewer's weekStart.
 */
export function rankBoard(board, today = todayISO(), viewer = {}) {
  if (!board) return []
  const row = (id, name, me, workouts, extra = {}) => {
    const counted = (workouts || []).filter(w => w.flag === '' && w.workout).map(w => w.workout)
    const s = rpgState({ weekStart: viewer.weekStart, workouts: counted }, today)
    return { id, name, me, weekXp: s.recent.week, streak: s.stats.streak, workouts: counted.length, error: null, broken: null, ...extra }
  }
  const rows = [
    row('me', board.me?.name || '', true, board.me?.workouts),
    ...(board.friends || []).map(f => row(f.id, f.name, false, f.workouts, { error: f.error || null, broken: f.broken || null })),
  ]
  const ranked = rows.filter(r => !r.broken).sort((a, b) => b.weekXp - a.weekXp || b.streak - a.streak || a.name.localeCompare(b.name))
  let rank = 0
  ranked.forEach((r, i) => { if (i === 0 || r.weekXp !== ranked[i - 1].weekXp || r.streak !== ranked[i - 1].streak) rank = i + 1; r.rank = rank })
  return [...ranked, ...rows.filter(r => r.broken).map(r => ({ ...r, rank: null }))]
}
