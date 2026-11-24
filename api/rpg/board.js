// A profile's view of its friends: fetch each friend's feed (over the network, or in-process when
// the friend has a profile on this same server), verify it, and keep what it adds up to in the
// profile's rpg document. The browser turns the workouts into XP (frontend/src/rpg), so the formula
// lives in one place.
import { verifyEntries, materialize } from './log.js';

export const STALE_MS = 30 * 1000;
export const KEEP_DAYS = 120;

const empty = () => ({ head: { seq: 0, hash: '' }, workouts: {}, fetchedAt: 0, error: null, broken: null });

/**
 * Brings `doc.cache[friend.id]` up to date. `fetchFeed(since)` answers { status, body }. A page that
 * does not verify marks the friend `broken` for good (a restored backup looks the same as a
 * rewritten history: remove the friend and invite again); a friend who cannot be reached or no
 * longer lists us is an `error` that clears on the next good answer.
 */
export async function refreshFriend({ doc, friend, fetchFeed, now }) {
  const c = doc.cache[friend.id] || (doc.cache[friend.id] = empty());
  c.fetchedAt = now;
  if (c.broken) return c;
  try {
    for (;;) {
      const r = await fetchFeed(c.head.seq);
      if (r.status !== 200 || !r.body) { c.error = r.status === 404 && r.body?.code === 'not-friends' ? 'not-friends' : 'refused'; break; }
      if (r.body.publicKey !== friend.publicKey || !Array.isArray(r.body.entries)) { c.error = 'refused'; break; }
      const v = verifyEntries(r.body.entries, { publicKey: friend.publicKey, head: c.head });
      if (!v.ok) { c.broken = v.reason; break; }
      materialize(r.body.entries, c.workouts);
      c.head = v.head; c.error = null;
      if (!r.body.more || !r.body.entries.length) break;
    }
  } catch { c.error = 'unreachable'; }
  return c;
}

/** The workouts worth sending to the browser: with content, within the last KEEP_DAYS days. */
export function recentWorkouts(map, now) {
  const from = new Date(now - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  return Object.entries(map).filter(([, v]) => v.workout && v.workout.d >= from).map(([wid, v]) => ({ wid, flag: v.flag, workout: v.workout }));
}

/** Drops what the board would never show, so the cache stays small. */
export function prune(c, now) {
  const keep = new Set(recentWorkouts(c.workouts, now).map(w => w.wid));
  for (const wid of Object.keys(c.workouts)) if (!keep.has(wid)) delete c.workouts[wid];
}
