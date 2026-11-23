# RPG module (fork)

An opt-in module that turns your training into a character. **Settings → Modules → RPG** switches it
on (it is off for every profile until someone chooses it); **Settings → RPG** opens the sheet.

Nothing is stored. Level, XP, attributes, title and badges are computed from your workouts every
time (`frontend/src/rpg/xp.js`), so devices, backups and imports always agree, and nothing needs
syncing. Switching the module off only hides it.

## XP

Per training day (several workouts on one day count as one day):

| Source | XP |
|---|---|
| Showing up | 50 |
| Work sets ticked off | 1 per 100 kg of weight x reps (warm-ups excluded) |
| Personal record in the workout | 25 each |
| A session with stretching or cooldown work (catalogue category stretching, mobility, yoga, pilates or rehab) | 15 flat |

Performance XP (the last three rows) is capped at **400 a day**. On top of that, **25 XP per week of
your best weekly streak** (`lib/streak.js`).

Level N needs `50 * N * (N - 1)` XP in total: 100 for level 2, 300 for 3, 600 for 4.
Titles: Novice, Apprentice (5), Warrior (10), Champion (20), Legend (35).
Attributes (Legs, Back, Chest, Shoulders, Arms, Core) are the effective sets per muscle group from
the muscle map. Badges: first workout, 10/50/100 workouts, 4 and 12 week streaks.

## Where it touches the original code

Every edit outside `frontend/src/rpg/` is marked `rpg fork hook`. After merging upstream:

```bash
grep -rn "rpg fork hook" frontend/src
```

| File | Hook |
|---|---|
| `lib/modules.js` | the `rpg` entry, the `all` preset without it, `isOn` returning false for it |
| `lib/modules-copy.js` | its title and description |
| `App.jsx` | lazy import and the `/rpg` route |
| `views/Settings.jsx` | one row that opens the sheet |
| `locales/*.js` | 12 keys appended at the end of each pack, under `rpg fork` (`pt-BR.js` has 2 overrides) |
| tests | `modules.test.js`, `views/Modules.test.jsx` (RPG off by default), `lib/pt-br-locale.test.js` (inheritance fingerprint) |

If upstream adds a locale key at the end of a pack, the conflict is just two appended blocks: keep both.

## Not built yet

Competing with friends (server to server, signed hash-chained workout summaries, each server
recomputing the XP) is phase 2 and is not part of this module yet.

## Android APK

The phone apps load the same React bundle, so the RPG screen reaches them by rebuilding the APK.
The `APK` workflow (`.github/workflows/apk.yml`) builds a **debug sideload APK** on GitHub Actions:
Actions → APK → Run workflow, then download the `opengym-rpg-sideload-debug-apk` artifact.

- It installs as `ch.duartesantos.opengym.test` (a separate app next to the real one, its own data),
  so no signing key is needed and it does not replace your current app.
- To use it on your real data, sign in to your server from it (Settings → Server & sync).
- `versionCode` is not bumped on purpose: a different package needs no bump, and the line would
  conflict with every upstream release.
- A signed release APK that updates the real app in place needs your own signing key
  (`scripts/android/build-release.sh`); not set up here.
