function base64UrlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function bufferToBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

const keyPair = await crypto.subtle.generateKey(
  {
    name: 'ECDSA',
    namedCurve: 'P-256',
  },
  true,
  ['sign', 'verify'],
);
const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

const x = base64UrlToBuffer(privateJwk.x);
const y = base64UrlToBuffer(privateJwk.y);
const d = base64UrlToBuffer(privateJwk.d);
const publicKey = bufferToBase64Url(Buffer.concat([Buffer.from([4]), x, y]));
const privateKey = bufferToBase64Url(d);

console.log(`HSA_WEB_PUSH_PUBLIC_KEY=${publicKey}`);
console.log(`HSA_WEB_PUSH_PRIVATE_KEY=${privateKey}`);
