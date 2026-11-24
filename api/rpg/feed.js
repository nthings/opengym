// What a friend's server asks of this one: the feed of a profile's signed log. The request is
// signed with the asker's key (over the path, who it is for and a timestamp), so only a known
// friend gets an answer and a captured request is good for five minutes of reading, nothing more.
import { sign, verify } from './keys.js';

export const SKEW_MS = 5 * 60 * 1000;
export const PAGE = 500;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const message = (path, to, ts) => `GET\n${path}\n${to}\n${ts}`;

/** The headers that sign a GET of `path` (with its query) for the profile whose public key is `to`. */
export function signRequest(keys, { to, path, now }) {
  const ts = String(now);
  return { 'X-Rpg-Key': keys.publicKey, 'X-Rpg-To': to, 'X-Rpg-Ts': ts, 'X-Rpg-Sig': sign(keys.privateKey, message(path, to, ts)) };
}

/** { ok, from, to } for a request signed by signRequest, else { ok: false }. Header names are lower case. */
export function checkRequest(headers, path, now) {
  const from = headers['x-rpg-key'], to = headers['x-rpg-to'], ts = headers['x-rpg-ts'], sig = headers['x-rpg-sig'];
  if (![from, to, ts, sig].every(x => typeof x === 'string') || !KEY_RE.test(from) || !KEY_RE.test(to)) return { ok: false };
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > SKEW_MS) return { ok: false };
  if (!verify(from, message(path, to, ts), sig)) return { ok: false };
  return { ok: true, from, to };
}

/**
 * A page of the log of the profile that owns key `to`, for `from`, only when `from` is one of
 * their friends. Null otherwise (the same answer for "no such profile" and "not your friend").
 */
export function serveFeed({ store, log, from, to, since, limit = PAGE }) {
  for (const uid of store.ids()) {
    let doc;
    try { doc = store.load(uid); } catch { continue; }
    if (doc.keys.publicKey !== to) continue;
    if (!doc.friends.some(f => f.publicKey === from)) return null;
    const all = log.read(uid);
    const entries = all.filter(e => e.seq > since).slice(0, limit);
    const last = all[all.length - 1];
    return { publicKey: to, unit: doc.unit === 'lb' ? 'lb' : 'kg', entries, head: last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: '' }, more: entries.length === limit && entries[entries.length - 1].seq < (last?.seq || 0) };
  }
  return null;
}
