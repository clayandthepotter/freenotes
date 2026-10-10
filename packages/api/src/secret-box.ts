/**
 * AES-256-GCM sealing for secrets at rest (users' provider API keys).
 * Uses Web Crypto so it runs on Node 20+, Vercel, Deno and browsers alike.
 * Format: "v1.<iv base64url>.<ciphertext+tag base64url>".
 */
export class SecretBox {
  private constructor(private readonly key: CryptoKey) {}

  /** `secret` is 32 random bytes, base64 or base64url encoded (e.g. `openssl rand -base64 32`). */
  static async fromSecret(secret: string): Promise<SecretBox> {
    const raw = fromBase64(secret.trim());
    if (raw.byteLength !== 32) throw new Error(`FREENOTES_KEY_SECRET must decode to 32 bytes, got ${raw.byteLength}`);
    const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return new SecretBox(key);
  }

  async seal(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(plaintext);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, data);
    return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`;
  }

  async open(sealed: string): Promise<string> {
    const [version, ivB64, ctB64] = sealed.split(".");
    if (version !== "v1" || !ivB64 || !ctB64) throw new Error("Unrecognised sealed secret format");
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivB64) }, this.key, fromBase64(ctB64));
      return new TextDecoder().decode(pt);
    } catch {
      throw new Error("Sealed secret could not be opened (wrong FREENOTES_KEY_SECRET or tampered data)");
    }
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const normalised = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
