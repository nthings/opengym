// The pure rules of the RPG friends list: invites and friends inside a profile's rpg document
// (store.js). No I/O here.
import crypto from 'node:crypto';

export const INVITE_TTL_MS = 48 * 3600 * 1000;
const MAX_OPEN_INVITES = 10;
const NAME_MAX = 40;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('base64url');

/** A fresh single-use token. Only its hash is kept; the token itself goes into the link once. */
export function createInvite(doc, now = Date.now()) {
  doc.invites = doc.invites.filter(i => i.exp > now);
  const token = crypto.randomBytes(32).toString('base64url');
  doc.invites.push({ hash: sha(token), exp: now + INVITE_TTL_MS });
  doc.invites = doc.invites.slice(-MAX_OPEN_INVITES);
  return { token, exp: now + INVITE_TTL_MS };
}

/** True once, for a token that is open and not expired; it is burned either way it matches. */
export function consumeInvite(doc, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const h = sha(token);
  const i = doc.invites.findIndex(x => x.hash === h);
  if (i < 0) return false;
  const [inv] = doc.invites.splice(i, 1);
  return inv.exp > now;
}

export const friendIdOf = publicKey => crypto.createHash('sha256').update(String(publicKey)).digest('hex').slice(0, 16);

/** Adds a friend, or refreshes name and address of one with the same public key (`since` stays). */
export function addFriend(doc, { name, serverUrl, publicKey }, now = Date.now()) {
  const id = friendIdOf(publicKey);
  const clean = { id, name: String(name || '').trim().slice(0, NAME_MAX), serverUrl: String(serverUrl), publicKey, since: now };
  const at = doc.friends.findIndex(f => f.id === id);
  if (at >= 0) doc.friends[at] = { ...clean, since: doc.friends[at].since };
  else doc.friends.push(clean);
  return doc.friends.find(f => f.id === id);
}

export function removeFriend(doc, id) {
  const n = doc.friends.length;
  doc.friends = doc.friends.filter(f => f.id !== id);
  return doc.friends.length < n;
}

/** "https://server/#/rpg/invite/<token>" -> { base, token }, or null for anything else. */
export function parseInviteLink(link) {
  const m = /^(https?:\/\/[^\s#?]+)\/?#\/rpg\/invite\/([A-Za-z0-9_-]{43})$/.exec(String(link || '').trim());
  if (!m) return null;
  let u;
  try { u = new URL(m[1]); } catch { return null; }
  if (u.username || u.password) return null;
  return { base: u.origin + u.pathname.replace(/\/$/, ''), token: m[2] };
}
