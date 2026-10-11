jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import type { GraphLink } from "@nodetool-ai/protocol";
import type { Workflow } from "../ApiTypes";
import { createNodeStore } from "../NodeStore";
import { customEquality } from "../customEquality";
import useErrorStore from "../ErrorStore";
import useResultsStore from "../ResultsStore";

const graphNode = (id: string, x = 0) => ({
  id,
  type: "test",
  data: {},
  dynamic_properties: {},
  sync_mode: "automatic",
  ui_properties: { position: { x, y: 0 }, selected: false, selectable: true }
});

const workflowWith = (links?: GraphLink[]): Workflow => ({
  id: "wf-links",
  name: "Links",
  access: "private" as const,
  description: "",
  thumbnail: "",
  tags: [],
  settings: {},
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  graph: {
    nodes: [graphNode("a"), graphNode("b", 400), graphNode("c", 800)],
    edges: [],
    links
  }
});

const LINK: GraphLink = {
  id: "l".repeat(32),
  source: "a",
  target: "b",
  label: null,
  kind: null
};

describe("NodeStore lineage links", () => {
  const originalError = useErrorStore.getState();
  const originalResults = useResultsStore.getState();

  beforeEach(() => {
    useErrorStore.setState({ ...originalError, clearErrors: jest.fn() }, true);
    useResultsStore.setState(
      { ...originalResults, clearResults: jest.fn() },
      true
    );
  });

  afterEach(() => {
    useErrorStore.setState(originalError, true);
    useResultsStore.setState(originalResults, true);
  });

  it("loads links from the graph and drops ones with a missing node", () => {
    const dangling = { ...LINK, id: "d".repeat(32), target: "gone" };
    const store = createNodeStore(workflowWith([LINK, dangling]));
    expect(store.getState().links).toEqual([LINK]);
    expect(store.getState().edges).toEqual([]);
  });

  it("saves links beside edges and omits the key when there are none", () => {
    const linked = createNodeStore(workflowWith([LINK]));
    expect(linked.getState().getWorkflow().graph.links).toEqual([LINK]);
    expect(linked.getState().getWorkflow().graph.edges).toEqual([]);

    const plain = createNodeStore(workflowWith());
    expect("links" in plain.getState().getWorkflow().graph).toBe(false);
  });

  it("adds a link with a 32-hex id, dedupes, and refuses self links", () => {
    const store = createNodeStore(workflowWith());
    const link = store.getState().addLink("a", "c");
    expect(link?.id).toMatch(/^[0-9a-f]{32}$/);
    expect(store.getState().workflowIsDirty).toBe(true);

    expect(store.getState().addLink("a", "c")?.id).toBe(link?.id);
    expect(store.getState().addLink("a", "a")).toBeNull();
    expect(store.getState().links).toHaveLength(1);
    expect(store.getState().edges).toEqual([]);
  });

  it("removes links through deleteEdge and with a deleted node", () => {
    const store = createNodeStore(workflowWith([LINK]));
    store.getState().setLinkSelection([LINK.id]);
    store.getState().deleteEdge(LINK.id);
    expect(store.getState().links).toEqual([]);
    expect(store.getState().selectedLinkIds).toEqual([]);

    const other = createNodeStore(workflowWith([LINK]));
    other.getState().deleteNodes(["b"]);
    expect(other.getState().links).toEqual([]);
  });

  it("records an undo step for a new link", () => {
    const store = createNodeStore(workflowWith());
    store.getState().addLink("a", "b");
    expect(store.temporal.getState().pastStates.length).toBeGreaterThan(0);
    store.temporal.getState().undo();
    expect(store.getState().links).toEqual([]);
  });

  it("treats a link change as a history change", () => {
    const base = {
      workflow: workflowWith(),
      nodes: [],
      edges: [],
      links: []
    } as unknown as Parameters<typeof customEquality>[0];
    expect(customEquality(base, { ...base!, links: [LINK] })).toBe(false);
    expect(customEquality(base, { ...base! })).toBe(true);
  });

  it("keeps local links and applies remote link changes on an external merge", () => {
    const store = createNodeStore(workflowWith([LINK]));
    const state = store.getState();
    const remote: GraphLink = { ...LINK, id: "r".repeat(32), source: "b", target: "c" };
    state.applyExternalGraph(state.nodes, state.edges, undefined, [
      LINK,
      remote
    ]);
    expect(store.getState().links.map((link) => link.id)).toEqual([
      LINK.id,
      remote.id
    ]);
  });
});
