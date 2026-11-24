# RPG module (fork)

An opt-in module that turns your training into a character. **Settings → Modules → RPG** switches it
on (it is off for every profile until someone chooses it); then an **RPG** tab appears in the bottom bar, after Exercises.

Nothing is stored. Level, XP, attributes, title and badges are computed from your workouts every
time (`frontend/src/rpg/xp.js`), so devices, backups and imports always agree, and nothing needs
syncing. Switching the module off only hides it.

## XP

Per training day (several workouts on one day count as one day; a day needs at least one ticked-off
work set, so an empty workout or one with only warm-ups earns nothing):

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
the muscle map, each with its own level on one absolute scale (level L needs 10 x L x (L-1) sets),
so two people's attributes can be compared. Badges: first workout, 10/50/100 workouts, 4 and 12 week streaks.

## Where it touches the original code

Every edit outside `frontend/src/rpg/` is marked `rpg fork hook`. After merging upstream:

```bash
grep -rn "rpg fork hook" frontend/src
```

| File | Hook |
|---|---|
| `lib/modules.js` | the `rpg` entry, the `all` preset without it, `isOn` returning false for it |
| `lib/modules-copy.js` | its title and description |
| `App.jsx` | lazy imports and the `/rpg` and `/rpg/badges` routes |
| `components/TabBar.jsx` | the RPG tab, and the call to `useLevelUp` (the "Level up!" toast, a no-op with the module off) |
| `locales/*.js` | 16 keys appended at the end of each pack, under `rpg fork` (`pt-BR.js` has 2 overrides) |
| tests | `components/TabBar.test.jsx` (RPG tab cases), `modules.test.js`, `views/Modules.test.jsx` (RPG off by default), `lib/pt-br-locale.test.js` (inheritance fingerprint) |

If upstream adds a locale key at the end of a pack, the conflict is just two appended blocks: keep both.

The sheet also shows XP gained today and in the last 7 days, where the XP comes from
(consistency, performance, streak) and a link to the badges screen (`/rpg/badges`: every badge as a row, earned ones checked, locked ones with their progress). After a workout that
raises the level, a toast says so. The only thing remembered is the level last seen, per device and
profile, in `localStorage` (`opengym-rpg-level:<id>`), so a level-up is announced once.

## Known limits

- Sets logged by time or distance only (no weight x reps) earn the 50 for the day but no volume XP.
- The weekly streak bonus follows the core streak (`lib/streak.js`), which counts any saved workout,
  even an empty one. The module does not edit core code to change that.
- Imported history (Strong, Hevy) counts for the character in full.

## Friends (stage A of the competition, server side)

Off unless the server runs with `RPG=on` (and `RPG_ALLOW_LAN=1` to reach friends on a home network,
for tests). Then each profile gets an Ed25519 key pair, a friends list and one-time invite links
(48 hours), kept in `DATA_DIR/rpg/<userId>.json` (mode 600). Friends swap public keys through the
link: `POST /api/rpg/invite`, `POST /api/rpg/add` (this server calls the other one's
`POST /api/rpg/accept`), `GET /api/rpg/friends`, `POST /api/rpg/remove`. Nothing about training
moves yet: the signed log, the ranking and the flags are stages B and C
(`docs/superpowers/specs/2026-11-23-rpg-friends-design.md`).

Core hooks for it: `api/server.js` (import, `RPG` flags, the route spread, `rpg` in `/api/config`,
deleting a profile's file), `api/Dockerfile` (`COPY rpg`), `api/openapi.yaml` and
`scripts/build-api-docs.mjs` (docs), `api/test/openapi-routes.test.js` (route list), and the
regenerated `website/api.html`. Find them with `grep -rn "rpg fork hook" api scripts`.

## Not built yet

The signed workout log, the weekly ranking and the flags (stages B and C) are not built yet.

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

## Trying the fork next to your real instance

Run the fork as a second stack, with its own data folder, network and port, so your real openGym is
never touched. `scripts/fork/compose.rpg-test.yaml` is the compose file used for this (copy it to
the stack folder as `compose.yaml`, e.g. `/srv/stacks/opengym-rpg/`, next to a `.env`), and
`scripts/fork/deploy.sh` rebuilds and restarts it from this checkout.

`.env` for a LAN test over http (passkeys need https, so password login is on):

```
RP_ID=<server ip>
ORIGIN=http://<server ip>:8092
WEB_PORT=8092
PASSWORD_LOGIN=1
FIRST_USER_ADMIN=1
```

If Docker says `all predefined address pools have been fully subnetted`, keep the fixed `ipam`
subnet in the compose file and pick one that is free on your host (`ip route`).

### Bringing your real data over

A new stack starts empty. Two ways to get your history into it:

1. **From the app (safest).** In the real instance: Settings, export a backup. In the test one:
   create a user and import it. Nothing on the real instance is touched.
2. **Copy the data folder.** The files are usually owned by root, so this needs `sudo`. Stop only
   the test stack first, and keep a backup of its folder:

   ```bash
   cd /srv/stacks/opengym-rpg && docker compose down
   sudo cp -a data data.bak
   sudo cp -a /srv/stacks/opengym/data/db.json data/
   sudo cp -a /srv/stacks/opengym/data/state-*.json data/
   [ -d /srv/stacks/opengym/data/uploads ] && sudo cp -a /srv/stacks/opengym/data/uploads data/
   docker compose up -d
   ```

   Left out on purpose: `coach.json` and `coach/` (the test stack would talk to your AI provider
   and run scheduled reviews as well), `vapid.json` (push keys; the test stack keeps its own, so it
   does not send duplicate notifications) and `audit.log`.

   Sign in with your password. Passkeys will not work: they are bound to the real domain
   (`RP_ID`). If sign-in fails, the session key may be needed too:
   `sudo cp -a /srv/stacks/opengym/data/secret data/ && docker compose restart api`.

   It is a copy of one moment: later workouts in the real instance do not appear in the test one
   until you repeat the copy. To undo, `docker compose down`, `sudo rm -rf data && sudo mv data.bak data`,
   `docker compose up -d`.

Then switch the module on in the test instance: Settings, Modules, RPG. The RPG tab is in the bottom bar.
