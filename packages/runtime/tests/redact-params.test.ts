/**
 * A generation's parameters leave the process on the `prediction` message
 * and land in the ledger row. Bytes and data URLs must not.
 */

import { describe, it, expect } from "vitest";
import { redactGenerationParams } from "../src/redact-params.js";

describe("redactGenerationParams", () => {
  it("replaces bytes with their length", () => {
    const out = redactGenerationParams({
      prompt: "a fox",
      image: new Uint8Array(1234),
      images: [new Uint8Array(3), new Uint8Array(4)],
      raw: new ArrayBuffer(8)
    });
    expect(out).toEqual({
      prompt: "a fox",
      image: { bytes: 1234 },
      images: [{ bytes: 3 }, { bytes: 4 }],
      raw: { bytes: 8 }
    });
  });

  it("replaces data URLs and very long strings", () => {
    const long = "x".repeat(5000);
    const out = redactGenerationParams({
      seed: "data:image/png;base64,AAAA",
      long,
      short: "keep"
    });
    expect(out.seed).toEqual({ bytes: 26, truncated: true });
    expect(out.long).toEqual({ truncated: true, length: 5000 });
    expect(out.short).toBe("keep");
  });

  it("recurses into nested bags and keeps scalars", () => {
    const out = redactGenerationParams({
      nested: { deeper: { bytes: new Uint8Array(2), n: 7, ok: true } },
      nothing: null
    });
    expect(out).toEqual({
      nested: { deeper: { bytes: { bytes: 2 }, n: 7, ok: true } },
      nothing: null
    });
  });

  it("does not throw on a non-object", () => {
    expect(redactGenerationParams(null)).toEqual({});
    expect(redactGenerationParams(undefined)).toEqual({});
  });
});
