/**
 * The identity encoding (technical design, "Two encodings, kept apart",
 * TC33's identity direction).
 */
import { describe, expect, it } from "vitest";
import { identityEncode } from "../src/identity-encoding.js";

describe("identityEncode", () => {
  it("sorts keys at every depth and leaves out undefined values", () => {
    expect(identityEncode({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}'
    );
    expect(identityEncode({ a: 1, b: 2 })).toBe(identityEncode({ b: 2, a: 1 }));
  });

  it("keeps strings byte for byte, so look-alike strings stay apart", () => {
    const composed = "café";
    const decomposed = "café";
    expect(composed.normalize("NFC")).toBe(decomposed.normalize("NFC"));
    expect(identityEncode({ name: composed })).not.toBe(identityEncode({ name: decomposed }));
    expect(identityEncode("line\nbreak \"quoted\"")).toBe('"line\\nbreak \\"quoted\\""');
  });

  it("writes numbers in their shortest round-trip form", () => {
    expect(identityEncode([0.1, 1e21, 1.5, -2, 100])).toBe("[0.1,1e+21,1.5,-2,100]");
    expect(JSON.parse(identityEncode(0.1 + 0.2))).toBe(0.1 + 0.2);
  });

  it("encodes array holes and null the way JSON does", () => {
    expect(identityEncode([undefined, null, true, false])).toBe("[null,null,true,false]");
  });

  it("refuses values that have no encoding", () => {
    expect(() => identityEncode(Number.NaN)).toThrow();
    expect(() => identityEncode({ x: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => identityEncode(10n)).toThrow();
    expect(() => identityEncode(() => 1)).toThrow();
  });
});
