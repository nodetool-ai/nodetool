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
  blenderExecuteRequestSchema,
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
  },
  "blender.event": {
    type: "blender.event",
    request_id: "r1",
    data: { event: "progress", frame: 2, total: 3 }
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

describe("blender.execute request schema (outbound-only, beside comfy.*)", () => {
  const request = {
    job: {
      version: 1,
      inputs: { model: "model.glb" },
      outputs: { image: "render.png" },
      job: { op: "render_image", params: {} }
    },
    inputs: { model: "model" },
    timeout: 600
  };

  it("accepts a well-formed request carrying job, blob keys, and timeout", () => {
    expect(blenderExecuteRequestSchema.safeParse(request).success).toBe(true);
  });

  it("rejects a request missing the job", () => {
    expect(
      blenderExecuteRequestSchema.safeParse({
        inputs: { model: "model" },
        timeout: 600
      }).success
    ).toBe(false);
  });

  it("rejects a request whose inputs are not blob keys", () => {
    expect(
      blenderExecuteRequestSchema.safeParse({
        ...request,
        inputs: { model: 42 }
      }).success
    ).toBe(false);
  });

  it("rejects a request with a non-numeric timeout", () => {
    expect(
      blenderExecuteRequestSchema.safeParse({ ...request, timeout: "600" })
        .success
    ).toBe(false);
  });

  it("has no dispatcher entry: an outbound request is not an inbound frame", () => {
    expect(getBridgeFrameSchema("blender.execute")).toBeUndefined();
    // …so the dispatcher gate treats it as not-its-concern, the way an
    // older worker treats the unknown request type: ignored, never run.
    expect(
      validateBridgeFrame({
        type: "blender.execute",
        request_id: "r1",
        data: request
      }).success
    ).toBe(true);
  });
});

describe("blender worker.status flag", () => {
  const status = {
    type: "result",
    request_id: "r1",
    data: {
      protocol_version: 4,
      node_count: 1,
      provider_count: 0,
      namespaces: ["fake"],
      load_errors: [],
      transport: "websocket",
      max_frame_size: 1024
    }
  };

  it("a worker that says nothing about Blender parses as having none", () => {
    const parsed = bridgeFrameSchemas.result.safeParse(status);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data.data as { blender?: { enabled: boolean } };
      expect(data.blender).toBeUndefined();
    }
  });

  it("a worker reporting blender.enabled parses with the flag", () => {
    const parsed = bridgeFrameSchemas.result.safeParse({
      ...status,
      data: {
        ...(status.data as Record<string, unknown>),
        blender: { enabled: true, version: "5.2.1" }
      }
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data.data as { blender?: { enabled: boolean } };
      expect(data.blender?.enabled).toBe(true);
    }
  });

  it("a blender terminal result parses through the result schema", () => {
    expect(
      bridgeFrameSchemas.result.safeParse({
        type: "result",
        request_id: "r1",
        data: {
          ok: true,
          produced: ["image"],
          stats: { blender_version: "5.2.1", render_seconds: 1.5 },
          sizes: { image: 4 },
          blobs: {}
        }
      }).success
    ).toBe(true);
  });
});

describe("blender.event malformed frames", () => {
  it("rejects an event whose frame is not a number", () => {
    expect(
      bridgeFrameSchemas["blender.event"].safeParse({
        type: "blender.event",
        request_id: "r1",
        data: { event: "progress", frame: "2", total: 3 }
      }).success
    ).toBe(false);
  });

  it("rejects an event with an unknown discriminator", () => {
    expect(
      bridgeFrameSchemas["blender.event"].safeParse({
        type: "blender.event",
        request_id: "r1",
        data: { event: "completed", frame: 3, total: 3 }
      }).success
    ).toBe(false);
  });

  it("the dispatcher gate reports the failure without throwing", () => {
    const result = validateBridgeFrame({
      type: "blender.event",
      request_id: "r1",
      data: { event: "progress", frame: "2", total: 3 }
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("assertValidBridgeFrame throws for a malformed blender.event", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "blender.event",
        request_id: "r1",
        data: { event: "progress", frame: "2", total: 3 }
      })
    ).toThrow(/fails its own envelope contract/);
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
