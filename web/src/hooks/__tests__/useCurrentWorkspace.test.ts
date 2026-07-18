import { renderHook, act, waitFor } from "@testing-library/react";
import { useCurrentWorkspace } from "../useCurrentWorkspace";

const mockUpdateWorkflow = jest.fn();
const mockSaveWorkflow = jest.fn().mockResolvedValue(undefined);
const mockGetCurrentWorkflow = jest.fn();

let mockCurrentWorkflowId: string | null = null;
let mockOpenWorkflows: Array<{ id: string; workspace_id: string | null }> = [];

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn((selector: (state: any) => any) => {
    const state = {
      currentWorkflowId: mockCurrentWorkflowId,
      getCurrentWorkflow: mockGetCurrentWorkflow,
      updateWorkflow: mockUpdateWorkflow,
      saveWorkflow: mockSaveWorkflow,
      openWorkflows: mockOpenWorkflows
    };
    return selector(state);
  })
}));

let mockLastUsedWorkspaceId: string | null = null;
const mockSetLastUsedWorkspaceId = jest.fn(
  (id: string | null) => {
    mockLastUsedWorkspaceId = id;
  }
);

jest.mock("../../stores/CurrentWorkspaceStore", () => ({
  useCurrentWorkspaceStore: jest.fn((selector: (state: any) => any) => {
    const state = {
      lastUsedWorkspaceId: mockLastUsedWorkspaceId,
      setLastUsedWorkspaceId: mockSetLastUsedWorkspaceId
    };
    return selector(state);
  })
}));

describe("useCurrentWorkspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentWorkflowId = null;
    mockOpenWorkflows = [];
    mockLastUsedWorkspaceId = null;
    mockGetCurrentWorkflow.mockReturnValue(null);
  });

  it("returns undefined workspaceId when no workflow is open and no last-used", () => {
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBeUndefined();
    expect(result.current.hasActiveWorkflow).toBe(false);
  });

  it("falls back to lastUsedWorkspaceId when no workflow is open", () => {
    mockLastUsedWorkspaceId = "ws-fallback";
    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-fallback");
  });

  it("reads workspaceId from the active workflow", () => {
    mockCurrentWorkflowId = "wf-1";
    mockOpenWorkflows = [{ id: "wf-1", workspace_id: "ws-active" }];
    mockGetCurrentWorkflow.mockReturnValue({
      id: "wf-1",
      workspace_id: "ws-active"
    });

    const { result } = renderHook(() => useCurrentWorkspace());
    expect(result.current.workspaceId).toBe("ws-active");
    expect(result.current.hasActiveWorkflow).toBe(true);
  });

  it("setWorkspaceId updates lastUsed, patches workflow, and saves", async () => {
    const workflow = { id: "wf-1", workspace_id: null };
    mockCurrentWorkflowId = "wf-1";
    mockOpenWorkflows = [{ id: "wf-1", workspace_id: null }];
    mockGetCurrentWorkflow.mockReturnValue(workflow);

    const { result } = renderHook(() => useCurrentWorkspace());

    await act(async () => {
      await result.current.setWorkspaceId("ws-new");
    });

    expect(mockSetLastUsedWorkspaceId).toHaveBeenCalledWith("ws-new");
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "ws-new" })
    );
    expect(mockSaveWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "ws-new" })
    );
  });

  it("setWorkspaceId with undefined normalizes to null", async () => {
    const workflow = { id: "wf-1", workspace_id: "ws-old" };
    mockCurrentWorkflowId = "wf-1";
    mockGetCurrentWorkflow.mockReturnValue(workflow);

    const { result } = renderHook(() => useCurrentWorkspace());

    await act(async () => {
      await result.current.setWorkspaceId(undefined);
    });

    expect(mockSetLastUsedWorkspaceId).toHaveBeenCalledWith(null);
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: null })
    );
  });

  it("setWorkspaceId does not call updateWorkflow when no workflow is open", async () => {
    mockGetCurrentWorkflow.mockReturnValue(null);

    const { result } = renderHook(() => useCurrentWorkspace());

    await act(async () => {
      await result.current.setWorkspaceId("ws-x");
    });

    expect(mockSetLastUsedWorkspaceId).toHaveBeenCalledWith("ws-x");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    expect(mockSaveWorkflow).not.toHaveBeenCalled();
  });
});
