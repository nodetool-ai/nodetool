import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/sha256.js";

describe("sha256Hex", () => {
  it("matches the FIPS 180-4 vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    // 448 bits — two blocks, so the padding lands in the second one.
    expect(
      sha256Hex(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
      )
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("hashes the UTF-8 bytes of a non-ASCII string, stably", () => {
    const text = "héllo 世界 🎬";
    expect(sha256Hex(text)).toBe(
      "1e5eab984074aa78345623a477173951f257120f237963db13ac4976f95bb2e7"
    );
    expect(sha256Hex(text)).toBe(sha256Hex(text));
    expect(sha256Hex(text)).toBe(
      createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
    );
  });

  it("agrees with node:crypto around every block boundary", () => {
    // 55/56/57 and 63/64/65 straddle the two padding cases; 200 spans four blocks.
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 200]) {
      const text = "wide shot, 35mm lens, ".repeat(20).slice(0, length);
      expect(sha256Hex(text)).toBe(
        createHash("sha256").update(text, "utf8").digest("hex")
      );
    }
  });
});
