/**
 * AES-256-GCM encryption for storing sensitive credentials at rest.
 *
 * Key source: ENCRYPTION_KEY env var (32-byte hex string).
 * Output format: `iv:authTag:ciphertext` (all base64).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env["ENCRYPTION_KEY"];
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string (64 chars)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:authTag:ciphertext` (all base64url).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a ciphertext produced by {@link encrypt}.
 * Accepts `iv:authTag:ciphertext` (base64url).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format — expected iv:authTag:data");
  }

  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(data) + decipher.final("utf8");
}
