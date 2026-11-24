// One file per profile in DATA_DIR/rpg/<userId>.json: the key pair, the friends and the open
// invites. Written atomically and kept mode 600 (it holds the private key).
import fs from 'node:fs';
import path from 'node:path';
import { createKeys } from './keys.js';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function rpgStore(dataDir) {
  const dir = path.join(dataDir, 'rpg');
  const fileOf = uid => {
    if (!ID_RE.test(String(uid))) throw new Error('bad user id');
    return path.join(dir, uid + '.json');
  };

  function save(uid, doc) {
    const file = fileOf(uid);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(doc), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function load(uid) {
    const file = fileOf(uid);
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const doc = { keys: createKeys(), friends: [], invites: [] };
      save(uid, doc);
      return doc;
    }
    // A damaged file is never replaced with fresh keys: that would cut every friend off silently.
    let doc;
    try { doc = JSON.parse(raw); } catch { doc = null; }
    if (!doc || !doc.keys?.publicKey || !doc.keys?.privateKey) throw new Error('rpg file unreadable: ' + path.basename(file));
    doc.friends = Array.isArray(doc.friends) ? doc.friends : [];
    doc.invites = Array.isArray(doc.invites) ? doc.invites : [];
    return doc;
  }

  /** Every profile id that has a file, for the one route that has no session (accept). */
  const ids = () => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch { return []; } };

  return { load, save, ids };
}
