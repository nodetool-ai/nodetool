/**
 * PR 2 tests — envelope propagation behind NODETOOL_USE_CORRELATION.
 *
 * Asserts:
 *  - MessageEnvelope carries correlation_lineage and source_edge_id.
 *  - inbox.put accepts both legacy metadata-record and PutOptions shapes.
 *  - syntheticEdgeId / externalEdgeId are deterministic.
 *  - NodeOutputs.forward copies envelope lineage to the sendFn opts.
 *  - NodeOutputs.emit accepts an explicit lineage override.
 *  - The correlation flag reads process.env at observation time.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CorrelationLineage } from "@nodetool-ai/protocol";
import { EMPTY_LINEAGE } from "@nodetool-ai/protocol";
import { NodeInbox } from "../src/inbox.js";
import { NodeOutputs } from "../src/io.js";
import {
  externalEdgeId,
  isCorrelationEnabled,
  syntheticEdgeId
} from "../src/correlation-flag.js";

const FLAG = "NODETOOL_USE_CORRELATION";

describe("MessageEnvelope correlation fields", () => {
  it("defaults to empty lineage and empty source_edge_id", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", "hello");
    const envelope = await inbox.iterInputWithEnvelope("a").next();
    expect(envelope.value?.correlation_lineage).toEqual(EMPTY_LINEAGE);
    expect(envelope.value?.source_edge_id).toBe("");
    expect(envelope.value?.data).toBe("hello");
  });

  it("preserves explicit source_edge_id and lineage via PutOptions", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    const lineage: CorrelationLineage = { "src:items": { index: 3 } };
    await inbox.put("a", { x: 1 }, {
      source_edge_id: "edge-1",
      correlation_lineage: lineage
    });
    const envelope = (await inbox.iterInputWithEnvelope("a").next()).value;
    expect(envelope?.source_edge_id).toBe("edge-1");
    expect(envelope?.correlation_lineage).toBe(lineage);
  });

  it("still accepts the legacy metadata-record positional arg", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", "x", { trace: "abc" });
    const envelope = (await inbox.iterInputWithEnvelope("a").next()).value;
    expect(envelope?.metadata).toEqual({ trace: "abc" });
    expect(envelope?.correlation_lineage).toEqual(EMPTY_LINEAGE);
  });
});

describe("synthetic edge ids", () => {
  it("syntheticEdgeId produces a deterministic string", () => {
    expect(syntheticEdgeId("a", "out", "b", "in")).toBe(
      "a:out->b:in"
    );
  });

  it("externalEdgeId scopes by input name and handle", () => {
    expect(externalEdgeId("user_input", "value")).toBe(
      "external:user_input:value"
    );
  });
});

describe("correlation flag", () => {
  const originalEnv = process.env[FLAG];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalEnv;
    }
  });

  it("returns false when env var is unset", () => {
    delete process.env[FLAG];
    expect(isCorrelationEnabled()).toBe(false);
  });

  it("accepts 1, true, yes, on (case-insensitive)", () => {
    for (const raw of ["1", "true", "TRUE", "yes", "On"]) {
      process.env[FLAG] = raw;
      expect(isCorrelationEnabled()).toBe(true);
    }
  });

  it("rejects 0, false, empty, garbage", () => {
    for (const raw of ["0", "false", "", "no", "garbage"]) {
      process.env[FLAG] = raw;
      expect(isCorrelationEnabled()).toBe(false);
    }
  });
});

describe("NodeOutputs.forward", () => {
  it("copies envelope lineage into the sendFn opts", async () => {
    const calls: Array<{
      slot: string;
      value: unknown;
      lineage?: CorrelationLineage;
    }> = [];
    const outputs = new NodeOutputs({
      sendFn: async (slot, value, opts) => {
        calls.push({ slot, value, lineage: opts?.lineage });
      }
    });

    const lineage: CorrelationLineage = { "src:items": { index: 7 } };
    await outputs.forward("output", {
      data: "payload",
      metadata: {},
      timestamp: 0,
      event_id: "e1",
      correlation_lineage: lineage,
      source_edge_id: "edge-1"
    });

    expect(calls).toEqual([
      { slot: "output", value: "payload", lineage }
    ]);
  });

  it("can override the forwarded value", async () => {
    let captured: unknown;
    const outputs = new NodeOutputs({
      sendFn: async (_slot, value) => {
        captured = value;
      }
    });
    await outputs.forward(
      "output",
      {
        data: "raw",
        metadata: {},
        timestamp: 0,
        event_id: "e2",
        correlation_lineage: EMPTY_LINEAGE,
        source_edge_id: ""
      },
      "transformed"
    );
    expect(captured).toBe("transformed");
  });
});

describe("NodeOutputs.emit", () => {
  it("threads explicit lineage through to sendFn", async () => {
    let lineageSeen: CorrelationLineage | undefined;
    const outputs = new NodeOutputs({
      sendFn: async (_slot, _value, opts) => {
        lineageSeen = opts?.lineage;
      }
    });
    const lineage: CorrelationLineage = { "src:items": { index: 0 } };
    await outputs.emit("output", "v", { lineage });
    expect(lineageSeen).toBe(lineage);
  });

  it("legacy emit (no opts) leaves opts undefined on sendFn", async () => {
    let opts: { lineage?: CorrelationLineage } | undefined;
    const outputs = new NodeOutputs({
      sendFn: async (_slot, _value, o) => {
        opts = o;
      }
    });
    await outputs.emit("output", 42);
    expect(opts).toBeUndefined();
  });
});
