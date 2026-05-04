import { renderHook } from "@testing-library/react";
import { useIsConnectedSelector } from "../useIsConnected";
import { Edge } from "@xyflow/react";

describe("useIsConnectedSelector", () => {
  const makeEdge = (source: string, target: string, targetHandle: string): Edge => ({
    id: `${source}-${target}-${targetHandle}`,
    source,
    target,
    targetHandle
  });

  const makeState = (edges: Edge[]) =>
    ({ edges }) as { edges: Edge[] };

  it("returns true when a matching edge exists", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_0")
    );
    const selector = result.current;

    const state = makeState([makeEdge("node-0", "node-1", "input_0")]);
    expect(selector(state as never)).toBe(true);
  });

  it("returns false when no matching edge exists", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_0")
    );
    const selector = result.current;

    const state = makeState([makeEdge("node-0", "node-2", "input_0")]);
    expect(selector(state as never)).toBe(false);
  });

  it("returns false for empty edges", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_0")
    );
    const selector = result.current;

    const state = makeState([]);
    expect(selector(state as never)).toBe(false);
  });

  it("distinguishes between different target handles on same node", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_1")
    );
    const selector = result.current;

    const state = makeState([makeEdge("node-0", "node-1", "input_0")]);
    expect(selector(state as never)).toBe(false);
  });

  it("caches result when edges array reference is unchanged", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_0")
    );
    const selector = result.current;

    const edges = [makeEdge("node-0", "node-1", "input_0")];
    const state = makeState(edges);

    const firstCall = selector(state as never);
    const secondCall = selector(state as never);

    expect(firstCall).toBe(true);
    expect(secondCall).toBe(true);
    expect(firstCall).toBe(secondCall);
  });

  it("recomputes when edges reference changes", () => {
    const { result } = renderHook(() =>
      useIsConnectedSelector("node-1", "input_0")
    );
    const selector = result.current;

    const state1 = makeState([makeEdge("node-0", "node-1", "input_0")]);
    expect(selector(state1 as never)).toBe(true);

    const state2 = makeState([]);
    expect(selector(state2 as never)).toBe(false);
  });
});
