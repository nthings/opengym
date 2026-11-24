import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rpgRoutes } from '../rpg/routes.js';

// Two servers, wired to each other in memory: `post` of one calls the accept route of the other.
const nodes = {};
function makeNode(name, origin, { enabled = true, user = { id: 'u1', name } } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-'));
  const json = (res, code, obj) => { res.code = code; res.body = obj; };
  const post = async (url, body) => {
    const host = Object.keys(nodes).find(h => url.startsWith(h));
    if (!host) throw Object.assign(new Error('no route to host'), { code: 'ENOTFOUND' });
    const res = {};
    await nodes[host].routes['POST /api/rpg/accept']({ body, headers: {} }, res);
    return { status: res.code, body: res.body };
  };
  const routes = rpgRoutes({
    json, readBody: async req => req.body || {}, readSession: req => (req.signedOut ? null : req.user || user),
    dataDir, origin, enabled, allowLan: false, post, nameOf: uid => (uid === 'u2' ? 'Beto' : name),
  });
  nodes[origin] = { routes, name };
  return {
    routes, origin,
    call: async (key, body, extra = {}) => { const res = {}; await routes[key]({ body, headers: {}, ...extra }, res); return res; },
  };
}
const A_URL = 'https://a.example.com', B_URL = 'https://b.example.com';

test('the full flow: A invites, B adds, both list each other', async () => {
  const a = makeNode('Ana', A_URL), b = makeNode('Beto', B_URL);
  const inv = await a.call('POST /api/rpg/invite');
  assert.equal(inv.code, 200);
  assert.match(inv.body.link, /^https:\/\/a\.example\.com\/#\/rpg\/invite\/[A-Za-z0-9_-]{43}$/);
  const add = await b.call('POST /api/rpg/add', { link: inv.body.link });
  assert.equal(add.code, 200);
  assert.equal(add.body.friend.name, 'Ana');
  assert.equal(add.body.friend.serverUrl, A_URL);
  const la = (await a.call('GET /api/rpg/friends')).body, lb = (await b.call('GET /api/rpg/friends')).body;
  assert.equal(la.friends.length, 1);
  assert.equal(la.friends[0].name, 'Beto');
  assert.equal(la.friends[0].serverUrl, B_URL);
  assert.equal(la.friends[0].publicKey, lb.publicKey);
  assert.equal(lb.friends[0].publicKey, la.publicKey);
  assert.ok(!JSON.stringify([la, lb]).includes('privateKey'));
});

test('an invite works once; a second add is refused and stores nothing', async () => {
  const a = makeNode('Ana', A_URL), b = makeNode('Beto', B_URL, { user: { id: 'u2', name: 'Beto' } });
  const c = makeNode('Cris', 'https://c.example.com', { user: { id: 'u3', name: 'Cris' } });
  const link = (await a.call('POST /api/rpg/invite')).body.link;
  assert.equal((await b.call('POST /api/rpg/add', { link })).code, 200);
  const again = await c.call('POST /api/rpg/add', { link });
  assert.equal(again.code, 400);
  assert.equal(again.body.code, 'invite-invalid');
  assert.equal((await c.call('GET /api/rpg/friends')).body.friends.length, 0);
});

test('a forged token is invite-invalid', async () => {
  makeNode('Ana', A_URL);
  const b = makeNode('Beto', B_URL);
  const r = await b.call('POST /api/rpg/add', { link: `${A_URL}/#/rpg/invite/${'Z'.repeat(43)}` });
  assert.equal(r.body.code, 'invite-invalid');
});

test('two profiles on the same server can be friends, with no network call', async () => {
  const a = makeNode('Ana', A_URL);
  const beto = { id: 'u2', name: 'Beto' };
  const link = (await a.call('POST /api/rpg/invite')).body.link;
  const add = await a.call('POST /api/rpg/add', { link }, { user: beto });
  assert.equal(add.code, 200);
  assert.equal(add.body.friend.name, 'Ana');
  assert.equal(add.body.friend.serverUrl, A_URL);
  const lu1 = (await a.call('GET /api/rpg/friends')).body, lu2 = (await a.call('GET /api/rpg/friends', null, { user: beto })).body;
  assert.equal(lu1.friends[0].name, 'Beto');
  assert.equal(lu2.friends[0].name, 'Ana');
  assert.equal(lu1.friends[0].publicKey, lu2.publicKey);
  assert.notEqual(lu1.publicKey, lu2.publicKey);
  // The invite was used up.
  assert.equal((await a.call('POST /api/rpg/add', { link }, { user: { id: 'u3', name: 'Cris' } })).body.code, 'invite-invalid');
});

test('same-server friends need no address check: a LAN origin works without RPG_ALLOW_LAN', async () => {
  const lan = makeNode('Ana', 'http://192.168.1.5:8092');
  const link = (await lan.call('POST /api/rpg/invite')).body.link;
  const add = await lan.call('POST /api/rpg/add', { link }, { user: { id: 'u2', name: 'Beto' } });
  assert.equal(add.code, 200);
  assert.equal(add.body.friend.name, 'Ana');
  // Another server on the LAN still is not reachable without it.
  const b = makeNode('Beto', B_URL);
  assert.equal((await b.call('POST /api/rpg/add', { link })).body.code, 'bad-address');
});

test('adding yourself is refused', async () => {
  const a = makeNode('Ana', A_URL);
  const link = (await a.call('POST /api/rpg/invite')).body.link;
  const r = await a.call('POST /api/rpg/add', { link });
  assert.equal(r.code, 400);
  assert.equal(r.body.code, 'self');
});

test('a friend server that cannot be reached: clear error, nothing stored', async () => {
  const b = makeNode('Beto', B_URL);
  const r = await b.call('POST /api/rpg/add', { link: `https://gone.example.com/#/rpg/invite/${'Q'.repeat(43)}` });
  assert.equal(r.code, 502);
  assert.equal(r.body.code, 'unreachable');
  assert.equal((await b.call('GET /api/rpg/friends')).body.friends.length, 0);
});

test('a link that is not an invite, or points at a private address, is refused before any call', async () => {
  const b = makeNode('Beto', B_URL);
  assert.equal((await b.call('POST /api/rpg/add', { link: 'hello' })).body.code, 'bad-link');
  const priv = await b.call('POST /api/rpg/add', { link: `https://192.168.1.9/#/rpg/invite/${'Q'.repeat(43)}` });
  assert.equal(priv.body.code, 'bad-address');
});

test('accept answers only valid / invalid, and validates what it is told', async () => {
  const a = makeNode('Ana', A_URL);
  const bad = await a.call('POST /api/rpg/accept', { token: 'x', publicKey: 'k', serverUrl: 'https://b.example.com', name: 'B' });
  assert.equal(bad.code, 400);
  const link = (await a.call('POST /api/rpg/invite')).body.link;
  const token = link.split('/').pop();
  const noKey = await a.call('POST /api/rpg/accept', { token, publicKey: 'short', serverUrl: 'https://b.example.com', name: 'B' });
  assert.equal(noKey.code, 400);
  const noUrl = await a.call('POST /api/rpg/accept', { token, publicKey: 'K'.repeat(43), serverUrl: 'http://10.0.0.5', name: 'B' });
  assert.equal(noUrl.code, 400);
  // The bad attempts did not burn the token.
  const ok = await a.call('POST /api/rpg/accept', { token, publicKey: 'K'.repeat(43), serverUrl: 'https://b.example.com', name: 'B' });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.serverUrl, A_URL);
  assert.equal(ok.body.name, 'Ana');
});

test('removing a friend', async () => {
  const a = makeNode('Ana', A_URL), b = makeNode('Beto', B_URL);
  const link = (await a.call('POST /api/rpg/invite')).body.link;
  const id = (await b.call('POST /api/rpg/add', { link })).body.friend.id;
  assert.equal((await b.call('POST /api/rpg/remove', { id })).code, 200);
  assert.equal((await b.call('POST /api/rpg/remove', { id })).code, 404);
  assert.equal((await b.call('GET /api/rpg/friends')).body.friends.length, 0);
});

test('off: status says so, every other route is 404 rpg-off; signed out is 401', async () => {
  const off = makeNode('Ana', A_URL, { enabled: false });
  assert.deepEqual((await off.call('GET /api/rpg/status')).body, { on: false });
  for (const key of ['GET /api/rpg/friends', 'POST /api/rpg/invite', 'POST /api/rpg/add', 'POST /api/rpg/accept', 'POST /api/rpg/remove']) {
    const r = await off.call(key, {});
    assert.equal(r.code, 404, key);
    assert.equal(r.body.code, 'rpg-off', key);
  }
  const on = makeNode('Beto', B_URL);
  assert.deepEqual((await on.call('GET /api/rpg/status')).body, { on: true });
  assert.equal((await on.call('GET /api/rpg/friends', null, { signedOut: true })).code, 401);
  assert.equal((await on.call('POST /api/rpg/invite', {}, { signedOut: true })).code, 401);
});

test('accept is rate limited', async () => {
  const a = makeNode('Ana', A_URL);
  let last;
  for (let i = 0; i < 40; i++) last = await a.call('POST /api/rpg/accept', { token: 'x' });
  assert.equal(last.code, 429);
});
