import { useSearchProviderCalloutStore } from "../SearchProviderCalloutStore";
import type { SearchToolNode } from "../../utils/findSearchToolNodes";

const makeNode = (id: string): SearchToolNode =>
  ({ node_type: `search.${id}`, id }) as unknown as SearchToolNode;

describe("SearchProviderCalloutStore", () => {
  beforeEach(() => {
    useSearchProviderCalloutStore.setState({ open: false, nodes: [] });
  });

  it("starts closed with empty nodes", () => {
    const { open, nodes } = useSearchProviderCalloutStore.getState();
    expect(open).toBe(false);
    expect(nodes).toEqual([]);
  });

  it("show() opens the dialog and sets nodes", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    useSearchProviderCalloutStore.getState().show(nodes);
    const state = useSearchProviderCalloutStore.getState();
    expect(state.open).toBe(true);
    expect(state.nodes).toBe(nodes);
  });

  it("dismiss() closes and clears nodes", () => {
    const nodes = [makeNode("a")];
    useSearchProviderCalloutStore.getState().show(nodes);
    useSearchProviderCalloutStore.getState().dismiss();
    const state = useSearchProviderCalloutStore.getState();
    expect(state.open).toBe(false);
    expect(state.nodes).toEqual([]);
  });

  it("show() replaces previous nodes", () => {
    useSearchProviderCalloutStore.getState().show([makeNode("a")]);
    const newNodes = [makeNode("b"), makeNode("c")];
    useSearchProviderCalloutStore.getState().show(newNodes);
    const state = useSearchProviderCalloutStore.getState();
    expect(state.open).toBe(true);
    expect(state.nodes).toBe(newNodes);
  });
});
