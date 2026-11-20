import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export type EncryptedValue = {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
};

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Invalid cryptographic key.");
  }
}

function assertIdentity(id: string): void {
  if (typeof id !== "string" || !/^[0-9]{13}$/.test(id)) {
    throw new Error("Invalid identity format.");
  }
}

/** Server-side only: callers supply the encryption key from private configuration. */
export function encrypt(value: string, key: Buffer): EncryptedValue {
  assertKey(key);
  if (typeof value !== "string") {
    throw new Error("Invalid protected value.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decrypt(record: EncryptedValue, key: Buffer): string {
  assertKey(key);
  try {
    if (
      !record ||
      !Buffer.isBuffer(record.ciphertext) ||
      !Buffer.isBuffer(record.iv) ||
      record.iv.length !== 12 ||
      !Buffer.isBuffer(record.tag) ||
      record.tag.length !== 16
    ) {
      throw new Error();
    }

    const decipher = createDecipheriv("aes-256-gcm", key, record.iv, { authTagLength: 16 });
    decipher.setAuthTag(record.tag);
    return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Authentication and malformed-record failures expose no input or cryptographic details.
    throw new Error("Unable to decrypt protected value.");
  }
}

/** Use a dedicated lookup key, separate from the key supplied to encrypt/decrypt. */
export function lookupIdentity(id: string, lookupKey: Buffer): string {
  assertKey(lookupKey);
  assertIdentity(id);
  return createHmac("sha256", lookupKey).update(id, "utf8").digest("hex");
}

export function retainLast3(id: string): string {
  assertIdentity(id);
  return id.slice(-3);
}

export function maskIdentity(last3: string): string {
  if (typeof last3 !== "string" || !/^[0-9]{3}$/.test(last3)) {
    throw new Error("Invalid retained identity digits.");
  }
  return `X-XXXX-XXXXX-${last3.slice(0, 2)}-${last3.slice(2)}`;
}
