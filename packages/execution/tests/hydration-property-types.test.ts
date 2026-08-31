/**
 * A5 hydration-gap regression: `hydrateGraphNodeFlags` alone never populates
 * `propertyTypes` on hydrated nodes — only the richer `Graph.loadFromDict`
 * resolver path does (what `websocket-client-session.ts` used before its A5
 * migration onto this facade). Two kernel checks key off `propertyTypes` to
 * decide whether a handle receiving more than one edge is a legitimate
 * multi-edge *list* fan-in:
 *
 *  - `correlation-analysis.ts`'s `isListTypeHandle` — mandatory, pre-run: a
 *    multi-edge handle it can't prove is list-typed is rejected outright
 *    ("... is not a list type; this is invalid under correlation analysis").
 *  - `runner.ts`'s `_multiEdgeListInputs` classifier, which decides whether
 *    the actor buffers every envelope into an array or treats the handle as
 *    an ordinary last-value-wins input.
 *
 * Both read `node.propertyTypes`, so without it a *genuine* list-typed
 * property fanned in from two edges is misdiagnosed as invalid and the run
 * fails before a single actor spawns — the multi-edge list fan-in the C2
 * journey exercises. `ExecutionSession`'s optional `resolveNodeType` (mirrors
 * the WS runner's `Graph.loadFromDict` hydration) closes the gap.
 */
import { describe, it, expect } from "vitest";
import { createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

/** Two scalar inputs fanned into the same list[int] `ListSum.items` handle. */
function listFanInGraph() {
  return {
    nodes: [
      { id: "a", type: "nodetool.input.Value", name: "a", properties: {} },
      { id: "b", type: "nodetool.input.Value", name: "b", properties: {} },
      { id: "sum", type: "test.execution.ListSum", name: "sum", properties: {} }
    ],
    edges: [
      {
        source: "a",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "items"
      },
      {
        source: "b",
        sourceHandle: "output",
        target: "sum",
        targetHandle: "items"
      }
    ]
  };
}

describe("ExecutionSession — hydration gap: multi-edge fan-in into a list property", () => {
  it("without resolveNodeType (no propertyTypes), a genuine list-typed fan-in is rejected by correlation analysis", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: listFanInGraph(),
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { a: 3, b: 4 }
    });

    const result = await session.result;

    // Pre-fix behavior: `isListTypeHandle` can't see the property is
    // `list[int]` (propertyTypes is absent) and treats the two edges as an
    // invalid non-list fan-in.
    expect(result.status).toBe("failed");
    expect(String(result.error ?? "")).toContain("not a list type");
  });

  it("with resolveNodeType, propertyTypes lets correlation analysis and the actor recognize the list fan-in — matching the WS runner's Graph.loadFromDict hydration", async () => {
    const registry = buildTestRegistry();
    const resolver = createGraphNodeTypeResolver(registry);
    const session = await ExecutionSession.create({
      graph: listFanInGraph(),
      registry,
      bridgeFactory: NO_BRIDGE,
      resolveNodeType: resolver,
      params: { a: 3, b: 4 }
    });

    const result = await session.result;

    expect(result.status).toBe("completed");
    // Both values landed in the aggregated list and were summed — not
    // rejected, not collapsed to a single last-value-wins scalar.
    expect(result.outputs["sum"]).toEqual([7]);
  });
});
