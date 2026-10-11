import { act, renderHook } from "@testing-library/react";
import { createStore } from "zustand/vanilla";
import { useGraphCounts } from "../PanelBottom";

type CountsState = { nodes: { id: string }[]; edges: { id: string }[] };

const store = createStore<CountsState>(() => ({
  nodes: [{ id: "a" }, { id: "b" }],
  edges: [{ id: "e" }]
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (select: (s: unknown) => unknown) =>
    select({ nodeStores: { wf: store } })
}));
jest.mock("../../../hooks/useRunningJobs", () => ({
  useRunningJobs: () => ({ data: [] })
}));
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {}
}));
jest.mock("../TracePanel", () => () => null);
jest.mock("../LogPanel", () => () => null);
jest.mock("../jobs/QueuePanel", () => () => null);
jest.mock("../../workers/WorkersPanel", () => () => null);
jest.mock("../../workers/WorkerStatusIndicator", () => () => null);
jest.mock("../../context_menus/ContextMenus", () => () => null);
jest.mock("../../version/VersionHistoryPanel", () => ({
  VersionHistoryPanel: () => null
}));

describe("useGraphCounts", () => {
  it("keeps the same result while a drag replaces the nodes array", () => {
    const { result } = renderHook(() => useGraphCounts("wf"));
    const first = result.current;
    expect(first).toEqual({ nodes: 2, edges: 1 });

    act(() => {
      store.setState({ nodes: store.getState().nodes.map((n) => ({ ...n })) });
    });
    expect(result.current).toBe(first);

    act(() => {
      store.setState({ nodes: [...store.getState().nodes, { id: "c" }] });
    });
    expect(result.current).toEqual({ nodes: 3, edges: 1 });
  });
});
