import { useEffect } from 'react'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { isOn } from '../lib/modules.js'
import { rpgState } from './xp.js'

/** The new level when it went up from a known one, else null. */
export const levelUpOf = (prev, now) => (prev != null && now > prev ? now : null)

// The one thing the module remembers, and only per device: the level last seen, so a level-up is
// announced once. Nothing of the character itself is stored (xp.js). The first sight of a profile
// only records the level, so opening the app on a new device does not announce an old one.
const keyOf = userId => 'opengym-rpg-level:' + (userId || 'guest')
const read = key => { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : null } catch { return null } }

/** Toasts "Level up!" after a workout lifts the level. Called from the always-on tab bar. */
export function useLevelUp(S, userId) {
  const on = isOn(S, 'rpg')
  const workouts = S?.workouts
  useEffect(() => {
    if (!on) return
    const key = keyOf(userId)
    const now = rpgState(S).level
    const up = levelUpOf(read(key), now)
    try { localStorage.setItem(key, String(now)) } catch { /* private mode: no memory, no toast */ }
    if (up) useUI.getState().toast(t('Level up! You are now level {0}.', up))
  }, [on, workouts, userId]) // eslint-disable-line react-hooks/exhaustive-deps
}
