// The signed, hash-chained log of a profile's workouts (docs/superpowers/specs/2026-11-23-rpg-friends-design.md).
// Each entry says "at this server time this workout looked like this", is chained to the one before
// by its hash and signed with the profile's key. A friend's server fetches it, checks the chain and
// the signatures, and only then counts anything. The server's own clock is what stamps `recordedAt`,
// so a workout logged days after its date is flagged `late` and does not count.
//
// Entry: { seq, prev, hash, recordedAt, kind: 'workout' | 'removed', flag, wid, whash, workout?, sig }
//   flag: '' counts; 'late' (recorded too long after its day), 'future' (dated ahead), 'edited' (a
//   workout already logged changed) do not. `workout` is left out of a late entry: it cannot count,
//   and a profile with years of history would otherwise ship all of it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sign, verify } from './keys.js';

const HOUR = 3600 * 1000;
// A day, a day of grace, and 14 hours so no time zone is wrongly late (the server only sees UTC).
export const LATE_MS = (24 + 24 + 14) * HOUR;
const FUTURE_MS = (24 + 14) * HOUR;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FLAGS = ['', 'late', 'future', 'edited'];
const MAX_ENTRIES = 60, MAX_SETS = 100, NAME_MAX = 80, MAX_PRS = 60;

const sha = s => crypto.createHash('sha256').update(s).digest('base64url');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** The part of a workout a friend gets: day, name, exercises, sets (weight, reps, ticked, warm-up), records. */
export function cleanWorkout(w) {
  if (!w || typeof w !== 'object' || !ID_RE.test(String(w.id || '')) || !ISO.test(String(w.d || ''))) return null;
  const entries = (Array.isArray(w.entries) ? w.entries : []).slice(0, MAX_ENTRIES)
    .filter(e => e && typeof e.id === 'string' && e.id.length <= 64)
    .map(e => ({
      id: e.id,
      sets: (Array.isArray(e.sets) ? e.sets : []).slice(0, MAX_SETS).filter(s => s && typeof s === 'object').map(s => {
        const o = { w: num(s.w), r: num(s.r), done: s.done === true };
        if (s.warmup === true) o.warmup = true;
        if (s.phase === 'warmup') o.phase = 'warmup';
        return o;
      }),
    }));
  return {
    id: String(w.id), d: w.d, name: String(w.name || '').slice(0, NAME_MAX), entries,
    prs: (Array.isArray(w.prs) ? w.prs : []).filter(x => typeof x === 'string' && x.length <= 64).slice(0, MAX_PRS),
  };
}

const hashOf = e => sha(JSON.stringify([e.seq, e.prev, e.recordedAt, e.kind, e.flag, e.wid, e.whash]));
const workoutHash = cw => sha(JSON.stringify(cw));

export function createLogStore(dataDir) {
  const dir = path.join(dataDir, 'rpg');
  const fileOf = uid => {
    if (!ID_RE.test(String(uid))) throw new Error('bad user id');
    return path.join(dir, uid + '.log');
  };
  const cache = new Map(); // uid -> { size, entries }

  function read(uid) {
    const file = fileOf(uid);
    let st;
    try { st = fs.statSync(file); } catch { cache.delete(uid); return []; }
    const hit = cache.get(uid);
    if (hit && hit.size === st.size) return hit.entries;
    const entries = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try { entries.push(JSON.parse(line)); } catch { throw new Error('rpg log unreadable: ' + path.basename(file)); }
    }
    cache.set(uid, { size: st.size, entries });
    return entries;
  }

  function append(uid, entry) {
    const file = fileOf(uid);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(file, line, { mode: 0o600 });
    const hit = cache.get(uid);
    if (hit) { hit.entries.push(entry); hit.size += Buffer.byteLength(line); }
  }

  const remove = uid => { cache.delete(uid); try { fs.rmSync(fileOf(uid), { force: true }); } catch { /* nothing to remove */ } };
  return { read, append, remove };
}

/**
 * Brings the log up to date with the profile's workouts as they are now: new ones, edited ones and
 * removed ones each become an entry. Returns how many it added. `now` is the server's clock.
 */
export function syncLog({ store, uid, keys, workouts, now = Date.now() }) {
  const entries = store.read(uid);
  const latest = new Map(); // wid -> whash, or null once removed
  const seen = new Set();
  for (const e of entries) { seen.add(e.wid); latest.set(e.wid, e.kind === 'removed' ? null : e.whash); }
  let head = entries.length ? entries[entries.length - 1] : { seq: 0, hash: '' };
  let added = 0;
  const push = (kind, flag, wid, whash, workout) => {
    const e = { seq: head.seq + 1, prev: head.hash, recordedAt: now, kind, flag, wid, whash };
    e.hash = hashOf(e);
    if (workout) e.workout = workout;
    e.sig = sign(keys.privateKey, e.hash);
    store.append(uid, e);
    head = e; added++;
  };

  const current = new Set();
  for (const w of Array.isArray(workouts) ? workouts : []) {
    const cw = cleanWorkout(w);
    if (!cw || current.has(cw.id)) continue;
    current.add(cw.id);
    const whash = workoutHash(cw);
    if (latest.get(cw.id) === whash) continue;
    const dayStart = Date.parse(cw.d + 'T00:00:00Z');
    const late = now > dayStart + LATE_MS;
    const flag = late ? 'late' : seen.has(cw.id) ? 'edited' : dayStart > now + FUTURE_MS ? 'future' : '';
    push('workout', flag, cw.id, whash, late ? null : cw);
  }
  for (const [wid, whash] of latest) if (whash !== null && !current.has(wid)) push('removed', '', wid, '', null);
  return added;
}

/**
 * Checks a run of entries a friend's server sent, continuing from `head` (what we already hold):
 * unbroken sequence and links, every hash and signature, every workout matches its hash and is
 * the plain shape cleanWorkout makes. { ok, head } or { ok: false, reason }.
 */
export function verifyEntries(entries, { publicKey, head }) {
  let cur = { seq: head.seq, hash: head.hash };
  for (const e of entries) {
    if (!e || typeof e !== 'object') return { ok: false, reason: 'shape' };
    if (e.seq !== cur.seq + 1) return { ok: false, reason: 'sequence' };
    if (e.prev !== cur.hash) return { ok: false, reason: 'chain' };
    if (!['workout', 'removed'].includes(e.kind) || !FLAGS.includes(e.flag) || typeof e.wid !== 'string' || typeof e.whash !== 'string' || !Number.isFinite(e.recordedAt)) return { ok: false, reason: 'shape' };
    if (e.hash !== hashOf(e)) return { ok: false, reason: 'hash' };
    if (!verify(publicKey, e.hash, e.sig)) return { ok: false, reason: 'signature' };
    if (e.workout !== undefined) {
      const clean = cleanWorkout(e.workout);
      if (!clean || JSON.stringify(clean) !== JSON.stringify(e.workout) || clean.id !== e.wid || workoutHash(clean) !== e.whash) return { ok: false, reason: 'workout' };
    }
    cur = { seq: e.seq, hash: e.hash };
  }
  return { ok: true, head: cur };
}

/** The workouts a run of entries adds up to: wid -> { flag, workout (or null), whash }. */
export function materialize(entries, into = {}) {
  for (const e of entries) {
    if (e.kind === 'removed') delete into[e.wid];
    else into[e.wid] = { flag: e.flag, workout: e.workout || null, whash: e.whash };
  }
  return into;
}
