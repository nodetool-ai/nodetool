import { describe, expect, it } from "vitest";
import { stringifyTraceContent } from "../src/run-trace-serialization.js";
import { TRACE_STRING_LIMIT } from "@nodetool-ai/protocol";

describe("trace content media boundary", () => {
  it("omits typed bytes and Buffer JSON forms before they become numeric strings", () => {
    const content = stringifyTraceContent({ array: new Uint8Array([211, 212, 213]), buffer: Buffer.from([214, 215, 216]), encoded: { type: "Buffer", data: [217, 218, 219] }, audio: new ArrayBuffer(8) });
    expect(content).toContain("[media omitted]");
    for (const byte of [211, 212, 213, 214, 215, 216, 217, 218, 219]) { expect(content).not.toContain(String(byte)); }
  });

  it("preserves asset and generation identifiers while omitting inline media data", () => {
    const asset = "a".repeat(32); const generation = "b".repeat(32);
    const content = JSON.parse(stringifyTraceContent({ media: { type: "image", data: "inline-bytes", asset_id: asset, generation_id: generation, uri: `asset://${asset}` } }, new Set(["a"])));
    expect(content.media.data).toBe("[media omitted]");
    expect(content.media.asset_id).toBe(asset);
    expect(content.media.generation_id).toBe(generation);
    expect(content.media.uri).toBe(`asset://${asset}`);
  });

  it("omits recognizable pre-encoded media while preserving ordinary numeric logs", () => {
    const buffer = JSON.stringify(Buffer.from([241, 242, 243]));
    const nested = JSON.stringify({ output: { type: "audio", data: [244, 245, 246] } });
    for (const value of [buffer, nested, `guest console: ${buffer}`]) {
      const content = stringifyTraceContent(value);
      expect(content).toContain("[media omitted]");
      for (const byte of [241, 242, 243, 244, 245, 246]) { expect(content).not.toContain(String(byte)); }
    }
    expect(JSON.parse(stringifyTraceContent("measurements [241,242,243]"))).toBe("measurements [241,242,243]");
    expect(JSON.parse(stringifyTraceContent("[241,242,243]"))).toBe("[241,242,243]");
  });

  it("redacts resolved secrets before applying text caps and handles large or circular inputs", () => {
    const secret = "provider-secret";
    const value = `${"word ".repeat(3_998)}${secret} trailing`;
    const content = JSON.parse(stringifyTraceContent(value, new Set([secret])));
    expect(content).not.toContain(secret);
    expect(content.length).toBeLessThanOrEqual(TRACE_STRING_LIMIT);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(stringifyTraceContent(circular)).toContain("[circular]");
    expect(stringifyTraceContent(Array.from({ length: 1_000 }, () => "word ".repeat(4_000))).length).toBeLessThanOrEqual(1_000_000);
  });
});
