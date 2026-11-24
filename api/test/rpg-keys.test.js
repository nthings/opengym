import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeys, sign, verify } from '../rpg/keys.js';
import { rpgStore } from '../rpg/store.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-'));

test('a signature verifies, and fails for another message or another key', () => {
  const a = createKeys(), b = createKeys();
  const sig = sign(a.privateKey, 'hello');
  assert.equal(verify(a.publicKey, 'hello', sig), true);
  assert.equal(verify(a.publicKey, 'hellO', sig), false);
  assert.equal(verify(b.publicKey, 'hello', sig), false);
  assert.equal(verify('not a key', 'hello', sig), false);
  assert.equal(verify(a.publicKey, 'hello', 'not a signature'), false);
});

test('public keys are 32 raw bytes, base64url', () => {
  const k = createKeys();
  assert.match(k.publicKey, /^[A-Za-z0-9_-]{43}$/);
});

test('load creates the keys once and keeps them', () => {
  const s = rpgStore(tmp());
  const first = s.load('u1');
  assert.deepEqual(first.friends, []);
  assert.deepEqual(first.invites, []);
  assert.equal(s.load('u1').keys.publicKey, first.keys.publicKey);
  assert.notEqual(s.load('u2').keys.publicKey, first.keys.publicKey);
});

test('the file is private (mode 600) and survives a save', () => {
  const dir = tmp();
  const s = rpgStore(dir);
  const doc = s.load('u1');
  doc.friends.push({ id: 'f1', name: 'Ana', serverUrl: 'https://x', publicKey: 'k', since: 1 });
  s.save('u1', doc);
  const file = path.join(dir, 'rpg', 'u1.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(rpgStore(dir).load('u1').friends[0].name, 'Ana');
});

test('a corrupt file is refused, not replaced with fresh keys', () => {
  const dir = tmp();
  const s = rpgStore(dir);
  s.load('u1');
  fs.writeFileSync(path.join(dir, 'rpg', 'u1.json'), '{ not json');
  assert.throws(() => rpgStore(dir).load('u1'), /unreadable/);
  assert.equal(fs.readFileSync(path.join(dir, 'rpg', 'u1.json'), 'utf8'), '{ not json');
});

test('user ids that could escape the folder are refused', () => {
  const s = rpgStore(tmp());
  assert.throws(() => s.load('../x'), /bad user id/);
});
