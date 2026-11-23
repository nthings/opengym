# RPG friends and weekly ranking (phase 2): design

Builds on `2026-11-23-rpg-sheet-design.md`. Status: **draft, waiting for approval**.

## Intent
Compete with friends who run their own openGym fork, without a central server and without giving up
private, self-hosted data. Friends see each other's training; nobody else does.

## Goals
- Add a friend with a one-time invite link; remove one at any time.
- A weekly ranking (XP this week, streak) of you and your friends, plus a friend's recent workouts.
- Cheating is hard and visible: signed, hash-chained records stamped by the *source server's clock*,
  a 24 hour rule, and a flag that excludes a workout from your own ranking.
- Merges with upstream stay cheap: new code only in `api/rpg/` and `frontend/src/rpg/`.

## Non-goals
- No central server, relay or global ranking. No chat, comments or push notifications.
- No key rotation (revoke the friend and re-invite instead).
- Not proof of effort: someone can still log a believable workout they never did. Friends reviewing
  each other is the real deterrent.

## Anti-goals
- Sending notes, body weight, photos or health data. Only what a friend needs to review a workout.
- Changing core behaviour or the sync format. A server with `RPG` off behaves exactly as before.

## Approaches considered
1. **Pull model (chosen).** Each server publishes a signed, read-only feed; a friend's server fetches
   it when you open the ranking (cached). A friend who is offline just shows the last fetch.
2. Push model. Each save is sent to every friend; needs an outbox with retries and a queue per
   friend. More moving parts for the same result.
3. Central ranking service. Simplest, but it is the thing this project exists to avoid.

## Design

**Identity.** Each profile gets an Ed25519 key pair, created on first use, kept in
`DATA_DIR/rpg/<userId>.json`. Friends are stored as `{ id, name, serverUrl, publicKey, since }`.

**Invite (one-time, 48 h).** You create a link: `<your ORIGIN>/#/rpg/invite/<token>`. Your friend opens
RPG, Friends, Add, pastes it. Their server calls yours (`POST /api/rpg/accept` with the token, its
public key, its URL and name); yours stores them, burns the token and answers with your public key.
The screen first says what a friend will see (below).

**Feed.** `GET /api/rpg/feed?since=<seq>`, signed by the caller (`X-Rpg-Key`, `X-Rpg-Ts`, `X-Rpg-Sig`
over method, path and timestamp; refused outside 5 minutes or for a key that is not a friend).
Returns log entries: `{ seq, prev, hash, recordedAt, flag, workout }`, each signed with the sender's key.
`workout` is the same shape as `S.workouts` minus anything private: day, name, `entries[{ id, sets[{ w, r, done, warmup, type }] }]`, `prs`.

**The log.** After every state save (`PUT /api/data`, one hook in `server.js`) the server compares the
profile's finished workouts with its log and appends what is new, stamped with the server's clock.
- `recordedAt` more than 24 h after the workout's day: flag `late` (backfill, imports). Kept, shown, **not counted**.
- A workout already logged whose content changed: new entry, flag `edited`. **Not counted** until a friend accepts it.
- Deleted workouts: a `removed` entry (so a friend's chain never silently shrinks).
- Each entry's `hash` covers `prev`, so removing or rewriting history breaks the chain; the receiver
  detects it and marks that friend `chain broken`.

**Ranking, computed in the browser.** The server only verifies signatures and the chain and relays
entries. The browser feeds each friend's counted workouts to the **same `rpgState`** used for your own
sheet, so there is one XP formula and nothing to keep in sync. Boards: *XP this week* and *streak weeks*
(each viewer's own `weekStart`). The daily performance cap (400) already limits a single huge day.

**Fair play.** A friend's workouts of the week are visible with their sets. "Flag" excludes that workout
from *your* ranking only (kept on your server). A friend with a broken chain or 3 or more flagged
workouts in a week is shown with a warning and not ranked.

**What a friend sees:** workout day, name, exercises, sets, weights, reps, records. **Never:** notes,
body weight, photos, health data, other profiles. Removing a friend stops your feed; what they already
fetched stays on their server, and the invite screen says so.

**Parts.**
- Server, new `api/rpg/` (`keys.js`, `friends.js`, `log.js`, `routes.js`), enabled by `RPG=on` (default
  off). Hooks in core: one import, one route spread, one call after a state save. Routes documented in
  `openapi.yaml` (the repo's docs check requires it).
- Outbound fetches reuse `net-guard.js` (`ALLOWED_PRIVATE_IPS` for LAN testing).
- Frontend: `rpg/Friends.jsx` (list, invite, leaderboard, friend detail, flag) at `/rpg/friends`, a
  link row on the sheet, one more route hook, new strings in the 24 locales.

**Build order, each step tested and shippable:** (A) keys, invite, accept, friends list; (B) log + feed
+ fetching + leaderboard; (C) late/edited rules, flagging, chain-broken warning. Two-server tests use a
second local instance (port 8093) with `ALLOWED_PRIVATE_IPS`.

## Constraints
- Every friend's server must be reachable over HTTPS from the others (a public address or a tunnel).
- AGPL fork stays public. The log adds to the profile's data folder (small, text only).

## Decided by me (change if you disagree)
24 h late window; "edited" workouts not counted until accepted; 3 flags to unrank; weeks follow the
viewer's `weekStart`; one key pair per profile (not per server); XP computed in the browser.

## Left to the builder
Entry encoding and hashing details, exact error codes, cache lifetime, layout of the friends screens.
