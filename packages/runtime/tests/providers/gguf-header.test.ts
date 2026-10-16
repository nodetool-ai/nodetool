import { describe, expect, it } from "vitest";

import { ggufIsLanguageModel } from "../../src/providers/gguf-header.js";

/** A GGUF header with the given string and u32 keys, in order. */
function header(entries: Array<[string, string | number]>): Uint8Array {
  const parts: Buffer[] = [];
  const u64 = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  };
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const str = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
  parts.push(Buffer.from("GGUF"), u32(3), u64(0), u64(entries.length));
  for (const [key, value] of entries) {
    parts.push(str(key));
    parts.push(typeof value === "string" ? Buffer.concat([u32(8), str(value)]) : Buffer.concat([u32(4), u32(value)]));
  }
  return new Uint8Array(Buffer.concat(parts));
}

describe("ggufIsLanguageModel", () => {
  it("accepts a header with a context length", () => {
    const llm = header([
      ["general.architecture", "qwen3"],
      ["general.name", "Qwen3 4B"],
      ["qwen3.context_length", 40960]
    ]);
    expect(ggufIsLanguageModel(llm)).toBe(true);
  });

  it("rejects diffusion weights, which have no context length", () => {
    expect(ggufIsLanguageModel(header([["general.architecture", "flux"]]))).toBe(false);
    expect(ggufIsLanguageModel(header([]))).toBe(false);
  });

  it("cannot tell when the bytes are not a whole GGUF header", () => {
    expect(ggufIsLanguageModel(new TextEncoder().encode("x"))).toBeNull();
    const llm = header([["general.architecture", "qwen3"], ["qwen3.context_length", 1]]);
    expect(ggufIsLanguageModel(llm.subarray(0, 40))).toBeNull();
  });
});
