import useResultsStore from "../ResultsStore";
import type { TerminalUpdate } from "../ApiTypes";
import { nodeKey, edgeKey } from "../nodeKey";

const WF = "wf-1";
const JOB = "job-1";
const NODE = "node-1";

const term = (overrides: Partial<TerminalUpdate> = {}): TerminalUpdate => ({
  type: "terminal_update",
  node_id: NODE,
  content: "",
  ...overrides
});

const resetStore = () =>
  useResultsStore.setState({
    outputResults: {},
    liveGenerations: {},
    providerCosts: {},
    progress: {},
    chunks: {},
    terminals: {},
    tasks: {},
    toolCalls: {},
    toolResults: {},
    edges: {},
    planningUpdates: {}
  } as never);

beforeEach(resetStore);

describe("ResultsStore — output results", () => {
  it("setOutputResult stores and getOutputResult retrieves", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, { value: 42 });
    expect(useResultsStore.getState().getOutputResult(WF, JOB, NODE)).toEqual({
      value: 42
    });
  });

  it("setOutputResult with append=false replaces", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, "first");
    s.setOutputResult(WF, JOB, NODE, "second", false);
    expect(useResultsStore.getState().getOutputResult(WF, JOB, NODE)).toBe(
      "second"
    );
  });

  it("setOutputResult with append wraps scalar into array", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, "first");
    s.setOutputResult(WF, JOB, NODE, "second", true);
    expect(useResultsStore.getState().getOutputResult(WF, JOB, NODE)).toEqual([
      "first",
      "second"
    ]);
  });

  it("setOutputResult with append extends existing array", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, ["a"]);
    s.setOutputResult(WF, JOB, NODE, "b", true);
    expect(useResultsStore.getState().getOutputResult(WF, JOB, NODE)).toEqual([
      "a",
      "b"
    ]);
  });

  it("appendOutputResults batch-appends in one set", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, "init");
    s.appendOutputResults(WF, JOB, NODE, ["x", "y"]);
    expect(useResultsStore.getState().getOutputResult(WF, JOB, NODE)).toEqual([
      "init",
      "x",
      "y"
    ]);
  });

  it("appendOutputResults with empty array is a no-op", () => {
    const ref = useResultsStore.getState().outputResults;
    useResultsStore.getState().appendOutputResults(WF, JOB, NODE, []);
    expect(useResultsStore.getState().outputResults).toBe(ref);
  });
});

describe("ResultsStore — edges", () => {
  it("setEdge stores and direct map retrieves", () => {
    const s = useResultsStore.getState();
    s.setEdge(WF, JOB, "e1", "active", 1);
    expect(useResultsStore.getState().edges[edgeKey(WF, JOB, "e1")]).toEqual({
      status: "active",
      counter: 1
    });
  });

  it("setEdge no-ops on duplicate status+counter", () => {
    const s = useResultsStore.getState();
    s.setEdge(WF, JOB, "e1", "active", 1);
    const ref = useResultsStore.getState().edges;
    useResultsStore.getState().setEdge(WF, JOB, "e1", "active", 1);
    expect(useResultsStore.getState().edges).toBe(ref);
  });

  it("clearEdges removes edges for a workflow", () => {
    const s = useResultsStore.getState();
    s.setEdge(WF, JOB, "e1", "active");
    s.setEdge("wf-other", JOB, "e2", "active");
    useResultsStore.getState().clearEdges(WF);
    expect(useResultsStore.getState().edges[edgeKey(WF, JOB, "e1")]).toBeUndefined();
    expect(
      useResultsStore.getState().edges[edgeKey("wf-other", JOB, "e2")]
    ).toBeDefined();
  });
});

describe("ResultsStore — progress", () => {
  it("setProgress stores progress and concatenates chunks", () => {
    const s = useResultsStore.getState();
    s.setProgress(WF, JOB, NODE, 1, 10, "Hello");
    s.setProgress(WF, JOB, NODE, 2, 10, " World");
    const p = useResultsStore.getState().getProgress(WF, JOB, NODE);
    expect(p).toEqual({ progress: 2, total: 10, chunk: "Hello World" });
  });

  it("getProgress returns undefined for unknown key", () => {
    expect(
      useResultsStore.getState().getProgress(WF, JOB, "nonexistent")
    ).toBeUndefined();
  });
});

describe("ResultsStore — chunks", () => {
  it("addChunk concatenates text", () => {
    const s = useResultsStore.getState();
    s.addChunk(WF, JOB, NODE, "foo");
    s.addChunk(WF, JOB, NODE, "bar");
    expect(useResultsStore.getState().chunks[nodeKey(WF, JOB, NODE)]).toBe("foobar");
  });

  it("getChunk returns undefined for unknown key", () => {
    expect(
      useResultsStore.getState().chunks[nodeKey(WF, JOB, "none")]
    ).toBeUndefined();
  });
});

describe("ResultsStore — terminal", () => {
  it("addTerminal appends content", () => {
    const s = useResultsStore.getState();
    s.addTerminal(WF, JOB, NODE, term({ content: "line1\n", cols: 80, rows: 24 }));
    s.addTerminal(WF, JOB, NODE, term({ content: "line2\n" }));
    const t = useResultsStore.getState().terminals[nodeKey(WF, JOB, NODE)];
    expect(t?.buffer).toBe("line1\nline2\n");
    expect(t?.version).toBe(0);
  });

  it("addTerminal with reset replaces buffer and bumps version", () => {
    const s = useResultsStore.getState();
    s.addTerminal(WF, JOB, NODE, term({ content: "old" }));
    s.addTerminal(WF, JOB, NODE, term({ content: "new-snapshot", reset: true }));
    const t = useResultsStore.getState().terminals[nodeKey(WF, JOB, NODE)];
    expect(t?.buffer).toBe("new-snapshot");
    expect(t?.version).toBe(1);
  });

  it("addTerminal uses default cols/rows when not provided", () => {
    useResultsStore.getState().addTerminal(WF, JOB, NODE, term({ content: "x" }));
    const t = useResultsStore.getState().terminals[nodeKey(WF, JOB, NODE)];
    expect(t?.cols).toBe(80);
    expect(t?.rows).toBe(24);
  });
});

describe("ResultsStore — tool calls and results", () => {
  it("setToolCall / getToolCall round-trips", () => {
    const tc = { name: "tool1", args: { x: 1 } };
    useResultsStore.getState().setToolCall(WF, JOB, NODE, tc as never);
    expect(
      useResultsStore.getState().toolCalls[nodeKey(WF, JOB, NODE)]
    ).toMatchObject(tc);
  });

  it("appendToolResult accumulates results", () => {
    const s = useResultsStore.getState();
    s.appendToolResult(WF, JOB, NODE, "result1");
    s.appendToolResult(WF, JOB, NODE, "result2");
    expect(useResultsStore.getState().toolResults[nodeKey(WF, JOB, NODE)] ?? []).toEqual([
      "result1",
      "result2"
    ]);
  });

  it("getToolResults returns empty array for unknown key", () => {
    expect(
      useResultsStore.getState().toolResults[nodeKey(WF, JOB, "none")] ?? []
    ).toEqual([]);
  });
});

describe("ResultsStore — clearResults", () => {
  it("clears all maps for a workflow", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, "val");
    s.setProgress(WF, JOB, NODE, 5, 10);
    s.addChunk(WF, JOB, NODE, "ch");
    s.setTask(WF, JOB, NODE, { id: "t1" } as never);

    useResultsStore.getState().clearResults(WF);

    const after = useResultsStore.getState();
    expect(after.getOutputResult(WF, JOB, NODE)).toBeUndefined();
    expect(after.getProgress(WF, JOB, NODE)).toBeUndefined();
    expect(after.chunks[nodeKey(WF, JOB, NODE)]).toBeUndefined();
    expect(after.tasks[nodeKey(WF, JOB, NODE)]).toBeUndefined();
  });

  it("clearResults with nodeIds only clears specified nodes", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, "keep", "keep-val");
    s.setOutputResult(WF, JOB, "drop", "drop-val");

    useResultsStore.getState().clearResults(WF, new Set(["drop"]));

    const after = useResultsStore.getState();
    expect(after.getOutputResult(WF, JOB, "keep")).toBe("keep-val");
    expect(after.getOutputResult(WF, JOB, "drop")).toBeUndefined();
  });

  it("clearResults does not touch other workflows", () => {
    const s = useResultsStore.getState();
    s.setOutputResult(WF, JOB, NODE, "mine");
    s.setOutputResult("wf-other", JOB, NODE, "theirs");

    useResultsStore.getState().clearResults(WF);

    expect(
      useResultsStore.getState().getOutputResult("wf-other", JOB, NODE)
    ).toBe("theirs");
  });
});

describe("ResultsStore — clearJobRunVisuals", () => {
  it("clears edges and progress for the specific job", () => {
    const s = useResultsStore.getState();
    s.setEdge(WF, JOB, "e1", "active");
    s.setProgress(WF, JOB, NODE, 3, 10);
    s.setOutputResult(WF, JOB, NODE, "result");

    useResultsStore.getState().clearJobRunVisuals(WF, JOB);

    const after = useResultsStore.getState();
    expect(after.edges[edgeKey(WF, JOB, "e1")]).toBeUndefined();
    expect(after.getProgress(WF, JOB, NODE)).toBeUndefined();
    expect(after.getOutputResult(WF, JOB, NODE)).toBe("result");
  });
});
