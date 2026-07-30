/**
 * Contract tests for `src/bridge-frames.ts` (task B3).
 *
 * Validates that:
 *  1. A minimal valid sample of every bridge frame type parses through both
 *     its per-type schema and the discriminated union.
 *  2. A sample with a wrong-typed field, or a missing `request_id`, fails.
 *  3. `validateBridgeFrame` (non-throwing, used by the dispatcher's hot
 *     path) reports success/failure without throwing.
 *  4. `assertValidBridgeFrame` (throwing, used by the bridge test fakes)
 *     throws on the same invalid samples.
 *  5. An unknown/missing `type` is not this module's concern —
 *     `validateBridgeFrame` treats it as trivially valid (the dispatcher
 *     already silently ignores frame types it doesn't switch on), while
 *     `assertValidBridgeFrame` (which fakes use to check what THEY emit)
 *     still rejects it.
 */

import { describe, it, expect } from "vitest";
import {
  bridgeFrameSchema,
  bridgeFrameSchemas,
  assertValidBridgeFrame,
  validateBridgeFrame,
  getBridgeFrameSchema
} from "../src/bridge-frames.js";

const validFrames: Record<string, Record<string, unknown>> = {
  discover: {
    type: "discover",
    request_id: "r1",
    data: {
      nodes: [
        {
          node_type: "fake.TestNode",
          title: "Fake",
          description: "d",
          properties: [],
          outputs: [],
          required_settings: []
        }
      ],
      protocol_version: 3,
      load_errors: []
    }
  },
  result: {
    type: "result",
    request_id: "r1",
    data: { outputs: { out: "hi" }, blobs: {} }
  },
  error: {
    type: "error",
    request_id: "r1",
    data: { error: "boom", traceback: "..." }
  },
  chunk: {
    type: "chunk",
    request_id: "r1",
    data: { content: "hi" }
  },
  progress: {
    type: "progress",
    request_id: "r1",
    data: { progress: 1, total: 10 }
  },
  "comfy.event": {
    type: "comfy.event",
    request_id: "r1",
    data: { event: "queued", prompt_id: "p1" }
  }
};

describe("bridgeFrameSchemas", () => {
  it("accepts a well-formed frame of every known type", () => {
    for (const [type, frame] of Object.entries(validFrames)) {
      const schema = getBridgeFrameSchema(type);
      expect(schema, type).toBeDefined();
      expect(schema!.safeParse(frame).success, type).toBe(true);
      expect(bridgeFrameSchema.safeParse(frame).success, type).toBe(true);
    }
  });

  it("accepts a worker.status-shaped result and a download-shaped progress frame", () => {
    expect(
      bridgeFrameSchemas.result.safeParse({
        type: "result",
        request_id: "r1",
        data: {
          protocol_version: 3,
          node_count: 1,
          provider_count: 0,
          namespaces: ["fake"],
          load_errors: [],
          transport: "stdio",
          max_frame_size: 1024
        }
      }).success
    ).toBe(true);
    expect(
      bridgeFrameSchemas.progress.safeParse({
        type: "progress",
        request_id: "r1",
        data: {
          status: "progress",
          repo_id: "org/model",
          downloaded_bytes: 10,
          total_bytes: 100
        }
      }).success
    ).toBe(true);
  });

  it("rejects a frame whose field has the wrong type", () => {
    const parsed = bridgeFrameSchemas.error.safeParse({
      type: "error",
      request_id: "r1",
      data: { error: 42 }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a frame missing request_id", () => {
    const parsed = bridgeFrameSchemas.result.safeParse({
      type: "result",
      data: { outputs: {}, blobs: {} }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a discover frame missing required fields", () => {
    const parsed = bridgeFrameSchemas.discover.safeParse({
      type: "discover",
      request_id: "r1",
      data: {}
    });
    expect(parsed.success).toBe(false);
  });
});

describe("validateBridgeFrame (non-throwing dispatcher gate)", () => {
  it("reports success for a valid frame", () => {
    expect(validateBridgeFrame(validFrames.result).success).toBe(true);
  });

  it("reports failure with a message for an invalid frame", () => {
    const result = validateBridgeFrame({
      type: "error",
      request_id: "r1",
      data: { error: 42 }
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("never throws, even on a garbage frame", () => {
    expect(() => validateBridgeFrame({})).not.toThrow();
    expect(validateBridgeFrame({}).success).toBe(true);
  });

  it("treats an unknown type as not-this-module's-concern (trivially valid)", () => {
    expect(
      validateBridgeFrame({ type: "execute", request_id: "r1", data: {} })
        .success
    ).toBe(true);
  });
});

describe("assertValidBridgeFrame (throwing fake-conformance gate)", () => {
  it("does not throw for any valid sample frame", () => {
    for (const [type, frame] of Object.entries(validFrames)) {
      expect(() => assertValidBridgeFrame(frame), type).not.toThrow();
    }
  });

  it("throws on an unknown frame type", () => {
    expect(() =>
      assertValidBridgeFrame({ type: "not_a_real_type", request_id: "r1", data: {} })
    ).toThrow(/unknown\/missing type/);
  });

  it("throws when a discover frame is missing required fields", () => {
    expect(() =>
      assertValidBridgeFrame({ type: "discover", request_id: "r1", data: {} })
    ).toThrow(/fails its own envelope contract/);
  });

  it("throws when an error frame's 'error' field is the wrong type", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "error",
        request_id: "r1",
        data: { error: 42 }
      })
    ).toThrow(/fails its own envelope contract/);
  });

  it("throws when request_id is missing", () => {
    expect(() =>
      assertValidBridgeFrame({ type: "result", data: { ok: true } })
    ).toThrow(/fails its own envelope contract/);
  });
});
