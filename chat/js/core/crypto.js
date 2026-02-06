/**
 * ACG Chat - Crypto Utilities
 * Optional message signing for identity verification.
 */

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { publicKey, privateKey };
}

export async function signMessage(content, privateKeyJwk) {
  try {
    const key = await crypto.subtle.importKey(
      'jwk', privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign']
    );
    const data = new TextEncoder().encode(content);
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key, data
    );
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  } catch {
    return null;
  }
}

export async function verifySignature(content, signature, publicKeyJwk) {
  try {
    const key = await crypto.subtle.importKey(
      'jwk', publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify']
    );
    const data = new TextEncoder().encode(content);
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key, sigBytes, data
    );
  } catch {
    return false;
  }
}

export function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
