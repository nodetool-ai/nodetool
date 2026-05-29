import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({ useNodes: jest.fn() }));
jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn(() => Promise.resolve({ success: true, outputs: {} }))
}));

import { useNodes } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";

const mockUseNodes = useNodes as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockUseMetadataStore = useMetadataStore as unknown as jest.Mock;
const mockRunInline = runInlineGraphJob as unknown as jest.Mock;

const graphArg = (call = 0) => mockRunInline.mock.calls[call][0].graph;

describe("useRunFromHere (Run Node)", () => {
  const mockGetResult = jest.fn();
  const mockAddNotification = jest.fn();
  const mockFindNode = jest.fn();

  const nodeA = {
    id: "node-a",
    type: "nodetool.llm.Chat",
    data: { properties: {} }
  };
  const nodeB = {
    id: "node-b",
    type: "nodetool.output.TextOutput",
    data: { properties: {} }
  };
  const edges = [
    {
      id: "e1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "output",
      targetHandle: "value"
    }
  ];
  const workflow = { id: "workflow-1", name: "WF" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunInline.mockImplementation(() =>
      Promise.resolve({ success: true, outputs: {} })
    );
    mockUseNodes.mockImplementation((selector) =>
      selector({ edges, workflow, findNode: mockFindNode })
    );
    mockUseResultsStore.mockImplementation((selector) =>
      selector({ getResult: mockGetResult })
    );
    mockUseNotificationStore.mockImplementation((selector) =>
      selector({ addNotification: mockAddNotification })
    );
    mockUseMetadataStore.mockImplementation((selector) =>
      selector({ getMetadata: () => ({ title: "Chat" }) })
    );
    mockFindNode.mockImplementation((id: string) =>
      [nodeA, nodeB].find((n) => n.id === id)
    );
  });

  it("dispatches just the clicked node as an inline job", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(mockRunInline.mock.calls[0][0].workflowId).toBe("workflow-1");
    // The job is titled with the node's metadata title (shown in the queue).
    expect(mockRunInline.mock.calls[0][0].jobName).toBe("Chat");
    expect(graphArg().nodes.map((n: { id: string }) => n.id)).toEqual([
      "node-a"
    ]);
    expect(graphArg().edges).toEqual([]);
  });

  it("does not run when node is null", () => {
    const { result } = renderHook(() => useRunFromHere(null));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).not.toHaveBeenCalled();
  });

  it("sends only the clicked node even when it has inbound edges", () => {
    mockGetResult.mockReturnValue({ output: "cached" });
    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(graphArg().nodes.map((n: { id: string }) => n.id)).toEqual([
      "node-b"
    ]);
    expect(graphArg().edges).toEqual([]);
    // The cached upstream result is injected into the node's properties so it
    // runs with realistic inputs: resolveExternalEdgeValue extracts the
    // "output" handle from { output: "cached" } and writes it to the inbound
    // edge's "value" target handle.
    expect(graphArg().nodes[0].data).toEqual({ value: "cached" });
  });

  it("shows a notification", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", alert: false })
    );
  });

  it("reports isWorkflowRunning as false (independent jobs are never gated)", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));
    expect(result.current.isWorkflowRunning).toBe(false);
  });
});
