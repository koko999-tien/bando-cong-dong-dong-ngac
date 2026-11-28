/**
 * W3C WEB PUSH PROTOCOL (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)
 * Thuần Node.js `node:crypto` — Không cần thư viện ngoài, bảo vệ Zero-Standing-Location.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, get } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_VAPID_FILE = path.resolve(__dirname, '..', '..', '.local-data', 'vapid-keys.json');
const LOCAL_SUBS_FILE = path.resolve(__dirname, '..', '..', '.local-data', 'push-subs.json');

const VAPID_BLOB_PATH = 'config/vapid-keys.json';
const SUBS_BLOB_PATH = 'config/push-subs.json';
const PUSH_TTL_MS = 24 * 60 * 60 * 1000;

let cachedVapidKeys = null;
let localWriteChain = Promise.resolve();

async function readPrivateStoreJson(blobPath, localFile, fallbackVal) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const res = await get(blobPath, { access: 'private', useCache: false });
      if (res && res.statusCode === 200 && res.stream) {
        return await new Response(res.stream).json();
      }
    } catch {
      return fallbackVal;
    }
    return fallbackVal;
  }
  try {
    return JSON.parse(await fs.readFile(localFile, 'utf8'));
  } catch {
    return fallbackVal;
  }
}

async function writePrivateStoreJson(blobPath, localFile, obj) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(blobPath, JSON.stringify(obj), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return;
  }
  const next = localWriteChain.then(async () => {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(obj, null, 2), 'utf8');
  });
  localWriteChain = next.catch(() => {});
  await next;
}

function jwkToUncompressedPublicKey(jwk) {
  const x = Buffer.from(String(jwk?.x || ''), 'base64url');
  const y = Buffer.from(String(jwk?.y || ''), 'base64url');
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('INVALID_VAPID_JWK_COORDS');
  }
  return Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url');
}

export async function getOrCreateVapidKeys() {
  if (process.env.VAPID_JWK_JSON) {
    try {
      const jwk = JSON.parse(process.env.VAPID_JWK_JSON);
      return { jwk, publicKey: jwkToUncompressedPublicKey(jwk), source: 'env_jwk' };
    } catch {
      // fall through
    }
  }
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const pubRaw = Buffer.from(process.env.VAPID_PUBLIC_KEY.trim(), 'base64url');
    if (pubRaw.length === 65 && pubRaw[0] === 0x04) {
      const jwk = {
        kty: 'EC',
        crv: 'P-256',
        x: pubRaw.subarray(1, 33).toString('base64url'),
        y: pubRaw.subarray(33, 65).toString('base64url'),
        d: process.env.VAPID_PRIVATE_KEY.trim()
      };
      return { jwk, publicKey: process.env.VAPID_PUBLIC_KEY.trim(), source: 'env' };
    }
  }
  if (cachedVapidKeys) return cachedVapidKeys;

  const stored = await readPrivateStoreJson(VAPID_BLOB_PATH, LOCAL_VAPID_FILE, null);
  if (stored?.jwk?.d && stored?.jwk?.x && stored?.jwk?.y) {
    cachedVapidKeys = {
      jwk: stored.jwk,
      publicKey: jwkToUncompressedPublicKey(stored.jwk),
      source: process.env.BLOB_READ_WRITE_TOKEN ? 'private_blob' : 'local_store'
    };
    return cachedVapidKeys;
  }

  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = jwkToUncompressedPublicKey(jwk);
  const record = {
    jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
    publicKey,
    createdAt: new Date().toISOString()
  };
  await writePrivateStoreJson(VAPID_BLOB_PATH, LOCAL_VAPID_FILE, record);
  cachedVapidKeys = {
    jwk: record.jwk,
    publicKey,
    source: process.env.BLOB_READ_WRITE_TOKEN ? 'private_blob' : 'local_store'
  };
  return cachedVapidKeys;
}

export function buildVapidAuthHeader(endpoint, subject, keys) {
  const aud = new URL(endpoint).origin;
  const hdr = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const pay = Buffer.from(
    JSON.stringify({
      aud,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: subject || 'mailto:ops@bando-antoan-vn.vercel.app'
    })
  ).toString('base64url');
  const signingInput = `${hdr}.${pay}`;
  const privKeyObj = crypto.createPrivateKey({ key: keys.jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: privKeyObj,
    dsaEncoding: 'ieee-p1363'
  });
  return `vapid t=${signingInput}.${sig.toString('base64url')}, k=${keys.publicKey}`;
}

/**
 * Mã hóa gói tin Web Push theo chuẩn RFC 8291 (`aes128gcm`) & RFC 8188.
 */
export function encryptWebPushPayload(plaintextJson, subscriptionKeys) {
  const uaPublic = Buffer.from(String(subscriptionKeys?.p256dh || ''), 'base64url');
  const authSecret = Buffer.from(String(subscriptionKeys?.auth || ''), 'base64url');
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('INVALID_SUBSCRIPTION_P256DH');
  }
  if (authSecret.length !== 16) {
    throw new Error('INVALID_SUBSCRIPTION_AUTH');
  }

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16)
  );
  const nonce = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12)
  );

  const plainStr = typeof plaintextJson === 'string' ? plaintextJson : JSON.stringify(plaintextJson);
  const padded = Buffer.concat([Buffer.from(plainStr, 'utf8'), Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  const header = Buffer.alloc(86);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(65, 20);
  asPublic.copy(header, 21);

  return {
    bodyBuffer: Buffer.concat([header, ciphertextWithTag]),
    salt,
    asPublic,
    cek,
    nonce
  };
}

function pruneActiveSubs(rawList) {
  const now = Date.now();
  return (Array.isArray(rawList) ? rawList : [])
    .filter((s) => s && s.subHash && s.subscription?.endpoint && Number(s.expiresAtMs || 0) > now)
    .slice(0, 300);
}

export async function savePushSubscription({ responderId, trustTier = 'citizen', geohash5, subscription }) {
  if (!responderId || !geohash5 || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('INVALID_PUSH_SUBSCRIPTION');
  }
  const subHash = crypto.createHash('sha256').update(String(subscription.endpoint)).digest('hex').slice(0, 32);
  const nowMs = Date.now();
  const expiresAtMs = nowMs + PUSH_TTL_MS;
  const entry = {
    subHash,
    responderId: String(responderId).slice(0, 64),
    trustTier: String(trustTier || 'citizen').slice(0, 32),
    geohash5: String(geohash5).slice(0, 8),
    subscription: {
      endpoint: String(subscription.endpoint),
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth)
      }
    },
    updatedAt: new Date(nowMs).toISOString(),
    expiresAtMs
  };

  const rawList = await readPrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, []);
  const active = pruneActiveSubs(rawList).filter((s) => s.subHash !== subHash);
  active.unshift(entry);
  await writePrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, active.slice(0, 300));

  const edgeUrl = String(process.env.CF_EDGE_API_URL || '').replace(/\/+$/, '');
  const edgeToken = String(process.env.CF_EDGE_AUTH_TOKEN || '').trim();
  if (edgeUrl && edgeToken) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    fetch(`${edgeUrl}/push/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${edgeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responderId: entry.responderId,
        geohash5: entry.geohash5,
        subscription: entry.subscription
      }),
      signal: ctrl.signal
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }

  return entry;
}

export async function removePushSubscriptionsForUser(responderId) {
  if (!responderId) return 0;
  const rawList = await readPrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, []);
  const active = pruneActiveSubs(rawList);
  const next = active.filter((s) => s.responderId !== String(responderId));
  if (next.length !== active.length) {
    await writePrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, next);
  }
  return active.length - next.length;
}

export async function getPushStats() {
  const rawList = await readPrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, []);
  const active = pruneActiveSubs(rawList);
  const uniqueCells = new Set(active.map((s) => s.geohash5).filter(Boolean)).size;
  return {
    activeCount: active.length,
    uniqueCells
  };
}

export async function dispatchWebPushToCell({ geohash5 = '', broadcastAll = false, officialOnly = false, payload }) {
  const rawList = await readPrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, []);
  const active = pruneActiveSubs(rawList);
  const targets = active.filter((s) => {
    if (officialOnly && s.trustTier !== 'official_unit') return false;
    if (broadcastAll) return true;
    return geohash5 && (s.geohash5 === geohash5 || s.geohash5.slice(0, 4) === geohash5.slice(0, 4));
  });

  if (targets.length === 0) {
    return { attempted: 0, delivered: 0, expiredCleaned: 0 };
  }

  const keys = await getOrCreateVapidKeys();
  const expiredHashes = new Set();
  let delivered = 0;

  await Promise.allSettled(
    targets.slice(0, 80).map(async (subEntry) => {
      try {
        const { bodyBuffer } = encryptWebPushPayload(payload, subEntry.subscription.keys);
        const authHdr = buildVapidAuthHeader(
          subEntry.subscription.endpoint,
          'mailto:ops@bando-antoan-vn.vercel.app',
          keys
        );
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2200);
        try {
          const res = await fetch(subEntry.subscription.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aes128gcm',
              TTL: '1800',
              Urgency: 'high',
              Authorization: authHdr
            },
            body: bodyBuffer,
            signal: ctrl.signal
          });
          if (res.status === 404 || res.status === 410) {
            expiredHashes.add(subEntry.subHash);
          } else if (res.ok || res.status === 201) {
            delivered += 1;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // non-blocking delivery
      }
    })
  );

  if (expiredHashes.size > 0) {
    const remaining = active.filter((s) => !expiredHashes.has(s.subHash));
    await writePrivateStoreJson(SUBS_BLOB_PATH, LOCAL_SUBS_FILE, remaining);
  }

  return {
    attempted: targets.length,
    delivered,
    expiredCleaned: expiredHashes.size
  };
}
