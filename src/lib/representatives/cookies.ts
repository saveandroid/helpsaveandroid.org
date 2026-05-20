const COOKIE_NAME = 'hsa_voter';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}

async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function hmacBase64Url(secret: string, value: string): Promise<string> {
  return toBase64Url(await hmacBytes(secret, value));
}

export async function hashVoterId(secret: string, voterId: string): Promise<string> {
  return hmacBase64Url(`db:${secret}`, voterId);
}

export async function signVoterId(secret: string, voterId: string): Promise<string> {
  return `${voterId}.${await hmacBase64Url(`cookie:${secret}`, voterId)}`;
}

export async function verifyVoterCookie(secret: string, cookieValue: string | undefined): Promise<string | null> {
  if (!secret || !cookieValue) return null;
  const [voterId, signature, extra] = cookieValue.split('.');
  if (!voterId || !signature || extra) return null;
  if (!/^[A-Za-z0-9_-]{24,96}$/.test(voterId)) return null;

  const expected = await hmacBase64Url(`cookie:${secret}`, voterId);
  return timingSafeEqual(signature, expected) ? voterId : null;
}

export function createVoterId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function createSignedVoterCookie(secret: string): Promise<{ voterId: string; value: string }> {
  const voterId = createVoterId();
  return {
    voterId,
    value: await signVoterId(secret, voterId),
  };
}

export function parseCookie(header: string | null, name = COOKIE_NAME): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return rawValue.join('=');
  }
  return undefined;
}

export function serializeVoterCookie(value: string): string {
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

export async function getExistingVoterHash(request: Request, secret: string): Promise<string | null> {
  const voterId = await verifyVoterCookie(secret, parseCookie(request.headers.get('Cookie')));
  return voterId ? hashVoterId(secret, voterId) : null;
}

export async function getOrCreateVoterHash(
  request: Request,
  secret: string,
): Promise<{ voterHash: string; setCookie?: string }> {
  const existingVoterId = await verifyVoterCookie(secret, parseCookie(request.headers.get('Cookie')));
  if (existingVoterId) {
    return { voterHash: await hashVoterId(secret, existingVoterId) };
  }

  const cookie = await createSignedVoterCookie(secret);
  return {
    voterHash: await hashVoterId(secret, cookie.voterId),
    setCookie: serializeVoterCookie(cookie.value),
  };
}

export const cookieInternalsForTests = {
  fromBase64Url,
  toBase64Url,
};
