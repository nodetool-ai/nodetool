import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";
import {
  branchNodeIds,
  changedLayoutIds,
  createRunScopedSelector,
  firstWorkflowReadiness,
  markComprehensionEdges,
  nodeComprehensionClasses,
  nodeDrivenEdgeSelection,
  nodeLayoutSignature,
  sameIdSet,
  sortedKeysOf
} from "../reactFlowGraphModel";

const node = (
  id: string,
  data: Partial<NodeData> = {},
  extra: Partial<Node<NodeData>> = {}
): Node<NodeData> =>
  ({
    id,
    type: "test.Node",
    position: { x: 0, y: 0 },
    data: { properties: {}, ...data } as NodeData,
    ...extra
  }) as Node<NodeData>;

const edge = (
  id: string,
  source: string,
  target: string,
  extra: Partial<Edge> = {}
): Edge => ({
  id,
  source,
  target,
  ...extra
});

describe("sortedKeysOf", () => {
  it("joins sorted keys and caches by table identity", () => {
    const cache = new WeakMap<object, string>();
    const table = { b: 1, a: 2 } as unknown as NodeData["dynamic_inputs"];
    expect(sortedKeysOf(cache, table)).toBe("a,b");
    (table as Record<string, unknown>).c = 3;
    expect(sortedKeysOf(cache, table)).toBe("a,b");
    expect(sortedKeysOf(cache, undefined)).toBe("");
  });
});

describe("nodeLayoutSignature", () => {
  const cache = () => new WeakMap<object, string>();

  it("ignores position but tracks every layout field", () => {
    const base = node("n1");
    const moved = { ...base, position: { x: 50, y: 90 } };
    expect(nodeLayoutSignature(moved, cache())).toBe(
      nodeLayoutSignature(base, cache())
    );
    for (const changed of [
      { ...base, height: 120 },
      { ...base, style: { height: 80 } },
      { ...base, style: { height: " 80px " } },
      node("n1", { collapsed: true }),
      node("n1", { exposedInputs: ["prompt"] }),
      node("n1", {
        dynamic_outputs: { out: {} } as unknown as NodeData["dynamic_outputs"]
      })
    ]) {
      expect(nodeLayoutSignature(changed, cache())).not.toBe(
        nodeLayoutSignature(base, cache())
      );
    }
  });

  it("trims a string style height", () => {
    expect(
      nodeLayoutSignature(
        node("a", {}, { style: { height: " 80px " } }),
        cache()
      )
    ).toBe(
      nodeLayoutSignature(node("a", {}, { style: { height: "80px" } }), cache())
    );
  });
});

describe("changedLayoutIds", () => {
  it("reports new and changed nodes and forgets removed ones", () => {
    const known = new Map<string, string>();
    const keys = new WeakMap<object, string>();
    expect(changedLayoutIds([node("a"), node("b")], known, keys)).toEqual([
      "a",
      "b"
    ]);
    expect(changedLayoutIds([node("a"), node("b")], known, keys)).toEqual([]);
    expect(
      changedLayoutIds([node("a", { collapsed: true })], known, keys)
    ).toEqual(["a"]);
    expect([...known.keys()]).toEqual(["a"]);
  });
});

describe("firstWorkflowReadiness", () => {
  const input = { id: "in", type: "nodetool.input.StringInput" };
  const output = { id: "out", type: "nodetool.output.Output" };

  it("is all false on an empty canvas", () => {
    expect(firstWorkflowReadiness([], [], false, [])).toEqual({
      input: false,
      output: false,
      connection: false,
      saved: false,
      run: false
    });
  });

  it("needs an input-to-output edge, a clean save and a completed run", () => {
    expect(
      firstWorkflowReadiness(
        [input, output],
        [{ source: "in", target: "out" }],
        false,
        [{ state: "failed" }, { state: "completed" }]
      )
    ).toEqual({
      input: true,
      output: true,
      connection: true,
      saved: true,
      run: true
    });
    expect(
      firstWorkflowReadiness(
        [input, output],
        [{ source: "out", target: "in" }],
        true,
        []
      )
    ).toMatchObject({ connection: false, saved: false, run: false });
  });
});

describe("createRunScopedSelector", () => {
  type State = { map: Record<string, number> };
  const pick = (s: State) => s.map;

  it("keeps only the run's entries and the same object while they are unchanged", () => {
    const select = createRunScopedSelector<State, number>("wf:job1:", pick);
    const first = select({ map: { "wf:job1:a": 1, "wf:job2:a": 2 } });
    expect(first).toEqual({ "wf:job1:a": 1 });
    expect(select({ map: { "wf:job1:a": 1, "wf:job2:a": 3 } })).toBe(first);
    const changed = select({ map: { "wf:job1:a": 4 } });
    expect(changed).toEqual({ "wf:job1:a": 4 });
    expect(select({ map: {} })).toEqual({});
  });

  it("returns the same source result when the map identity is unchanged", () => {
    const select = createRunScopedSelector<State, number>("wf:j:", pick);
    const map = { "wf:j:x": 1 };
    expect(select({ map })).toBe(select({ map }));
  });

  it("is empty without a focused run", () => {
    const select = createRunScopedSelector<State, number>(null, pick);
    const empty = select({ map: { "wf:j:x": 1 } });
    expect(empty).toEqual({});
    expect(select({ map: { "wf:j:y": 2 } })).toBe(empty);
  });
});

describe("branchNodeIds", () => {
  const edges = [
    edge("1", "a", "b"),
    edge("2", "b", "c"),
    edge("3", "d", "b"),
    edge("4", "x", "y")
  ];

  it("walks upstream and downstream from the selection", () => {
    expect([...branchNodeIds(new Set(["b"]), edges)].sort()).toEqual([
      "a",
      "b",
      "c",
      "d"
    ]);
    expect([...branchNodeIds(new Set(["c"]), edges)].sort()).toEqual([
      "a",
      "b",
      "c",
      "d"
    ]);
    expect([...branchNodeIds(new Set(["a"]), edges)].sort()).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("is empty without a selection", () => {
    expect(branchNodeIds(new Set(), edges).size).toBe(0);
  });

  it("handles a cycle", () => {
    const cycle = [edge("1", "a", "b"), edge("2", "b", "a")];
    expect([...branchNodeIds(new Set(["a"]), cycle)].sort()).toEqual([
      "a",
      "b"
    ]);
  });
});

describe("comprehension classes", () => {
  const context = {
    selectionActive: true,
    branch: new Set(["a", "b"]),
    notRun: new Set(["c", "e2"])
  };

  it("labels nodes on and off the branch, and not-run nodes", () => {
    expect(nodeComprehensionClasses("a", context)).toBe("branch-related");
    expect(nodeComprehensionClasses("c", context)).toBe(
      "branch-dimmed not-run"
    );
    expect(
      nodeComprehensionClasses("c", { ...context, selectionActive: false })
    ).toBe("not-run");
    expect(
      nodeComprehensionClasses("a", { ...context, selectionActive: false })
    ).toBe("");
  });

  it("marks edges and keeps untouched ones by identity", () => {
    const edges = [
      edge("e1", "a", "b", { className: "flow" }),
      edge("e2", "b", "c")
    ];
    const marked = markComprehensionEdges(edges, context);
    expect(marked.map((e) => e.className)).toEqual([
      "flow branch-related",
      "branch-dimmed not-run"
    ]);
    const idle = {
      selectionActive: false,
      branch: new Set<string>(),
      notRun: new Set<string>()
    };
    expect(markComprehensionEdges(edges, idle)).toBe(edges);
    const onlyNotRun = markComprehensionEdges(edges, {
      ...idle,
      notRun: new Set(["e2"])
    });
    expect(onlyNotRun[0]).toBe(edges[0]);
  });
});

describe("nodeDrivenEdgeSelection", () => {
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "b", "c", { selected: true }),
    edge("e3", "x", "y", { selected: true })
  ];

  it("selects edges touching selected nodes and keeps clicked edges", () => {
    const result = nodeDrivenEdgeSelection(
      edges,
      new Set(["a"]),
      new Set(),
      false
    );
    expect(result.updates).toEqual({ e1: true });
    expect([...result.nodeDriven]).toEqual(["e1"]);
  });

  it("deselects an edge it selected once its node is deselected", () => {
    const result = nodeDrivenEdgeSelection(
      edges,
      new Set(),
      new Set(["e2"]),
      false
    );
    expect(result.updates).toEqual({ e2: false });
    expect(result.nodeDriven.size).toBe(0);
  });

  it("selects nothing by node while suppressed", () => {
    const result = nodeDrivenEdgeSelection(
      edges,
      new Set(["a"]),
      new Set(),
      true
    );
    expect(result.updates).toEqual({});
  });
});

describe("sameIdSet", () => {
  it("compares membership", () => {
    expect(sameIdSet(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameIdSet(new Set(["a"]), new Set(["b"]))).toBe(false);
    expect(sameIdSet(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});
