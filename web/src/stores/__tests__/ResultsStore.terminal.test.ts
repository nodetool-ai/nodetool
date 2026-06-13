import useResultsStore from "../ResultsStore";
import type { TerminalUpdate } from "../ApiTypes";

const update = (overrides: Partial<TerminalUpdate> = {}): TerminalUpdate => ({
  type: "terminal_update",
  node_id: "node-1",
  content: "",
  ...overrides
});

describe("ResultsStore terminal buffers", () => {
  const wf = "workflow-1";
  const job = "job-1";
  const node = "node-1";

  beforeEach(() => {
    useResultsStore.setState({ terminals: {} });
  });

  it("appends consecutive updates and keeps the version stable", () => {
    const store = useResultsStore.getState();
    store.addTerminal(wf, job, node, update({ content: "$ ls\r\n", cols: 120, rows: 36 }));
    store.addTerminal(wf, job, node, update({ content: "file.txt\r\n" }));

    const terminal = useResultsStore.getState().getTerminal(wf, job, node);
    expect(terminal?.buffer).toBe("$ ls\r\nfile.txt\r\n");
    expect(terminal?.cols).toBe(120);
    expect(terminal?.rows).toBe(36);
    expect(terminal?.version).toBe(0);
  });

  it("replaces the buffer and bumps the version on reset snapshots", () => {
    const store = useResultsStore.getState();
    store.addTerminal(wf, job, node, update({ content: "old output" }));
    store.addTerminal(wf, job, node, update({ content: "fresh screen", reset: true }));

    const terminal = useResultsStore.getState().getTerminal(wf, job, node);
    expect(terminal?.buffer).toBe("fresh screen");
    expect(terminal?.version).toBe(1);
  });

  it("trims oversized buffers from the front and bumps the version", () => {
    const store = useResultsStore.getState();
    const big = "x".repeat(600 * 1024);
    store.addTerminal(wf, job, node, update({ content: big }));

    const terminal = useResultsStore.getState().getTerminal(wf, job, node);
    expect(terminal?.buffer.length).toBe(256 * 1024);
    expect(terminal?.version).toBe(1);
  });

  it("keys buffers by workflow, job, and node", () => {
    const store = useResultsStore.getState();
    store.addTerminal(wf, job, node, update({ content: "a" }));
    store.addTerminal(wf, "job-2", node, update({ content: "b" }));

    expect(useResultsStore.getState().getTerminal(wf, job, node)?.buffer).toBe("a");
    expect(useResultsStore.getState().getTerminal(wf, "job-2", node)?.buffer).toBe("b");
  });

  it("is cleared by clearResults", () => {
    const store = useResultsStore.getState();
    store.addTerminal(wf, job, node, update({ content: "a" }));
    store.addTerminal("workflow-2", job, node, update({ content: "b" }));
    store.clearResults(wf);

    expect(useResultsStore.getState().getTerminal(wf, job, node)).toBeUndefined();
    expect(useResultsStore.getState().getTerminal("workflow-2", job, node)?.buffer).toBe("b");
  });
});
