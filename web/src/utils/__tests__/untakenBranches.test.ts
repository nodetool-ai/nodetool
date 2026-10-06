import type { Edge } from "@xyflow/react";
import {
  EMPTY_UNTAKEN_BRANCH,
  findUntakenBranch,
  sameUntakenBranch
} from "../untakenBranches";

const IF = "nodetool.control.If";
const SWITCH = "nodetool.control.Switch";
const TEXT = "nodetool.text.Concat";

const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle = "a"
): Edge => ({ id, source, sourceHandle, target, targetHandle });

type Status = { status: string; counter?: number };

const statuses =
  (map: Record<string, Status>) =>
  (edgeId: string): Status | undefined =>
    map[edgeId];

// cond → if; if.if_true → yes → yes2; if.if_false → no → no2
const nodeTypes = new Map<string, string>([
  ["if", IF],
  ["yes", TEXT],
  ["yes2", TEXT],
  ["no", TEXT],
  ["no2", TEXT]
]);
const ifEdges = [
  edge("e-true", "if", "if_true", "yes"),
  edge("e-yes2", "yes", "output", "yes2"),
  edge("e-false", "if", "if_false", "no"),
  edge("e-no2", "no", "output", "no2")
];

describe("findUntakenBranch", () => {
  it("dims nothing before the branch node reports", () => {
    expect(findUntakenBranch(nodeTypes, ifEdges, statuses({}))).toBe(
      EMPTY_UNTAKEN_BRANCH
    );
  });

  it("dims nothing while the branch output is still open", () => {
    const result = findUntakenBranch(
      nodeTypes,
      ifEdges,
      statuses({ "e-true": { status: "active", counter: 1 } })
    );
    expect(result).toBe(EMPTY_UNTAKEN_BRANCH);
  });

  it("dims the untaken If branch and everything that only it feeds", () => {
    const result = findUntakenBranch(
      nodeTypes,
      ifEdges,
      statuses({
        "e-true": { status: "completed", counter: 1 },
        "e-false": { status: "completed" }
      })
    );
    expect([...result.nodeIds].sort()).toEqual(["no", "no2"]);
    expect([...result.edgeIds].sort()).toEqual(["e-false", "e-no2"]);
  });

  it("keeps a node running when another input is live", () => {
    const types = new Map(nodeTypes).set("const", TEXT).set("join", TEXT);
    const edges = [
      ...ifEdges,
      edge("e-join-dead", "no", "output", "join", "a"),
      edge("e-join-live", "const", "output", "join", "b")
    ];
    const result = findUntakenBranch(
      types,
      edges,
      statuses({
        "e-true": { status: "completed", counter: 1 },
        "e-false": { status: "completed" }
      })
    );
    expect(result.nodeIds.has("join")).toBe(false);
    expect(result.edgeIds.has("e-join-dead")).toBe(true);
    expect(result.edgeIds.has("e-join-live")).toBe(false);
  });

  it("dims a merge node when both of its inputs are on untaken branches", () => {
    const types = new Map(nodeTypes).set("merge", TEXT);
    const edges = [
      ...ifEdges,
      edge("e-m1", "no", "output", "merge", "a"),
      edge("e-m2", "no2", "output", "merge", "b")
    ];
    const result = findUntakenBranch(
      types,
      edges,
      statuses({ "e-false": { status: "completed", counter: 0 } })
    );
    expect(result.nodeIds.has("merge")).toBe(true);
  });

  it("dims the Switch output that never carried a message", () => {
    const types = new Map<string, string>([
      ["switch", SWITCH],
      ["hit", TEXT],
      ["miss", TEXT],
      ["idx", TEXT]
    ]);
    const edges = [
      edge("e-matched", "switch", "matched", "hit"),
      edge("e-default", "switch", "default", "miss"),
      edge("e-index", "switch", "index", "idx")
    ];
    const result = findUntakenBranch(
      types,
      edges,
      statuses({
        "e-matched": { status: "completed", counter: 1 },
        "e-default": { status: "completed" },
        "e-index": { status: "completed", counter: 1 }
      })
    );
    expect([...result.nodeIds]).toEqual(["miss"]);
  });

  it("ignores empty outputs of nodes that are not branch nodes", () => {
    const types = new Map<string, string>([
      ["filter", "nodetool.control.FilterEqual"],
      ["next", TEXT]
    ]);
    const result = findUntakenBranch(
      types,
      [edge("e", "filter", "output", "next")],
      statuses({ e: { status: "completed" } })
    );
    expect(result).toBe(EMPTY_UNTAKEN_BRANCH);
  });

  it("does not count control edges as inputs", () => {
    const types = new Map(nodeTypes).set("agent", TEXT);
    const edges: Edge[] = [
      ...ifEdges,
      {
        ...edge("e-ctl", "agent", "__control__", "no2", "__control__"),
        data: { edge_type: "control" }
      },
      {
        ...edge("e-ctl2", "agent", "__control__", "no", "__control__"),
        type: "control"
      }
    ];
    const result = findUntakenBranch(
      types,
      edges,
      statuses({ "e-false": { status: "completed" } })
    );
    expect([...result.nodeIds].sort()).toEqual(["no", "no2"]);
  });

  it("terminates on cycles", () => {
    const edges = [
      ...ifEdges,
      edge("e-back", "no2", "output", "no", "b")
    ];
    const result = findUntakenBranch(
      nodeTypes,
      edges,
      statuses({ "e-false": { status: "completed" } })
    );
    // `no` also waits on `no2`, which it feeds, so the kernel's rule never
    // marks either side dead from a single branch edge.
    expect(result.nodeIds.size).toBe(0);
    expect([...result.edgeIds]).toEqual(["e-false"]);
  });
});

describe("sameUntakenBranch", () => {
  it("compares node and edge ids", () => {
    const a = { nodeIds: new Set(["n"]), edgeIds: new Set(["e"]) };
    expect(sameUntakenBranch(a, { nodeIds: new Set(["n"]), edgeIds: new Set(["e"]) })).toBe(true);
    expect(sameUntakenBranch(a, { nodeIds: new Set(["m"]), edgeIds: new Set(["e"]) })).toBe(false);
    expect(sameUntakenBranch(a, EMPTY_UNTAKEN_BRANCH)).toBe(false);
  });
});
