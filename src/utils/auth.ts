import {db} from '../db/dexie';
import {isSupabaseConfigured, supabase} from '../lib/supabase';
import type {WorkshopUser} from '../types/database';

export const INITIAL_WORKSHOP_PASSWORD = 'zercauto2026';
const HASH_SALT = 'zercauto-gest-v2:';

const INSTALL_CREATOR_EMAIL = 'antoniocarlos.fernandes@hotmail.com';
const INSTALL_CREATOR_HASH =
  'sha256:d0cc1a9a5a2afc30b7a40a9820ce0f602cff229fce1f32bac334ddff81b43157';

function sha256Fallback(message: string): string {
  const utf8 = unescape(encodeURIComponent(message));
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    bytes.push(utf8.charCodeAt(i));
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  bytes.push(
    (highBits >>> 24) & 0xff,
    (highBits >>> 16) & 0xff,
    (highBits >>> 8) & 0xff,
    highBits & 0xff,
    (lowBits >>> 24) & 0xff,
    (lowBits >>> 16) & 0xff,
    (lowBits >>> 8) & 0xff,
    lowBits & 0xff
  );

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  const w = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      w[i] =
        ((bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((val) => val.toString(16).padStart(8, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salted = `${HASH_SALT}${password}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(salted);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hex}`;
  }
  return `sha256:${sha256Fallback(salted)}`;
}

export async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) {
    return password === INITIAL_WORKSHOP_PASSWORD;
  }
  const computed = await hashPassword(password);
  return timingSafeEqual(computed, storedHash);
}

export type InstallVerificationResult =
  | {ok: true; authorizedEmail: string}
  | {ok: false; error: string};

export async function verifyInstallCredentials(
  emailInput: string,
  passwordInput: string
): Promise<InstallVerificationResult> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  if (!normalizedEmail || !passwordInput) {
    return {ok: false, error: 'Preencha o email e a palavra-passe.'};
  }

  const emailMatches = timingSafeEqual(normalizedEmail, INSTALL_CREATOR_EMAIL);
  const passwordMatches = await verifyPassword(passwordInput, INSTALL_CREATOR_HASH);

  if (!emailMatches || !passwordMatches) {
    return {
      ok: false,
      error: 'Credenciais inválidas. Apenas o criador autorizado pode instalar a aplicação.',
    };
  }

  return {ok: true, authorizedEmail: INSTALL_CREATOR_EMAIL};
}

export type CredentialVerificationResult =
  | {ok: true; user: WorkshopUser}
  | {ok: false; error: string};

export async function verifyWorkshopCredentials(
  emailInput: string,
  passwordInput: string
): Promise<CredentialVerificationResult> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  if (!normalizedEmail || !passwordInput) {
    return {ok: false, error: 'Preencha o email e a palavra-passe.'};
  }

  const users = await db.workshopUsers.filter((u) => !u.deletedAt).toArray();
  const matchedUser = users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);

  if (matchedUser) {
    if (!matchedUser.active || matchedUser.sessionState === 'Suspenso') {
      return {
        ok: false,
        error: 'Esta conta encontra-se suspensa ou inativa. Contacte o administrador.',
      };
    }

    const validLocal = await verifyPassword(passwordInput, matchedUser.passwordHash);
    if (validLocal) {
      return {ok: true, user: matchedUser};
    }

    if (isSupabaseConfigured && supabase && navigator.onLine) {
      try {
        const {data, error} = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: passwordInput,
        });
        if (!error && data.user) {
          return {ok: true, user: matchedUser};
        }
      } catch {
        // Fall through
      }
    }

    return {ok: false, error: 'Email ou palavra-passe inválidos.'};
  }

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      const {data, error} = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: passwordInput,
      });
      if (!error && data.user) {
        const remoteUser: WorkshopUser = {
          id: data.user.id,
          name: (data.user.user_metadata?.name as string | undefined) || normalizedEmail,
          email: normalizedEmail,
          role: 'Administrador',
          sessionState: 'Online',
          permissions: ['work_orders', 'stock', 'payments', 'users', 'settings'],
          active: true,
          updatedAt: new Date().toISOString(),
        };
        return {ok: true, user: remoteUser};
      }
    } catch {
      // Ignore network error
    }
  }

  return {ok: false, error: 'Email ou palavra-passe inválidos.'};
}
