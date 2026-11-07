// Everything that leaves the device is gzipped, then encrypted with AES-256-GCM.
// The key comes from the passphrase via PBKDF2 and never leaves the device.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';

export const DEFAULT_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'health-dashboard-key-check';

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** WebCrypto wants ArrayBuffer-backed views; fflate returns ArrayBufferLike ones. */
const ab = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u);

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(passphrase: string, saltB64: string, iterations = DEFAULT_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', ab(strToU8(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(saltB64), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // not exportable: the raw key can't be read back out of the browser
    ['encrypt', 'decrypt']
  );
}

export interface Envelope {
  v: 1;
  alg: 'A256GCM+gzip';
  iv: string;
  ct: string;
}

/** `aad` binds the ciphertext to its file path, so files can't be swapped around. */
export async function sealJson(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = gzipSync(strToU8(JSON.stringify(value)));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ab(strToU8(aad)) }, key, ab(plain));
  const env: Envelope = { v: 1, alg: 'A256GCM+gzip', iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  return JSON.stringify(env);
}

export async function openJson<T>(key: CryptoKey, text: string, aad: string): Promise<T> {
  const env = JSON.parse(text) as Envelope;
  if (env.v !== 1 || env.alg !== 'A256GCM+gzip') throw new Error('Unknown file format');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(env.iv), additionalData: ab(strToU8(aad)) },
    key,
    b64ToBytes(env.ct)
  );
  return JSON.parse(strFromU8(gunzipSync(new Uint8Array(plain)))) as T;
}

export const makeVerifier = (key: CryptoKey) => sealJson(key, VERIFIER_TEXT, 'meta');

export async function checkVerifier(key: CryptoKey, verifier: string): Promise<boolean> {
  try {
    return (await openJson<string>(key, verifier, 'meta')) === VERIFIER_TEXT;
  } catch {
    return false;
  }
}
