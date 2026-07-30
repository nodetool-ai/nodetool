import { describe, expect, it } from "vitest";

import { assertValidBridgeFrame } from "./fixtures/bridge-frame-schemas.js";

/**
 * Proves the E3 conformance gate: a deliberately invalid frame emitted
 * through the shared bridge-frame validator throws, and every frame shape
 * the two bridge fakes actually emit passes. See RELIABILITY_TASKS.md
 * Track E, E3.
 */
describe("assertValidBridgeFrame (bridge fake conformance gate)", () => {
  it("accepts a well-formed discover frame", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "discover",
        request_id: "r1",
        data: {
          nodes: [{ node_type: "fake.TestNode" }],
          protocol_version: 3,
          load_errors: []
        }
      })
    ).not.toThrow();
  });

  it("accepts a well-formed result, chunk, progress, error, and comfy.event frame", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "result",
        request_id: "r1",
        data: { outputs: {}, blobs: {} }
      })
    ).not.toThrow();
    expect(() =>
      assertValidBridgeFrame({
        type: "chunk",
        request_id: "r1",
        data: { content: "hi" }
      })
    ).not.toThrow();
    expect(() =>
      assertValidBridgeFrame({
        type: "progress",
        request_id: "r1",
        data: { status: "start", downloaded_bytes: 0 }
      })
    ).not.toThrow();
    expect(() =>
      assertValidBridgeFrame({
        type: "error",
        request_id: "r1",
        data: { error: "boom" }
      })
    ).not.toThrow();
    expect(() =>
      assertValidBridgeFrame({
        type: "comfy.event",
        request_id: "r1",
        data: { event: "queued", prompt_id: "p1" }
      })
    ).not.toThrow();
  });

  it("throws on an unknown frame type", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "not_a_real_type",
        request_id: "r1",
        data: {}
      })
    ).toThrow(/unknown\/missing type/);
  });

  it("throws when a discover frame is missing required fields", () => {
    expect(() =>
      assertValidBridgeFrame({
        type: "discover",
        request_id: "r1",
        // Missing `nodes`, `protocol_version`, `load_errors`.
        data: {}
      })
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
      assertValidBridgeFrame({
        type: "result",
        data: { ok: true }
      })
    ).toThrow(/fails its own envelope contract/);
  });
});
