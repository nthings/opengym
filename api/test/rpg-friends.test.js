import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvite, consumeInvite, addFriend, removeFriend, friendIdOf, parseInviteLink, INVITE_TTL_MS } from '../rpg/friends.js';

const doc = () => ({ keys: { publicKey: 'p', privateKey: 'x' }, friends: [], invites: [] });
const KEY = 'A'.repeat(43);

test('an invite token works once', () => {
  const d = doc();
  const { token } = createInvite(d, 1000);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(consumeInvite(d, token, 2000), true);
  assert.equal(consumeInvite(d, token, 2000), false);
});

test('only the hash of a token is stored', () => {
  const d = doc();
  const { token } = createInvite(d, 1000);
  assert.ok(!JSON.stringify(d).includes(token));
});

test('an invite expires after 48 hours, and a wrong token never works', () => {
  const d = doc();
  const { token } = createInvite(d, 0);
  assert.equal(consumeInvite(d, token + 'x', 10), false);
  assert.equal(consumeInvite(d, token, INVITE_TTL_MS + 1), false);
  const d2 = doc();
  const t2 = createInvite(d2, 0).token;
  assert.equal(consumeInvite(d2, t2, INVITE_TTL_MS - 1), true);
  assert.equal(consumeInvite(d2, 12345, 0), false);
  assert.equal(consumeInvite(d2, null, 0), false);
});

test('creating an invite drops the expired ones and keeps at most 10 open', () => {
  const d = doc();
  createInvite(d, 0);
  createInvite(d, INVITE_TTL_MS + 5);
  assert.equal(d.invites.length, 1);
  for (let i = 0; i < 20; i++) createInvite(d, INVITE_TTL_MS + 6 + i);
  assert.equal(d.invites.length, 10);
});

test('the same public key twice updates the friend instead of duplicating it', () => {
  const d = doc();
  addFriend(d, { name: 'Ana', serverUrl: 'https://a.example', publicKey: KEY }, 5);
  addFriend(d, { name: 'Ana B', serverUrl: 'https://a2.example', publicKey: KEY }, 9);
  assert.equal(d.friends.length, 1);
  assert.deepEqual(d.friends[0], { id: friendIdOf(KEY), name: 'Ana B', serverUrl: 'https://a2.example', publicKey: KEY, since: 5 });
});

test('removing a friend', () => {
  const d = doc();
  addFriend(d, { name: 'Ana', serverUrl: 'https://a.example', publicKey: KEY }, 5);
  assert.equal(removeFriend(d, friendIdOf(KEY)), true);
  assert.equal(removeFriend(d, friendIdOf(KEY)), false);
  assert.deepEqual(d.friends, []);
});

test('names are trimmed and capped', () => {
  const d = doc();
  addFriend(d, { name: '  ' + 'n'.repeat(100) + '  ', serverUrl: 'https://a.example', publicKey: KEY }, 5);
  assert.equal(d.friends[0].name.length, 40);
});

test('invite links: the server and the token', () => {
  const tok = 'B'.repeat(43);
  assert.deepEqual(parseInviteLink(`https://gym.example.com/#/rpg/invite/${tok}`), { base: 'https://gym.example.com', token: tok });
  assert.deepEqual(parseInviteLink(`  http://192.168.1.5:8092/#/rpg/invite/${tok}  `), { base: 'http://192.168.1.5:8092', token: tok });
  for (const bad of ['', null, 'nope', `https://x.example/#/rpg/invite/short`, `ftp://x.example/#/rpg/invite/${tok}`, `https://u:p@x.example/#/rpg/invite/${tok}`, `https://x.example/rpg/invite/${tok}`]) {
    assert.equal(parseInviteLink(bad), null, String(bad));
  }
});
