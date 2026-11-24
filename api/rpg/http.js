// One JSON POST to another openGym server, by node's own http(s) with net-guard's lookup, so the
// friends feature can only reach the addresses the webhooks may reach (private ones only with
// RPG_ALLOW_LAN). Answers { status, body } (body is null when it is not JSON) or throws.
import http from 'node:http';
import https from 'node:https';
import { outboundLookup } from '../net-guard.js';

const TIMEOUT_MS = 10000;
const READ_MAX = 64 * 1024;

export function makePost({ allowLan = false } = {}) {
  const agents = {
    'https:': new https.Agent({ lookup: outboundLookup({ allowLan }), keepAlive: false }),
    'http:': new http.Agent({ lookup: outboundLookup({ allowLan, plain: true }), keepAlive: false }),
  };
  return (url, obj) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = JSON.stringify(obj);
    const req = lib.request(u, {
      method: 'POST', agent: agents[u.protocol], timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'User-Agent': 'openGym-RPG' },
    }, res => {
      const chunks = []; let n = 0;
      res.on('data', d => { n += d.length; if (n > READ_MAX) return res.destroy(); chunks.push(d); });
      res.on('error', reject);
      res.on('close', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end(payload);
  });
}
