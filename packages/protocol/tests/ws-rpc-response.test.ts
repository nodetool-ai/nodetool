import { describe, it, expect } from "vitest";
import { outboundControlMessageSchemas } from "../src/ws-commands.js";

const schema = outboundControlMessageSchemas.rpc_response;

describe("rpc_response outbound schema", () => {
  // MsgPack encodes an absent field as null, so a plain (non-tRPC) error
  // reaches the client with trpcCode: null. Rejecting that logged a protocol
  // violation on every provider failure.
  it("accepts a null trpcCode", () => {
    const parsed = schema.safeParse({
      type: "rpc_response",
      request_id: "r1",
      command: "generate_media",
      error: {
        code: "INTERNAL_ERROR",
        message: "Unprocessable Entity",
        retryable: true,
        apiCode: null,
        trpcCode: null
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a string trpcCode", () => {
    const parsed = schema.safeParse({
      type: "rpc_response",
      request_id: "r1",
      command: "get_asset",
      error: {
        code: "NOT_FOUND",
        message: "missing",
        retryable: false,
        apiCode: "not_found",
        trpcCode: "NOT_FOUND"
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-string trpcCode", () => {
    const parsed = schema.safeParse({
      type: "rpc_response",
      request_id: "r1",
      command: "get_asset",
      error: { code: "X", message: "m", retryable: false, trpcCode: 7 }
    });
    expect(parsed.success).toBe(false);
  });
});
