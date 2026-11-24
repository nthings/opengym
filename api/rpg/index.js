// The RPG friends feature as server.js sees it: routes, plus the two hooks the core calls (a state
// was saved; a profile was deleted). Everything is inert with `enabled` false.
import fs from 'node:fs';
import path from 'node:path';
import { rpgStore } from './store.js';
import { createLogStore, syncLog } from './log.js';
import { rpgRoutes } from './routes.js';

export function createRpg(opts) {
  const { dataDir, enabled, now = Date.now } = opts;
  const store = rpgStore(dataDir);
  const log = createLogStore(dataDir);
  const routes = rpgRoutes({ ...opts, store, log });

  return {
    dataDir, routes,
    /** After a profile's state was saved. Only profiles that opened the feature have a log. */
    onStateWrite(uid, state) {
      if (!enabled || !store.has(uid)) return;
      syncLog({ store: log, uid, keys: store.load(uid).keys, workouts: state?.workouts, now: now() });
    },
    /** A deleted profile takes its keys, friends and log with it. */
    removeUser(uid) {
      log.remove(uid);
      try { fs.rmSync(path.join(dataDir, 'rpg', uid + '.json'), { force: true }); } catch { /* nothing to remove */ }
    },
  };
}
