// Ed25519 keys for the RPG friends feature. A public key travels as 32 raw bytes in base64url (43
// characters); the private key stays on this server as PKCS8 DER in base64url.
import crypto from 'node:crypto';

const b64 = buf => Buffer.from(buf).toString('base64url');

export function createKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'jwk' }).x,
    privateKey: b64(privateKey.export({ format: 'der', type: 'pkcs8' })),
  };
}

export function sign(privateKey, message) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateKey, 'base64url'), format: 'der', type: 'pkcs8' });
  return b64(crypto.sign(null, Buffer.from(String(message)), key));
}

/** False for anything wrong, malformed keys and signatures included: it never throws. */
export function verify(publicKey, message, signature) {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(publicKey)) return false;
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(String(message)), key, Buffer.from(String(signature), 'base64url'));
  } catch { return false; }
}
