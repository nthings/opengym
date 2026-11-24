/* /api/rpg: the RPG friends feature (docs/superpowers/specs/2026-11-23-rpg-friends-design.md).
 * Stage A: keys, invite links and the friends list. Handed the session helpers by server.js like
 * integrations/routes.js. With RPG off every route but /status answers 404 { code: 'rpg-off' }.
 * `accept` is called by another server, so it has no session: it is guarded by the one-time token
 * and a rate limit, and it answers the same way for a wrong, used or expired token. */
import { outboundUrlError } from '../net-guard.js';
import { rpgStore } from './store.js';
import { makePost } from './http.js';
import { createInvite, consumeInvite, addFriend, removeFriend, parseInviteLink } from './friends.js';

const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const ACCEPT_MAX = 30; // per minute, for the whole server

export function rpgRoutes({ json, readBody, readSession, dataDir, origin, enabled, allowLan = false, post = null, now = Date.now, nameOf = null }) {
  const store = rpgStore(dataDir);
  const send = post || makePost({ allowLan });
  const base = String(origin).replace(/\/$/, '');
  const off = res => json(res, 404, { error: 'the RPG friends feature is off on this server', code: 'rpg-off' });
  const attempts = [];

  const guard = fn => async (req, res) => {
    if (!enabled) return off(res);
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    await fn(req, res, user);
  };

  return {
    'GET /api/rpg/status': async (req, res) => json(res, 200, { on: !!enabled }),

    'GET /api/rpg/friends': guard(async (req, res, user) => {
      const doc = store.load(user.id);
      doc.invites = doc.invites.filter(i => i.exp > now());
      json(res, 200, { publicKey: doc.keys.publicKey, friends: doc.friends, invites: doc.invites.length });
    }),

    'POST /api/rpg/invite': guard(async (req, res, user) => {
      const doc = store.load(user.id);
      const { token, exp } = createInvite(doc, now());
      store.save(user.id, doc);
      json(res, 200, { link: base + '/#/rpg/invite/' + token, expiresAt: exp });
    }),

    'POST /api/rpg/add': guard(async (req, res, user) => {
      const body = await readBody(req);
      const link = parseInviteLink(body?.link);
      if (!link) return json(res, 400, { error: 'that is not an invite link', code: 'bad-link' });
      if (link.base === base) return json(res, 400, { error: 'that invite is from this same server', code: 'self' });
      if (outboundUrlError(link.base, { allowLan })) return json(res, 400, { error: 'that address is not allowed', code: 'bad-address' });
      const doc = store.load(user.id);
      let r;
      try {
        r = await send(link.base + '/api/rpg/accept', { token: link.token, publicKey: doc.keys.publicKey, serverUrl: base, name: user.name || '' });
      } catch { return json(res, 502, { error: 'could not reach that server', code: 'unreachable' }); }
      if (r.status !== 200) {
        const code = r.body?.code === 'invite-invalid' ? 'invite-invalid' : r.body?.code === 'rpg-off' ? 'friend-rpg-off' : 'refused';
        return json(res, code === 'invite-invalid' ? 400 : 502, { error: 'that server did not accept the invite', code });
      }
      const them = r.body;
      if (!them || !KEY_RE.test(them.publicKey)) return json(res, 502, { error: 'that server answered something else', code: 'refused' });
      if (them.publicKey === doc.keys.publicKey) return json(res, 400, { error: 'that invite is yours', code: 'self' });
      // The address we actually reached is the one we keep, not what the other side claims.
      const friend = addFriend(doc, { name: them.name, serverUrl: link.base, publicKey: them.publicKey }, now());
      store.save(user.id, doc);
      json(res, 200, { friend });
    }),

    'POST /api/rpg/accept': async (req, res) => {
      if (!enabled) return off(res);
      const t = now();
      while (attempts.length && attempts[0] < t - 60000) attempts.shift();
      if (attempts.length >= ACCEPT_MAX) return json(res, 429, { error: 'slow down a little', code: 'rate-limited' }, { 'Retry-After': '60' });
      attempts.push(t);
      const body = await readBody(req);
      if (typeof body?.token !== 'string' || !KEY_RE.test(body?.publicKey || '') || outboundUrlError(body?.serverUrl, { allowLan })) {
        return json(res, 400, { error: 'bad request', code: 'bad-request' });
      }
      const serverUrl = new URL(body.serverUrl).origin;
      for (const uid of store.ids()) {
        let doc;
        try { doc = store.load(uid); } catch { continue; }
        if (!consumeInvite(doc, body.token, t)) continue;
        // The token is burned in the document in memory; keep it burned even if this is refused.
        if (body.publicKey === doc.keys.publicKey) { store.save(uid, doc); return json(res, 400, { error: 'that invite is yours', code: 'self' }); }
        addFriend(doc, { name: body.name, serverUrl, publicKey: body.publicKey }, t);
        store.save(uid, doc);
        return json(res, 200, { publicKey: doc.keys.publicKey, name: (nameOf && nameOf(uid)) || '', serverUrl: base });
      }
      json(res, 400, { error: 'that invite is not valid', code: 'invite-invalid' });
    },

    'POST /api/rpg/remove': guard(async (req, res, user) => {
      const body = await readBody(req);
      const doc = store.load(user.id);
      if (!removeFriend(doc, String(body?.id || ''))) return json(res, 404, { error: 'no such friend' });
      store.save(user.id, doc);
      json(res, 200, { ok: true });
    }),
  };
}
