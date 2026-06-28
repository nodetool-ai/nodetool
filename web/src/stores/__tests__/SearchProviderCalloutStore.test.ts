import { renderHook, act } from "@testing-library/react";
import { useSearchProviderCalloutStore } from "../SearchProviderCalloutStore";

describe("SearchProviderCalloutStore", () => {
  beforeEach(() => {
    useSearchProviderCalloutStore.setState(
      useSearchProviderCalloutStore.getInitialState()
    );
  });

  it("initializes with dialog closed and empty nodes", () => {
    const { result } = renderHook(() => useSearchProviderCalloutStore());
    expect(result.current.open).toBe(false);
    expect(result.current.nodes).toEqual([]);
  });

  it("show() opens the dialog and sets the triggering nodes", () => {
    const { result } = renderHook(() => useSearchProviderCalloutStore());
    const nodes = [
      { nodeId: "n1", nodeTitle: "Agent" }
    ];

    act(() => {
      result.current.show(nodes);
    });

    expect(result.current.open).toBe(true);
    expect(result.current.nodes).toEqual(nodes);
  });

  it("dismiss() closes the dialog and clears nodes", () => {
    const { result } = renderHook(() => useSearchProviderCalloutStore());
    const nodes = [
      { nodeId: "n1", nodeTitle: "Agent" }
    ];

    act(() => {
      result.current.show(nodes);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.nodes).toEqual([]);
  });

  it("show() replaces previous nodes", () => {
    const { result } = renderHook(() => useSearchProviderCalloutStore());
    const first = [
      { nodeId: "n1", nodeTitle: "Node 1" }
    ];
    const second = [
      { nodeId: "n2", nodeTitle: "Node 2" },
      { nodeId: "n3", nodeTitle: "Node 3" }
    ];

    act(() => {
      result.current.show(first);
    });
    expect(result.current.nodes).toHaveLength(1);

    act(() => {
      result.current.show(second);
    });
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0].nodeId).toBe("n2");
  });
});
