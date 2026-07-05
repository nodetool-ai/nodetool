/**
 * Regression tests for kernel-actor bug fixes (docs/KERNEL_RUNNER_ANALYSIS.md):
 *   #7  streaming-input node without run() + connected inputs → warn, not silent
 *   #11 empty-scope sticky overwrite → warn once per handle per run
 *   #12 non-driver duplicate max-scope key dropped → warn at close
 *
 * The controlled-node deadlock (#4) lives in actor.test.ts alongside the other
 * controlled-mode coverage.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import type { NodeDescriptor, NodeUpdate } from "@nodetool-ai/protocol";
import { configureLogging } from "@nodetool-ai/config";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function analysis(
  invocationScope: string[],
  inputs: Record<string, [string[], boolean?]>
): NodeAnalysis {
  return {
    invocationScope,
    inputs: new Map(
      Object.entries(inputs).map(([h, [scope, repeats]]) => [
        h,
        {
          scope,
          repeatsPerKey: repeats ?? false,
          isMultiEdge: false,
          possibleChildRoots: new Set<string>()
        }
      ])
    ),
    outputs: new Map()
  };
}

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "n1", type: "test.Node", ...overrides };
}

interface SentOutput {
  nodeId: string;
  outputs: Record<string, unknown>;
}

function createActor(
  node: NodeDescriptor,
  inbox: NodeInbox,
  executor: NodeExecutor,
  correlation: NodeAnalysis = EMPTY_ANALYSIS
): { actor: NodeActor; sentOutputs: SentOutput[]; messages: unknown[] } {
  const sentOutputs: SentOutput[] = [];
  const messages: unknown[] = [];
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation,
    sendOutputs: async (nodeId, outputs) => {
      sentOutputs.push({ nodeId, outputs });
    },
    emitMessage: (msg) => messages.push(msg)
  });
  return { actor, sentOutputs, messages };
}

function trackingExecutor(
  processFn: (i: Record<string, unknown>) => Record<string, unknown>
): { executor: NodeExecutor; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    executor: {
      async process(inputs) {
        calls.push(inputs);
        return processFn(inputs);
      }
    },
    calls
  };
}

let originalLogLevel: string | undefined;

beforeEach(() => {
  originalLogLevel = process.env["NODETOOL_LOG_LEVEL"];
  process.env["NODETOOL_LOG_LEVEL"] = "info";
  configureLogging();
});

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env["NODETOOL_LOG_LEVEL"];
  } else {
    process.env["NODETOOL_LOG_LEVEL"] = originalLogLevel;
  }
  configureLogging();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// #7 — streaming-input node without run()
// ---------------------------------------------------------------------------

describe("NodeActor – streaming-input legacy fallback (#7)", () => {
  it("warns (log + node_update) when connected inputs would be dropped", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const { executor, calls } = trackingExecutor(() => ({ legacy: true }));
    const { actor, sentOutputs, messages } = createActor(node, inbox, executor);

    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await inbox.put("a", 1);
    inbox.markSourceDone("a");
    await actor.run();

    // Fallback still fires process({}) — behavior unchanged, but surfaced.
    expect(calls).toEqual([{}]);
    expect(sentOutputs.map((s) => s.outputs)).toEqual([{ legacy: true }]);

    const warn = messages.find(
      (m) =>
        (m as NodeUpdate).type === "node_update" &&
        (m as NodeUpdate).status === "warning"
    ) as NodeUpdate | undefined;
    expect(warn).toBeDefined();
    expect(warn?.error).toContain("data would be silently dropped");

    const logged = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(logged).toContain("no run() implementation");
  });

  it("does not warn when no data handles are connected", async () => {
    const node = makeNode({ is_streaming_input: true });
    const inbox = new NodeInbox();

    const { executor, calls } = trackingExecutor(() => ({ legacy: true }));
    const { actor, messages } = createActor(node, inbox, executor);

    await actor.run();

    expect(calls).toEqual([{}]);
    const warn = messages.find(
      (m) =>
        (m as NodeUpdate).type === "node_update" &&
        (m as NodeUpdate).status === "warning"
    );
    expect(warn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// #11 — empty-scope sticky overwrite
// ---------------------------------------------------------------------------

describe("NodeActor – empty-scope sticky overwrite (#11)", () => {
  it("warns once per handle when a stream collapses to last-value-wins", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(
      node,
      inbox,
      executor,
      analysis([], { a: [[], false] })
    );

    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await inbox.put("a", "first");
    await inbox.put("a", "second");
    await inbox.put("a", "third");
    inbox.markSourceDone("a");
    await actor.run();

    // Node fires once with the last value (unchanged scheduling).
    expect(calls).toEqual([{ a: "third" }]);

    const logged = stderr.mock.calls.map((c) => String(c[0])).join("");
    const occurrences = logged.split("only the last is kept").length - 1;
    expect(occurrences).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// #12 — non-driver duplicate max-scope key dropped
// ---------------------------------------------------------------------------

describe("NodeActor – duplicate max-scope key drop (#12)", () => {
  it("warns when a second envelope for an already-fired key is stranded", async () => {
    const node = makeNode();
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const { executor, calls } = trackingExecutor((i) => ({ out: i.a }));
    const { actor } = createActor(
      node,
      inbox,
      executor,
      analysis(["r"], { a: [["r"], false] })
    );

    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const lineage = { r: { index: 0 } };
    await inbox.put("a", "first", { correlation_lineage: lineage });
    await inbox.put("a", "second", { correlation_lineage: lineage });
    inbox.markSourceDone("a");
    await actor.run();

    // The key fires once; the duplicate is dropped (unchanged scheduling).
    expect(calls).toEqual([{ a: "first" }]);

    const logged = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(logged).toContain("already fired without a repeating driver");
    expect(logged).toContain("dropped 1 envelope");
  });
});
