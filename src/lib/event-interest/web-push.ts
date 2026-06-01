import type { StoredPushSubscription } from './push-db';

type WebPushOptions = {
  publicKey: string;
  privateKey: string;
  subject: string;
  ttl?: number;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

const encoder = new TextEncoder();

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function uint32Bytes(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

async function hmacSign(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

function hkdfExtract(salt: Uint8Array, inputKeyMaterial: Uint8Array): Promise<Uint8Array> {
  return hmacSign(salt, inputKeyMaterial);
}

async function hkdfExpand(pseudoRandomKey: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const blocks: Uint8Array[] = [];
  let previous = new Uint8Array();

  for (let counter = 1; blocks.reduce((total, block) => total + block.length, 0) < length; counter += 1) {
    previous = await hmacSign(pseudoRandomKey, concatBytes(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
  }

  return concatBytes(...blocks).slice(0, length);
}

async function importVapidPrivateKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const publicKeyBytes = base64UrlToBytes(publicKey);
  const privateKeyBytes = base64UrlToBytes(privateKey);

  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4) {
    throw new Error('invalid_vapid_public_key');
  }
  if (privateKeyBytes.length !== 32) {
    throw new Error('invalid_vapid_private_key');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      d: bytesToBase64Url(privateKeyBytes),
      ext: false,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

async function vapidAuthorization(endpoint: string, options: WebPushOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: now + 12 * 60 * 60,
        sub: options.subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const key = await importVapidPrivateKey(options.publicKey, options.privateKey);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)),
  );

  return `vapid t=${signingInput}.${bytesToBase64Url(signature)}, k=${options.publicKey}`;
}

async function encryptPushPayload(subscription: StoredPushSubscription, payload: string): Promise<ArrayBuffer> {
  const userPublicKey = base64UrlToBytes(subscription.keys.p256dh);
  const authSecret = base64UrlToBytes(subscription.keys.auth);
  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey));
  const remotePublicKey = await crypto.subtle.importKey('raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: remotePublicKey }, localKeys.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyInfo = concatBytes(encoder.encode('WebPush: info\0'), userPublicKey, localPublicKey);
  const inputKeyMaterial = await hkdfExpand(await hkdfExtract(authSecret, sharedSecret), keyInfo, 32);
  const pseudoRandomKey = await hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = await hkdfExpand(pseudoRandomKey, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(pseudoRandomKey, encoder.encode('Content-Encoding: nonce\0'), 12);
  const plaintext = concatBytes(encoder.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));
  const recordSize = 4096;

  return concatBytes(salt, uint32Bytes(recordSize), new Uint8Array([localPublicKey.length]), localPublicKey, encrypted).buffer;
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: WebPushPayload,
  options: WebPushOptions,
): Promise<Response> {
  const body = JSON.stringify(payload);
  const encryptedBody = await encryptPushPayload(subscription, body);
  const authorization = await vapidAuthorization(subscription.endpoint, options);

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttl ?? 60 * 60 * 24),
      Urgency: 'normal',
    },
    body: encryptedBody,
  });
}
