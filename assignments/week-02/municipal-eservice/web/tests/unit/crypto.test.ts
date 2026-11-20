import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decrypt,
  encrypt,
  lookupIdentity,
  maskIdentity,
  retainLast3,
} from "../../src/server/security/crypto.ts";

const encryptionKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 32));
const lookupKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const identity = "1101700123456";

describe("authenticated encryption", () => {
  for (const [label, value] of [
    ["identity", identity],
    ["mobile", "0812345678"],
    ["UTF-8 text", "ข้อมูลส่วนบุคคล"],
    ["empty text", ""],
  ]) {
    it(`round trips ${label} with the matching key`, () => {
      assert.equal(decrypt(encrypt(value, encryptionKey), encryptionKey), value);
    });
  }

  it("returns only binary ciphertext, a fresh 12-byte IV, and a 16-byte tag", () => {
    const first = encrypt(identity, encryptionKey);
    const second = encrypt(identity, encryptionKey);

    assert.deepEqual(Object.keys(first).sort(), ["ciphertext", "iv", "tag"]);
    assert.ok(Buffer.isBuffer(first.ciphertext));
    assert.equal(first.iv.length, 12);
    assert.equal(first.tag.length, 16);
    assert.notDeepEqual(first.iv, second.iv);
    assert.notDeepEqual(first.ciphertext, second.ciphertext);
    assert.notDeepEqual(first.tag, second.tag);
    assert.notDeepEqual(first.ciphertext, Buffer.from(identity));
  });

  it("does not keep plaintext identity or mobile in serialized encrypted records", () => {
    const mobile = "0812345678";
    const record = {
      id: encrypt(identity, encryptionKey),
      mobile: encrypt(mobile, encryptionKey),
      idLookup: lookupIdentity(identity, lookupKey),
      idLast3: retainLast3(identity),
    };
    const serialized = JSON.stringify(record);

    assert.equal(serialized.includes(identity), false);
    assert.equal(serialized.includes(mobile), false);
    assert.equal(record.idLast3, "456");
  });

  it("rejects a different valid-length key without returning plaintext", () => {
    const record = encrypt(identity, encryptionKey);

    assert.throws(() => decrypt(record, Buffer.alloc(32, 255)), {
      message: "Unable to decrypt protected value.",
    });
  });

  for (const field of ["ciphertext", "iv", "tag"] as const) {
    it(`rejects a tampered ${field}`, () => {
      const record = encrypt(identity, encryptionKey);
      record[field] = Buffer.from(record[field]);
      record[field][0] ^= 1;

      assert.throws(() => decrypt(record, encryptionKey), {
        message: "Unable to decrypt protected value.",
      });
    });
  }

  it("rejects malformed IVs and tags with the same safe error", () => {
    const record = encrypt(identity, encryptionKey);

    for (const invalid of [
      { ...record, iv: Buffer.alloc(11) },
      { ...record, iv: Buffer.alloc(13) },
      { ...record, tag: Buffer.alloc(15) },
      { ...record, tag: Buffer.alloc(17) },
    ]) {
      assert.throws(() => decrypt(invalid, encryptionKey), {
        message: "Unable to decrypt protected value.",
      });
    }
  });

  for (const length of [0, 31, 33]) {
    it(`rejects ${length}-byte encryption, decryption, and lookup keys`, () => {
      const invalidKey = Buffer.alloc(length);
      const record = encrypt(identity, encryptionKey);

      assert.throws(() => encrypt(identity, invalidKey), {
        message: "Invalid cryptographic key.",
      });
      assert.throws(() => decrypt(record, invalidKey), {
        message: "Invalid cryptographic key.",
      });
      assert.throws(() => lookupIdentity(identity, invalidKey), {
        message: "Invalid cryptographic key.",
      });
    });
  }

  it("rejects non-Buffer keys at the runtime boundary without echoing their value", () => {
    const invalidKey = identity.repeat(3) as unknown as Buffer;

    assert.throws(() => encrypt(identity, invalidKey), {
      message: "Invalid cryptographic key.",
    });
  });
});

describe("identity lookup", () => {
  it("matches an independently computed HMAC-SHA256 vector as lowercase hex", () => {
    assert.equal(
      lookupIdentity(identity, lookupKey),
      "f73368c9fa65e36f0acd1fb7f675229ef68ea713bd65f82122e5eb1f8604ef04",
    );
  });

  it("is deterministic and changes when the identity or lookup key changes", () => {
    const digest = lookupIdentity(identity, lookupKey);

    assert.equal(lookupIdentity(identity, lookupKey), digest);
    assert.notEqual(lookupIdentity("1101700123457", lookupKey), digest);
    assert.notEqual(lookupIdentity(identity, encryptionKey), digest);
    assert.match(digest, /^[a-f0-9]{64}$/);
  });
});

describe("identity projection", () => {
  it("retains exactly the last three digits, including leading zeroes", () => {
    assert.equal(retainLast3(identity), "456");
    assert.equal(retainLast3("1101700123001"), "001");
  });

  it("rejects malformed full identities without echoing their values", () => {
    for (const value of ["", "456", "110170012345", "11017001234567", "1-1017-00123-45-6", "a101700123456", `${identity}\n`]) {
      assert.throws(() => retainLast3(value), {
        message: "Invalid identity format.",
      });
    }
  });

  it("formats the source mask using only the retained three digits", () => {
    assert.equal(maskIdentity("456"), "X-XXXX-XXXXX-45-6");
    assert.equal(maskIdentity("001"), "X-XXXX-XXXXX-00-1");
  });

  it("refuses full identities and anything other than exactly three ASCII digits", () => {
    for (const value of [identity, "", "45", "4567", " 456", "45a", "๔๕๖", "456\n"]) {
      assert.throws(() => maskIdentity(value), {
        message: "Invalid retained identity digits.",
      });
    }
  });
});
