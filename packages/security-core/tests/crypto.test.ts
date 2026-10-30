import { describe, expect, it } from "vitest";
import { decrypt, decryptFernet, encrypt, encryptFernet } from "../src/index.js";

describe("persisted secret compatibility", () => {
  it("decrypts AES-GCM and Fernet values produced by the original security package", () => {
    expect(decrypt("fixed-master-key", "tenant-a", "hLCj8BSJ0lthnfvof17fYGwep6EgbIuw3XTnTZSDYzxP9QiKa6dQTQ=="))
      .toBe("saved secret");
    expect(decryptFernet("fixed-master-key", "tenant-a", "gAAAAABq4-CcHi2dZ4iX8SSUbV6uV1kBm7iR_QL8U6jAKVeBySH2RU2zJqkPz4rRDJR9SPM9-h5LNoWwsxaCdh2T6gzBsY3sxw=="))
      .toBe("saved secret");
  });

  it("keeps ciphertext tenant scoped and authenticated", () => {
    const encrypted = encrypt("master", "tenant-a", "secret");
    expect(decrypt("master", "tenant-a", encrypted)).toBe("secret");
    expect(() => decrypt("master", "tenant-b", encrypted)).toThrow();
    expect(() => decrypt("other", "tenant-a", encrypted)).toThrow();
    const bytes = Buffer.from(encrypted, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    expect(() => decrypt("master", "tenant-a", bytes.toString("base64"))).toThrow();
  });

  it("retains padded base64url Fernet encoding for Python readers", () => {
    const encrypted = encryptFernet("master", "tenant-a", "secret");
    expect(encrypted.length % 4).toBe(0);
    expect(encrypted).not.toMatch(/[+/]/);
    expect(decryptFernet("master", "tenant-a", encrypted)).toBe("secret");
    expect(() => decryptFernet("master", "tenant-b", encrypted)).toThrow();
  });
});
