/**
 * PR 2 tests — envelope propagation behind NODETOOL_USE_CORRELATION.
 *
 * Asserts:
 *  - MessageEnvelope carries correlation_lineage and source_edge_id.
 *  - inbox.put accepts both legacy metadata-record and PutOptions shapes.
 *  - syntheticEdgeId / externalEdgeId are deterministic.
 *  - NodeOutputs.forward copies envelope lineage to the sendFn opts.
 *  - NodeOutputs.emit accepts an explicit lineage override.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { CorrelationLineage } from "@nodetool-ai/protocol";
import { EMPTY_LINEAGE } from "@nodetool-ai/protocol";
import { NodeInbox } from "../src/inbox.js";
import { NodeOutputs } from "../src/io.js";
import {
  externalEdgeId,
  syntheticEdgeId
} from "../src/edge-ids.js";

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

  it("PutOptions.metadata round-trips on the envelope", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", "x", { metadata: { trace: "abc" } });
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

  it("preserves an explicit null override (distinguished from omitted arg)", async () => {
    let captured: unknown = "untouched";
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
        event_id: "e3",
        correlation_lineage: EMPTY_LINEAGE,
        source_edge_id: ""
      },
      null
    );
    expect(captured).toBeNull();
  });

  it("preserves an explicit undefined override", async () => {
    let captured: unknown = "untouched";
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
        event_id: "e4",
        correlation_lineage: EMPTY_LINEAGE,
        source_edge_id: ""
      },
      undefined
    );
    expect(captured).toBeUndefined();
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
