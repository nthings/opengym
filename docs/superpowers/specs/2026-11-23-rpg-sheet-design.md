# RPG character sheet (module `rpg`): design

## Intent
Make training feel like a game, to stay motivated now and (later) to compete with friends,
without giving up openGym's private, self-hosted data. This first phase is the single-player
**character sheet**. Competition is phase 2.

## Goals
- A character sheet: level, XP, six attributes, titles and badges.
- Rewards both **consistency** (showing up, weekly streak) and **performance** (volume, PRs).
- Everything derived from existing data. **XP is never stored.**
- Easy to merge upstream updates: all new code in its own folders, only tiny hooks in core files.

## Non-goals (this phase)
- No animated or illustrated avatar (no new art).
- No friends, keys, invites or ranking (phase 2: server-to-server P2P, signed hash-chained
  workout summaries, each server recomputes XP, 24h rule, plausibility caps, flagging).
- No stored RPG state, no new server data, no sync changes.

## Anti-goals
- Rewriting or editing core files beyond the hooks below.
- Anything that makes a profile's data differ between devices.

## Approaches considered
1. **Compartment inside the fork (chosen):** `frontend/src/rpg/` with a handful of one-line hooks.
2. Separate app reading the API: zero merge conflicts, but not part of the app.
3. Generic plugin system: elegant, but far more work than the game itself.

## Design
- `frontend/src/rpg/xp.js` (pure, tested): `rpgState(S, today)` returns `{ level, xp, toNext,
  attributes, titles, badges }` computed from `S.workouts`. Same pattern as `lib/streak.js`.
  - Performance XP: working-set volume (warm-ups excluded via `isWarmupRow`) and PRs
    (reuse `lib/set-records.js`).
  - Consistency XP: workouts done, plus weekly-streak bonus via `streakInfo` (reuse, don't copy).
  - Both capped per day so one huge session can't dominate.
  - Attributes: six groups (legs, back, chest, shoulders, arms, core) from `lib/muscles.js`
    muscle credit per exercise.
- `frontend/src/rpg/RpgSheet.jsx`: the screen. Lazy loaded.
- Hooks in core (the only edits outside `rpg/`):
  1. `lib/modules.js`: one `MODULES` entry `rpg` (group extras). Off by default is **not**
     possible via `isOn` (missing key = on); builder to decide the least invasive way
     (e.g. include `rpg` in no preset except "Everything" and write `false` once on first run).
  2. `App.jsx`: `isOn(S,'rpg') && <Route path="/rpg" …>`.
  3. A Settings/Home entry point (one row or card).
  4. Locale: English text is the key, so no pack edits needed.
- Tests beside each file (`*.test.js`), matching the repo's conventions.

## Constraints
- Fork of AGPL-3.0 project: the fork must stay public.
- Frontend only for phase 1; works offline and on the phone apps.
- Follow CONTRIBUTING.md / CLAUDE.md of the repo.

## Left to the builder
XP formula numbers and level curve, title and badge names, screen layout, exact way to default
the module off, which Home/Settings spot hosts the entry point.
