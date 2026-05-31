// ═══════════════════════════════════════════════════════════════════
// Secure Password Hashing — PBKDF2 via Web Crypto API
// Replaces the old bit-shift hash with a cryptographically secure
// key derivation function (100 000 iterations, SHA-256, random salt).
// ═══════════════════════════════════════════════════════════════════

const ITERATIONS = 100_000;
const KEY_LENGTH = 256;          // bits
const SALT_BYTES = 16;
const PREFIX     = "pbkdf2";

// ── Helpers ──────────────────────────────────────────────────────
const b64Encode = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64Decode = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

/**
 * Hash a password with a random salt.
 * Returns: "pbkdf2:<salt_b64>:<hash_b64>"
 */
export async function hashPassword(password) {
  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key  = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key, KEY_LENGTH,
  );
  return `${PREFIX}:${b64Encode(salt)}:${b64Encode(bits)}`;
}

/**
 * Verify a password against a stored hash string.
 *  - "pbkdf2:…" → PBKDF2 verification
 *  - anything else → legacy bit-shift verification (for migration)
 * Returns: { match: boolean, needsRehash: boolean }
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash) return { match: false, needsRehash: false };

  // ── Modern PBKDF2 hash ──
  if (storedHash.startsWith(PREFIX + ":")) {
    const [, saltB64, hashB64] = storedHash.split(":");
    const enc  = new TextEncoder();
    const salt = b64Decode(saltB64);
    const key  = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      key, KEY_LENGTH,
    );
    const computed = b64Encode(bits);
    return { match: computed === hashB64, needsRehash: false };
  }

  // ── Legacy bit-shift hash (migration path) ──
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = ((h << 5) - h + password.charCodeAt(i)) | 0;
  }
  const legacyHash = h.toString(36);
  return { match: legacyHash === storedHash, needsRehash: true };
}
