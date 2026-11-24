// JSON calls to another openGym server, by node's own http(s) with net-guard's lookup, so the
// friends feature can only reach the addresses the webhooks may reach (private ones only with
// RPG_ALLOW_LAN). Each answers { status, body } (body is null when it is not JSON) or throws.
import http from 'node:http';
import https from 'node:https';
import { outboundLookup } from '../net-guard.js';

const TIMEOUT_MS = 10000;
const READ_MAX = 2 * 1024 * 1024; // a page of the feed

export function makeClient({ allowLan = false } = {}) {
  const agents = {
    'https:': new https.Agent({ lookup: outboundLookup({ allowLan }), keepAlive: false }),
    'http:': new http.Agent({ lookup: outboundLookup({ allowLan, plain: true }), keepAlive: false }),
  };
  const call = (method, url, obj, headers = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = obj === undefined ? null : JSON.stringify(obj);
    const req = lib.request(u, {
      method, agent: agents[u.protocol], timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'openGym-RPG', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
    }, res => {
      const chunks = []; let n = 0, over = false;
      res.on('data', d => { n += d.length; if (n > READ_MAX) { over = true; return res.destroy(); } chunks.push(d); });
      res.on('error', reject);
      res.on('close', () => {
        if (over) return reject(Object.assign(new Error('answer too large'), { code: 'ETOOBIG' }));
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end(payload || undefined);
  });
  return { post: (url, obj) => call('POST', url, obj), get: (url, headers) => call('GET', url, undefined, headers) };
}
