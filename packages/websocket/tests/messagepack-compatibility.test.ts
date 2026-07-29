import { describe, expect, it } from "vitest";
import {
  packWebSocketMessage,
  unpackWebSocketMessage
} from "../src/messagepack.js";

describe("WebSocket MessagePack compatibility", () => {
  it("encodes undefined as standard nil instead of msgpackr extension 0x00", () => {
    const encoded = packWebSocketMessage({ value: undefined });

    // msgpackr chooses map16 here, but the value itself must be standard nil.
    expect([...encoded.slice(0, 3)]).toEqual([0xde, 0x00, 0x01]);
    expect(encoded.at(-1)).toBe(0xc0);
    expect(unpackWebSocketMessage(encoded)).toEqual({ value: null });
  });

  it("uses standard maps rather than msgpackr record extensions", () => {
    const encoded = packWebSocketMessage({ type: "rpc_response", result: { ok: true } });

    expect(encoded[0]).toBe(0xde);
    expect(unpackWebSocketMessage(encoded)).toEqual({
      type: "rpc_response",
      result: { ok: true }
    });
  });
});
