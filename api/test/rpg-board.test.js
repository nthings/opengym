import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRpg } from '../rpg/index.js';
import { createKeys } from '../rpg/keys.js';
import { signRequest } from '../rpg/feed.js';

const NOW = Date.parse('2026-11-23T20:00:00Z');
const wk = (id, d, w = 100) => ({ id, d, name: 'Push', entries: [{ id: '0025', sets: [{ w, r: 10, done: true }] }] });
const nodes = {};

function makeNode(name, origin, { page = 500, users = null } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-'));
  const clock = { now: NOW };
  const json = (res, code, obj) => { res.code = code; res.body = obj; };
  const net = {
    post: async (url, body) => {
      const host = Object.keys(nodes).find(h => url.startsWith(h));
      if (!host) throw Object.assign(new Error('no route to host'), { code: 'ENOTFOUND' });
      const res = {};
      await nodes[host].rpg.routes['POST /api/rpg/accept']({ body, headers: {} }, res);
      return { status: res.code, body: res.body };
    },
    get: async (url, headers) => {
      const host = Object.keys(nodes).find(h => url.startsWith(h));
      if (!host) throw Object.assign(new Error('no route to host'), { code: 'ENOTFOUND' });
      const res = {};
      await nodes[host].rpg.routes['GET /api/rpg/feed']({ headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), url: url.slice(host.length) }, res);
      return { status: res.code, body: JSON.parse(JSON.stringify(res.body)) };
    },
  };
  const node = { origin, clock, net, users: users || { u1: name } };
  node.rpg = createRpg({
    json, readBody: async req => req.body || {}, readSession: req => (req.signedOut ? null : req.user || { id: 'u1', name }),
    dataDir, origin, enabled: true, allowLan: false, post: (u, b) => node.net.post(u, b), get: (u, h) => node.net.get(u, h),
    now: () => clock.now, nameOf: uid => node.users[uid] || name, feedPage: page,
  });
  node.call = async (key, body, extra = {}) => { const res = {}; await node.rpg.routes[key]({ body, headers: {}, ...extra }, res); return res; };
  node.save = (uid, workouts, unit = 'kg') => node.rpg.onStateWrite(uid, { workouts, unit });
  nodes[origin] = node;
  return node;
}
async function befriend(a, b, { aUser, bUser } = {}) {
  const link = (await a.call('POST /api/rpg/invite', {}, aUser ? { user: aUser } : {})).body.link;
  const r = await b.call('POST /api/rpg/add', { link }, bUser ? { user: bUser } : {});
  assert.equal(r.code, 200, JSON.stringify(r.body));
}
const A = 'https://a.example.com', B = 'https://b.example.com';
const board = async (n, extra) => (await n.call('GET /api/rpg/board', null, extra)).body;

test('a friend sees my counted workouts with their sets, and I see my own', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('w1', '2026-11-23')]);
  const bb = await board(b);
  assert.equal(bb.friends.length, 1);
  assert.equal(bb.friends[0].name, 'Ana');
  assert.equal(bb.friends[0].error, null);
  assert.equal(bb.friends[0].broken, null);
  assert.equal(bb.friends[0].workouts.length, 1);
  assert.equal(bb.friends[0].workouts[0].flag, '');
  assert.equal(bb.friends[0].workouts[0].workout.entries[0].sets[0].w, 100);
  const aa = await board(a);
  assert.equal(aa.me.name, 'Ana');
  assert.equal(aa.me.workouts.length, 1);
});

test('the board is cached for 30 seconds, then picks up what is new', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('w1', '2026-11-23')]);
  assert.equal((await board(b)).friends[0].workouts.length, 1);
  a.save('u1', [wk('w1', '2026-11-23'), wk('w2', '2026-11-23')]);
  assert.equal((await board(b)).friends[0].workouts.length, 1);
  b.clock.now += 60000; a.clock.now += 60000;
  assert.equal((await board(b)).friends[0].workouts.length, 2);
});

test('old history is in the chain but not in the board', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('old', '2026-01-05'), wk('w1', '2026-11-23')]);
  const f = (await board(b)).friends[0];
  assert.equal(f.broken, null);
  assert.deepEqual(f.workouts.map(w => w.wid), ['w1']);
});

test('a page size smaller than the log is read to the end', async () => {
  const a = makeNode('Ana', A, { page: 2 }), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', ['1', '2', '3', '4', '5'].map(i => wk('w' + i, '2026-11-23')));
  assert.equal((await board(b)).friends[0].workouts.length, 5);
});

test('a feed that was changed on the way is refused and the friend is marked broken', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('w1', '2026-11-23')]);
  const real = b.net.get;
  b.net.get = async (u, h) => { const r = await real(u, h); r.body.entries[0].workout.entries[0].sets[0].w = 999; return r; };
  const f = (await board(b)).friends[0];
  assert.equal(f.broken, 'workout');
  assert.deepEqual(f.workouts, []);
});

test('a history that stops adding up later marks the friend broken and it stays so', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('w1', '2026-11-23')]);
  assert.equal((await board(b)).friends[0].broken, null);
  a.save('u1', [wk('w1', '2026-11-23'), wk('w2', '2026-11-23')]);
  const real = b.net.get;
  b.net.get = async (u, h) => { const r = await real(u, h); r.body.entries[0].prev = 'rewritten'; return r; };
  b.clock.now += 60000; a.clock.now += 60000;
  assert.equal((await board(b)).friends[0].broken, 'chain');
  b.net.get = real; b.clock.now += 60000;
  assert.equal((await board(b)).friends[0].broken, 'chain');
});

test('the feed answers only signed requests from friends', async () => {
  const a = makeNode('Ana', A);
  const doc = (await a.call('GET /api/rpg/friends')).body;
  const stranger = createKeys();
  const sign = (keys, to, p, now = NOW) => signRequest(keys, { to, path: p, now });
  const ask = async (headers, p = '/api/rpg/feed?since=0') => {
    const res = {}; await a.rpg.routes['GET /api/rpg/feed']({ headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), url: p }, res); return res;
  };
  assert.equal((await ask({})).code, 401);
  assert.equal((await ask(sign(stranger, doc.publicKey, '/api/rpg/feed?since=0'))).code, 404); // signed, but not a friend
  assert.equal((await ask(sign(stranger, doc.publicKey, '/api/rpg/feed?since=0', NOW - 10 * 60000))).code, 401); // stale
  assert.equal((await ask(sign(stranger, doc.publicKey, '/api/rpg/feed?since=5'), '/api/rpg/feed?since=0')).code, 401); // another path
  const forged = sign(stranger, doc.publicKey, '/api/rpg/feed?since=0'); forged['X-Rpg-Sig'] = forged['X-Rpg-Sig'].slice(0, -3) + 'AAA';
  assert.equal((await ask(forged)).code, 401);
});

test('an unreachable friend is reported without losing the others', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B), c = makeNode('Cris', 'https://c.example.com');
  await befriend(a, b); await befriend(c, b);
  a.save('u1', [wk('w1', '2026-11-23')]);
  delete nodes[A];
  const fs_ = (await board(b)).friends;
  assert.equal(fs_.find(f => f.name === 'Ana').error, 'unreachable');
  assert.equal(fs_.find(f => f.name === 'Cris').error, null);
});

test('a friend who removed me stops answering', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  const bId = (await a.call('GET /api/rpg/friends')).body.friends[0].id;
  await a.call('POST /api/rpg/remove', { id: bId });
  assert.equal((await board(b)).friends[0].error, 'not-friends');
});

test('two profiles on one server see each other with no network', async () => {
  const a = makeNode('Ana', A, { users: { u1: 'Ana', u2: 'Beto' } });
  const beto = { id: 'u2', name: 'Beto' };
  await befriend(a, a, { bUser: beto });
  a.save('u1', [wk('w1', '2026-11-23')]);
  const f = (await board(a, { user: beto })).friends[0];
  assert.equal(f.name, 'Ana');
  assert.equal(f.error, null);
  assert.equal(f.workouts.length, 1);
});

test('a profile that never opened the feature has no log, and off answers rpg-off', async () => {
  const a = makeNode('Ana', A);
  a.save('u9', [wk('w1', '2026-11-23')]);
  assert.equal(fs.existsSync(path.join(a.rpg.dataDir, 'rpg', 'u9.log')), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-'));
  const json = (res, code, obj) => { res.code = code; res.body = obj; };
  const off = createRpg({ json, readBody: async () => ({}), readSession: () => ({ id: 'u1', name: 'x' }), dataDir: dir, origin: A, enabled: false });
  for (const key of ['GET /api/rpg/board', 'GET /api/rpg/feed']) {
    const res = {}; await off.routes[key]({ headers: {}, url: '/api/rpg/feed' }, res);
    assert.equal(res.code, 404, key);
    assert.equal(res.body.code, 'rpg-off', key);
  }
  assert.doesNotThrow(() => off.onStateWrite('u1', { workouts: [] }));
});

test('the feed says which unit the weights are in', async () => {
  const a = makeNode('Ana', A), b = makeNode('Beto', B);
  await befriend(a, b);
  a.save('u1', [wk('w1', '2026-11-23')], 'lb');
  const f = (await board(b)).friends[0];
  assert.equal(f.unit, 'lb');
  assert.equal(f.workouts[0].workout.entries[0].sets[0].w, 100); // untouched: the reader converts
  a.save('u1', [wk('w1', '2026-11-23')], 'kg');
  b.clock.now += 60000; a.clock.now += 60000;
  assert.equal((await board(b)).friends[0].unit, 'kg');
});
