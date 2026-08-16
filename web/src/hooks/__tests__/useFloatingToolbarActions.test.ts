import { renderHook, act } from "@testing-library/react";
import { stub, type PartialMembers } from "../../test-utils/doubles";
import { useFloatingToolbarActions } from "../useFloatingToolbarActions";
import {
  useWebsocketRunner,
  type WorkflowRunner
} from "../../stores/WorkflowRunner";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { triggerAutosaveForWorkflow } from "../useAutosave";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useRunWarningStore } from "../../stores/RunWarningStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSearchProviderCalloutStore } from "../../stores/SearchProviderCalloutStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { selectFrom } from "../../__mocks__/fixtures";
import type { SettingWithValue, Workflow } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import type { NodeStore, NodeStoreState } from "../../stores/NodeStore";
import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";
import type { NodeMenuStore } from "../../stores/NodeMenuStore";
import { defaultSettings } from "../../stores/SettingsStore";
import { create } from "zustand";


type SettingsState = ReturnType<typeof useSettingsStore.getState>;
type BottomPanelState = ReturnType<typeof useBottomPanelStore.getState>;
type MiniMapState = ReturnType<typeof useMiniMapStore.getState>;

/** A node-store ref whose `getState()` answers from a declared slice. */
const nodeStoreRef = (state: PartialMembers<NodeStoreState>): NodeStore => {
  const full = stub<NodeStoreState>(state);
  const store = create<NodeStoreState>()(() => full);
  return Object.assign(store, {
    temporal: stub<NodeStore["temporal"]>({})
  });
};

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(() => jest.fn()),
  useLocation: jest.fn(() => ({ pathname: "/editor/workflow-123" }))
}));

jest.mock("../../stores/WorkflowRunner");
jest.mock("../useRunningJobs", () => ({
  useRunningJobs: jest.fn(() => ({ data: [] }))
}));
jest.mock("../../contexts/NodeContext");
jest.mock("../../contexts/WorkflowManagerContext");
jest.mock("../../stores/SettingsStore");
jest.mock("../useAutosave");
jest.mock("../../stores/NodeMenuStore");
jest.mock("../../stores/BottomPanelStore");
jest.mock("../../stores/MiniMapStore");

const mockUseWebsocketRunner = useWebsocketRunner as jest.MockedFunction<
  typeof useWebsocketRunner
>;
const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;
const mockUseNodeStoreRef = useNodeStoreRef as jest.MockedFunction<
  typeof useNodeStoreRef
>;
const mockUseWorkflowManager = useWorkflowManager as jest.MockedFunction<
  typeof useWorkflowManager
>;
const mockUseSettingsStore = useSettingsStore as jest.MockedFunction<
  typeof useSettingsStore
>;
const mockTriggerAutosave = triggerAutosaveForWorkflow as jest.MockedFunction<
  typeof triggerAutosaveForWorkflow
>;
const mockUseNodeMenuStore = useNodeMenuStore as jest.MockedFunction<
  typeof useNodeMenuStore
>;
const mockUseBottomPanelStore = useBottomPanelStore as jest.MockedFunction<
  typeof useBottomPanelStore
>;
const mockUseMiniMapStore = useMiniMapStore as jest.MockedFunction<
  typeof useMiniMapStore
>;

describe("useFloatingToolbarActions", () => {
  const mockWorkflow: Workflow = {
    id: "workflow-123",
    name: "Test Workflow",
    description: "",
    access: "private",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    graph: { nodes: [], edges: [] }
  };

  const mockRun = jest.fn();
  const mockCancel = jest.fn();
  const mockPause = jest.fn();
  const mockResume = jest.fn();
  const mockSaveWorkflow = jest.fn();
  const mockGetWorkflow = jest.fn(() => mockWorkflow);
  const mockAutoLayout = jest.fn();
  const mockWorkflowJSON = jest.fn(() => JSON.stringify(mockWorkflow));
  const mockOpenNodeMenu = jest.fn();
  const mockCloseNodeMenu = jest.fn();
  const mockToggleBottomPanel = jest.fn();
  const mockToggleMiniMap = jest.fn();

  const runnerInState = (state: WorkflowRunner["state"]) =>
    selectFrom<WorkflowRunner>({
      run: mockRun,
      cancel: mockCancel,
      pause: mockPause,
      resume: mockResume,
      state,
      queuePosition: null
    });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseWebsocketRunner.mockImplementation(runnerInState("idle"));

    mockUseNodes.mockImplementation(
      selectFrom<NodeStoreState>({
        workflow: mockWorkflow,
        autoLayout: mockAutoLayout,
        workflowJSON: mockWorkflowJSON
      })
    );

    mockUseNodeStoreRef.mockReturnValue(nodeStoreRef({ nodes: [], edges: [] }));

    mockUseWorkflowManager.mockImplementation(
      selectFrom<WorkflowManagerState>({
        getWorkflow: mockGetWorkflow,
        saveWorkflow: mockSaveWorkflow
      })
    );

    // `confirmLargeRun: false` keeps the large-run confirmation out of the way
    // for every case except the ones that opt into it.
    mockUseSettingsStore.mockImplementation(
      selectFrom<SettingsState>({
        settings: {
          ...defaultSettings,
          confirmLargeRun: false,
          autosave: {
            ...defaultSettings.autosave,
            saveBeforeRun: false,
            maxVersionsPerWorkflow: 10
          }
        }
      })
    );

    mockUseNodeMenuStore.mockImplementation(
      selectFrom<NodeMenuStore>({
        openNodeMenu: mockOpenNodeMenu,
        closeNodeMenu: mockCloseNodeMenu,
        isMenuOpen: false
      })
    );

    mockUseBottomPanelStore.mockImplementation(
      selectFrom<BottomPanelState>({ handleViewChange: mockToggleBottomPanel })
    );

    mockUseMiniMapStore.mockImplementation(
      selectFrom<MiniMapState>({ toggleVisible: mockToggleMiniMap })
    );

    mockTriggerAutosave.mockResolvedValue(null);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("handleRun", () => {
    it("runs workflow when not already running", async () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleRun();
      });

      expect(mockRun).toHaveBeenCalled();
    });

    it("asks for confirmation while running, then runs on confirm", async () => {
      mockUseWebsocketRunner.mockImplementation(runnerInState("running"));

      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleRun();
      });

      // Clicking Run while busy opens the concurrent-run confirmation
      // instead of starting a second run outright.
      expect(mockRun).not.toHaveBeenCalled();
      const warning = useRunWarningStore.getState();
      expect(warning.open).toBe(true);
      expect(warning.kind).toBe("concurrent");

      await act(async () => {
        useRunWarningStore.getState().confirm(false);
      });
      expect(mockRun).toHaveBeenCalled();
    });

    const searchNode: NodeStoreState["nodes"][number] = {
      id: "agent-1",
      type: "nodetool.agents.Agent",
      position: { x: 0, y: 0 },
      data: {
        properties: { tools: [{ type: "tool_name", name: "google_search" }] },
        selectable: true,
        dynamic_properties: {},
        workflow_id: mockWorkflow.id
      } satisfies NodeData
    };

    const mockNodeStoreWith = (nodes: NodeStoreState["nodes"]) => {
      mockUseNodeStoreRef.mockReturnValue(
        nodeStoreRef({
          nodes,
          edges: [],
          setSelectedNodes: jest.fn(),
          setShouldFitToScreen: jest.fn()
        })
      );
    };

    const setting = (
      env_var: string,
      value: string | null
    ): SettingWithValue => ({
      package_name: "",
      env_var,
      group: "Search",
      description: "",
      enum: null,
      value,
      is_secret: env_var !== "SERP_PROVIDER"
    });

    it("blocks the run and opens the search-provider dialog when a search tool has no provider", async () => {
      mockNodeStoreWith([searchNode]);
      useRemoteSettingsStore.setState({
        settings: [setting("SERP_PROVIDER", null)]
      });
      useSearchProviderCalloutStore.getState().dismiss();

      const { result } = renderHook(() => useFloatingToolbarActions());
      await act(async () => {
        await result.current.handleRun();
      });

      expect(mockRun).not.toHaveBeenCalled();
      expect(useSearchProviderCalloutStore.getState().open).toBe(true);
      expect(useSearchProviderCalloutStore.getState().nodes).toEqual([
        { nodeId: "agent-1", nodeTitle: "Agent" }
      ]);
    });

    it("runs normally when the search provider is configured", async () => {
      mockNodeStoreWith([searchNode]);
      useRemoteSettingsStore.setState({
        settings: [
          setting("SERP_PROVIDER", "brave"),
          setting("BRAVE_API_KEY", "****")
        ]
      });
      useSearchProviderCalloutStore.getState().dismiss();

      const { result } = renderHook(() => useFloatingToolbarActions());
      await act(async () => {
        await result.current.handleRun();
      });

      expect(mockRun).toHaveBeenCalled();
      expect(useSearchProviderCalloutStore.getState().open).toBe(false);
    });

    it("triggers autosave before running if enabled", async () => {
      mockUseSettingsStore.mockImplementation(
        selectFrom<SettingsState>({
          settings: {
            ...defaultSettings,
            confirmLargeRun: false,
            autosave: {
              ...defaultSettings.autosave,
              saveBeforeRun: true,
              maxVersionsPerWorkflow: 10
            }
          }
        })
      );

      mockGetWorkflow.mockReturnValue({
        ...mockWorkflow,
        graph: {
          nodes: [{ id: "node-1", type: "nodetool.agents.Agent" }],
          edges: []
        }
      });

      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleRun();
      });

      expect(mockTriggerAutosave).toHaveBeenCalledWith(
        "workflow-123",
        expect.any(Object),
        "checkpoint",
        expect.objectContaining({
          description: "Before execution",
          force: true,
          maxVersions: 10
        })
      );
    });

    it("saves workflow after execution", async () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleRun();
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockGetWorkflow).toHaveBeenCalledWith("workflow-123");
      expect(mockSaveWorkflow).toHaveBeenCalled();
    });
  });

  describe("handleStop", () => {
    it("calls cancel", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleStop();
      });

      expect(mockCancel).toHaveBeenCalled();
    });
  });

  describe("handlePause", () => {
    it("calls pause", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handlePause();
      });

      expect(mockPause).toHaveBeenCalled();
    });
  });

  describe("handleResume", () => {
    it("calls resume", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleResume();
      });

      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe("handleSave", () => {
    beforeEach(() => {
      useNotificationStore.getState().clearNotifications();
    });

    it("saves workflow", async () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockGetWorkflow).toHaveBeenCalledWith("workflow-123");
      expect(mockSaveWorkflow).toHaveBeenCalled();
    });

    it("shows a success notification after saving", async () => {
      mockSaveWorkflow.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleSave();
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: "success",
        content: expect.stringContaining("saved")
      });
    });

    it("shows an error notification when saving fails", async () => {
      mockSaveWorkflow.mockRejectedValueOnce(new Error("boom"));
      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleSave();
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: "error",
        content: expect.stringContaining("boom")
      });
    });

    it("does nothing when workflow is null", () => {
      // No `workflow` key: the subject guards on it being falsy.
      mockUseNodes.mockImplementation(
        selectFrom<NodeStoreState>({
          autoLayout: mockAutoLayout,
          workflowJSON: mockWorkflowJSON
        })
      );

      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleSave();
      });

      expect(mockSaveWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("handleDownload", () => {
    beforeEach(() => {
      // Mock URL and link creation
      global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
      global.URL.revokeObjectURL = jest.fn();
      HTMLAnchorElement.prototype.click = jest.fn();
    });

    it("downloads workflow as JSON", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleDownload();
      });

      expect(mockWorkflowJSON).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it("does nothing when workflow is null", () => {
      // No `workflow` key: the subject guards on it being falsy.
      mockUseNodes.mockImplementation(
        selectFrom<NodeStoreState>({
          autoLayout: mockAutoLayout,
          workflowJSON: mockWorkflowJSON
        })
      );

      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleDownload();
      });

      expect(mockWorkflowJSON).not.toHaveBeenCalled();
    });
  });

  describe("handleAutoLayout", () => {
    it("calls autoLayout", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleAutoLayout();
      });

      expect(mockAutoLayout).toHaveBeenCalled();
    });
  });

  describe("handleToggleNodeMenu", () => {
    it("closes menu when already open", () => {
      mockUseNodeMenuStore.mockImplementation(
        selectFrom<NodeMenuStore>({
          openNodeMenu: mockOpenNodeMenu,
          closeNodeMenu: mockCloseNodeMenu,
          isMenuOpen: true
        })
      );

      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleToggleNodeMenu();
      });

      expect(mockCloseNodeMenu).toHaveBeenCalled();
      expect(mockOpenNodeMenu).not.toHaveBeenCalled();
    });

    it("opens menu when closed", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleToggleNodeMenu();
      });

      expect(mockOpenNodeMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number)
        })
      );
      expect(mockCloseNodeMenu).not.toHaveBeenCalled();
    });
  });

  describe("handleToggleTrace", () => {
    it("toggles trace panel", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleToggleTrace();
      });

      expect(mockToggleBottomPanel).toHaveBeenCalledWith("trace");
    });
  });

  describe("handleToggleMiniMap", () => {
    it("toggles mini map", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleToggleMiniMap();
      });

      expect(mockToggleMiniMap).toHaveBeenCalled();
    });
  });

  describe("state properties", () => {
    it("exposes workflow running state", () => {
      mockUseWebsocketRunner.mockImplementation(runnerInState("running"));

      const { result } = renderHook(() => useFloatingToolbarActions());

      expect(result.current.isWorkflowRunning).toBe(true);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isSuspended).toBe(false);
    });

    it("exposes paused state", () => {
      mockUseWebsocketRunner.mockImplementation(runnerInState("paused"));

      const { result } = renderHook(() => useFloatingToolbarActions());

      expect(result.current.isWorkflowRunning).toBe(false);
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isSuspended).toBe(false);
    });
  });
});
