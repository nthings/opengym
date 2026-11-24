import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeys } from '../rpg/keys.js';
import { cleanWorkout, createLogStore, syncLog, verifyEntries, materialize, LATE_MS } from '../rpg/log.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-'));
const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-23T20:00:00Z');
const wk = (id, d, extra = {}) => ({ id, d, name: 'Push', note: 'secret note', entries: [{ id: '0025', note: 'private', sets: [{ w: 100, r: 10, done: true, rpe: 8 }, { w: 60, r: 10, done: true, warmup: true }] }], prs: ['0025'], ...extra });

test('cleanWorkout keeps what a friend needs and drops everything private', () => {
  const c = cleanWorkout(wk('w1', '2026-11-23'));
  assert.deepEqual(c, { id: 'w1', d: '2026-11-23', name: 'Push', entries: [{ id: '0025', sets: [{ w: 100, r: 10, done: true }, { w: 60, r: 10, done: true, warmup: true }] }], prs: ['0025'] });
  assert.ok(!JSON.stringify(c).includes('secret'));
  assert.equal(cleanWorkout({ id: 'x', d: 'tomorrow' }), null);
  assert.equal(cleanWorkout({ id: '', d: '2026-11-23' }), null);
  assert.equal(cleanWorkout(null), null);
  assert.equal(cleanWorkout(wk('w', '2026-11-23', { name: 'n'.repeat(200) })).name.length, 80);
});

test('the log is a signed hash chain that a friend can verify', () => {
  const keys = createKeys(), store = createLogStore(tmp());
  syncLog({ store, uid: 'u1', keys, workouts: [wk('a', '2026-11-23'), wk('b', '2026-11-22')], now: NOW });
  const entries = store.read('u1');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(e => e.seq), [1, 2]);
  assert.equal(entries[1].prev, entries[0].hash);
  assert.equal(verifyEntries(entries, { publicKey: keys.publicKey, head: { seq: 0, hash: '' } }).ok, true);
});

test('tampering is detected: a changed workout, a dropped entry, a forged signature, another key', () => {
  const keys = createKeys(), store = createLogStore(tmp());
  syncLog({ store, uid: 'u1', keys, workouts: [wk('a', '2026-11-23'), wk('b', '2026-11-22'), wk('c', '2026-11-21')], now: NOW });
  const base = { publicKey: keys.publicKey, head: { seq: 0, hash: '' } };
  const good = store.read('u1');
  const edited = structuredClone(good); edited[1].workout.entries[0].sets[0].w = 300;
  assert.equal(verifyEntries(edited, base).ok, false);
  assert.equal(verifyEntries([good[0], good[2]], base).ok, false);
  const forged = structuredClone(good); forged[0].sig = forged[1].sig;
  assert.equal(verifyEntries(forged, base).ok, false);
  assert.equal(verifyEntries(good, { ...base, publicKey: createKeys().publicKey }).ok, false);
  // A page continues from a known head.
  assert.equal(verifyEntries(good.slice(1), { publicKey: keys.publicKey, head: { seq: 1, hash: good[0].hash } }).ok, true);
  assert.equal(verifyEntries(good.slice(1), { publicKey: keys.publicKey, head: { seq: 1, hash: 'wrong' } }).ok, false);
});

test('syncing the same state twice adds nothing', () => {
  const keys = createKeys(), store = createLogStore(tmp());
  const state = [wk('a', '2026-11-23')];
  assert.equal(syncLog({ store, uid: 'u1', keys, workouts: state, now: NOW }), 1);
  assert.equal(syncLog({ store, uid: 'u1', keys, workouts: state, now: NOW + HOUR }), 0);
  assert.equal(store.read('u1').length, 1);
});

test('a recent workout counts; an old or future one is flagged and an old one carries no content', () => {
  const keys = createKeys(), store = createLogStore(tmp());
  syncLog({ store, uid: 'u1', keys, workouts: [wk('today', '2026-11-23'), wk('old', '2026-10-01'), wk('future', '2026-12-30')], now: NOW });
  const by = Object.fromEntries(store.read('u1').map(e => [e.wid, e]));
  assert.equal(by.today.flag, '');
  assert.ok(by.today.workout);
  assert.equal(by.old.flag, 'late');
  assert.equal(by.old.workout, undefined);
  assert.equal(by.future.flag, 'future');
  // The 24 hour rule: logged a day late is fine, three days late is not.
  const s2 = createLogStore(tmp());
  syncLog({ store: s2, uid: 'u', keys, workouts: [wk('x', '2026-11-22')], now: Date.parse('2026-11-23T20:00:00Z') });
  assert.equal(s2.read('u')[0].flag, '');
  const s3 = createLogStore(tmp());
  syncLog({ store: s3, uid: 'u', keys, workouts: [wk('x', '2026-11-22')], now: Date.parse('2026-11-22T00:00:00Z') + LATE_MS + HOUR });
  assert.equal(s3.read('u')[0].flag, 'late');
});

test('editing a logged workout is a new entry flagged edited, removing one is a removed entry', () => {
  const keys = createKeys(), store = createLogStore(tmp());
  syncLog({ store, uid: 'u1', keys, workouts: [wk('a', '2026-11-23'), wk('b', '2026-11-23')], now: NOW });
  const changed = wk('a', '2026-11-23'); changed.entries[0].sets[0].w = 200;
  syncLog({ store, uid: 'u1', keys, workouts: [changed], now: NOW + HOUR });
  const all = store.read('u1');
  assert.equal(all.length, 4);
  assert.equal(all[2].flag, 'edited');
  assert.equal(all[2].wid, 'a');
  assert.equal(all[3].kind, 'removed');
  assert.equal(all[3].wid, 'b');
  const m = materialize(all);
  assert.equal(m.a.flag, 'edited');
  assert.equal(m.a.workout.entries[0].sets[0].w, 200);
  assert.equal(m.b, undefined);
});

test('a workout put back after removal counts as new again, and an unreadable log is refused', () => {
  const keys = createKeys(), dir = tmp(), store = createLogStore(dir);
  syncLog({ store, uid: 'u1', keys, workouts: [wk('a', '2026-11-23')], now: NOW });
  syncLog({ store, uid: 'u1', keys, workouts: [], now: NOW + HOUR });
  syncLog({ store, uid: 'u1', keys, workouts: [wk('a', '2026-11-23')], now: NOW + 2 * HOUR });
  assert.equal(materialize(store.read('u1')).a.flag, 'edited');
  fs.appendFileSync(path.join(dir, 'rpg', 'u1.log'), '{ not json\n');
  assert.throws(() => createLogStore(dir).read('u1'), /unreadable/);
});
