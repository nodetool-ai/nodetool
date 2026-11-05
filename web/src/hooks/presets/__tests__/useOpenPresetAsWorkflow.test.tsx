import { act, renderHook } from "@testing-library/react";
import { useOpenPresetAsWorkflow } from "../useOpenPresetAsWorkflow";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import type { WorkflowRequest } from "../../../stores/ApiTypes";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { ejectPresetIds } from "../../../lib/presets/ejectPresets";

const mockCreate = jest.fn();
const mockNotify = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (select: (state: unknown) => unknown) =>
    select({ create: mockCreate })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (select: (state: unknown) => unknown) =>
    select({ addNotification: mockNotify })
}));

describe("useOpenPresetAsWorkflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkspaceTabsStore.setState({
      tabs: [],
      activeTabId: null,
      activeProjectId: "project-a",
      personalProjectId: null,
      projectSessions: {}
    });
  });

  it("creates a workflow from the ejected graph in the open project and opens it in a tab", async () => {
    mockCreate.mockResolvedValue({ id: "wf-1", name: "Levitate" });
    const { result } = renderHook(() => useOpenPresetAsWorkflow());
    await act(async () => {
      await result.current(["effect.levitate"], {
        kind: "video",
        model: { provider: "fake", id: "fake-video" }
      });
    });
    const request = mockCreate.mock.calls[0][0];
    expect(request).toMatchObject({
      name: "Levitate",
      access: "private",
      project_id: "project-a"
    });
    const nodeTypes = request.graph.nodes.map((node: { type: string }) => node.type);
    expect(nodeTypes).toContain("nodetool.video.ImageToVideo");
    const generator = request.graph.nodes.find(
      (node: { id: string }) => node.id === "generate"
    );
    expect(generator.data.model).toMatchObject({ provider: "fake", id: "fake-video" });
    const tab = useWorkspaceTabsStore.getState().getActiveTab();
    expect(tab).toMatchObject({ type: "workflow", ref: "wf-1", mode: "edit", projectId: "project-a" });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("starts with an unselected model when none is given", async () => {
    mockCreate.mockResolvedValue({ id: "wf-2", name: "Levitate" });
    const { result } = renderHook(() => useOpenPresetAsWorkflow());
    await act(async () => {
      await result.current(["effect.levitate"], { kind: "video" });
    });
    const generator = mockCreate.mock.calls[0][0].graph.nodes.find(
      (node: { id: string }) => node.id === "generate"
    );
    expect(generator.data.model.id).toBe("");
  });

  it("preserves Golden embers node positions when the saved graph opens in the editor", async () => {
    const presetIds = ["effect.golden-embers"];
    const model = { provider: "fake", id: "fake-video" };
    const ejected = ejectPresetIds(presetIds, "video", model);
    if (!ejected) {
      throw new Error("Golden embers must eject a workflow");
    }
    mockCreate.mockResolvedValue({ id: "wf-embers", name: "Golden embers" });
    const { result } = renderHook(() => useOpenPresetAsWorkflow());
    await act(async () => {
      await result.current(presetIds, { kind: "video", model });
    });

    const request: WorkflowRequest = mockCreate.mock.calls[0][0];
    if (!request.graph) {
      throw new Error("The created workflow must contain a graph");
    }
    expect(request.graph.nodes).toHaveLength(ejected.graph.nodes.length);
    for (const node of request.graph.nodes) {
      const original = ejected.graph.nodes.find((source) => source.id === node.id);
      expect(original).toBeDefined();
      expect(graphNodeToReactFlowNode({ id: "wf-embers" }, node).position).toEqual(
        original!.position
      );
    }
    expect(request.graph.edges).toEqual(ejected.graph.edges);
  });

  it("reports an unknown preset and a failed create as notifications, not dead clicks", async () => {
    const { result } = renderHook(() => useOpenPresetAsWorkflow());
    await act(async () => {
      await result.current(["effect.nope"], { kind: "video" });
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", content: expect.stringContaining("no workflow") })
    );
    mockCreate.mockRejectedValue(new Error("Server unavailable"));
    await act(async () => {
      await result.current(["effect.levitate"], { kind: "video" });
    });
    expect(mockNotify).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Server unavailable") })
    );
    expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(0);
  });
});
