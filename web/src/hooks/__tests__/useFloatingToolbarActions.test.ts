import { renderHook, act } from "@testing-library/react";
import { useFloatingToolbarActions } from "../useFloatingToolbarActions";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { triggerAutosaveForWorkflow } from "../useAutosave";
import { executeViaComfyUI } from "../../utils/comfyExecutor";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(() => jest.fn()),
  useLocation: jest.fn(() => ({ pathname: "/editor/workflow-123" }))
}));

jest.mock("../../stores/WorkflowRunner");
jest.mock("../../contexts/NodeContext");
jest.mock("../../contexts/WorkflowManagerContext");
jest.mock("../../stores/SettingsStore");
jest.mock("../useAutosave");
jest.mock("../../utils/comfyExecutor");
jest.mock("../../stores/NodeMenuStore");
jest.mock("../../stores/RightPanelStore");
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
const mockExecuteViaComfyUI = executeViaComfyUI as jest.MockedFunction<
  typeof executeViaComfyUI
>;
const mockUseNodeMenuStore = useNodeMenuStore as jest.MockedFunction<
  typeof useNodeMenuStore
>;
const mockUseRightPanelStore = useRightPanelStore as jest.MockedFunction<
  typeof useRightPanelStore
>;
const mockUseBottomPanelStore = useBottomPanelStore as jest.MockedFunction<
  typeof useBottomPanelStore
>;
const mockUseMiniMapStore = useMiniMapStore as jest.MockedFunction<
  typeof useMiniMapStore
>;

describe("useFloatingToolbarActions", () => {
  const mockWorkflow = {
    id: "workflow-123",
    name: "Test Workflow",
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
  const mockHandleViewChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseWebsocketRunner.mockReturnValue({
      run: mockRun,
      cancel: mockCancel,
      pause: mockPause,
      resume: mockResume,
      isWorkflowRunning: false,
      isPaused: false,
      isSuspended: false,
      state: "idle"
    } as any);

    mockUseNodes.mockReturnValue({
      workflow: mockWorkflow,
      autoLayout: mockAutoLayout,
      workflowJSON: mockWorkflowJSON
    } as any);

    mockUseNodeStoreRef.mockReturnValue({
      getState: jest.fn(() => ({
        nodes: [],
        edges: [],
        getWorkflow: jest.fn(() => mockWorkflow),
        isComfyWorkflow: jest.fn(() => false)
      }))
    } as any);

    mockUseWorkflowManager.mockReturnValue({
      getWorkflow: mockGetWorkflow,
      saveWorkflow: mockSaveWorkflow
    } as any);

    mockUseSettingsStore.mockReturnValue({
      autosave: {
        saveBeforeRun: false,
        maxVersionsPerWorkflow: 10
      }
    } as any);

    mockUseNodeMenuStore.mockReturnValue({
      openNodeMenu: mockOpenNodeMenu,
      closeNodeMenu: mockCloseNodeMenu,
      isMenuOpen: false
    } as any);

    mockUseRightPanelStore.mockReturnValue(mockHandleViewChange as any);

    mockUseBottomPanelStore.mockReturnValue(mockToggleBottomPanel as any);

    mockUseMiniMapStore.mockReturnValue({
      toggleVisible: mockToggleMiniMap
    } as any);

    mockTriggerAutosave.mockResolvedValue(undefined);
    mockExecuteViaComfyUI.mockResolvedValue({
      success: true,
      promptId: "test-prompt-id"
    });

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

    it("does not run workflow when already running", async () => {
      mockUseWebsocketRunner.mockReturnValue({
        run: mockRun,
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        isWorkflowRunning: true,
        isPaused: false,
        isSuspended: false,
        state: "running"
      } as any);

      const { result } = renderHook(() => useFloatingToolbarActions());

      await act(async () => {
        await result.current.handleRun();
      });

      expect(mockRun).not.toHaveBeenCalled();
    });

    it("triggers autosave before running if enabled", async () => {
      mockUseSettingsStore.mockReturnValue({
        autosave: {
          saveBeforeRun: true,
          maxVersionsPerWorkflow: 10
        }
      } as any);

      mockGetWorkflow.mockReturnValue({
        ...mockWorkflow,
        graph: { nodes: [{ id: "node-1" }], edges: [] }
      } as any);

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
    it("saves workflow", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleSave();
      });

      expect(mockGetWorkflow).toHaveBeenCalledWith("workflow-123");
      expect(mockSaveWorkflow).toHaveBeenCalled();
    });

    it("does nothing when workflow is null", () => {
      mockUseNodes.mockReturnValue({
        workflow: null,
        autoLayout: mockAutoLayout,
        workflowJSON: mockWorkflowJSON
      } as any);

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
      mockUseNodes.mockReturnValue({
        workflow: null,
        autoLayout: mockAutoLayout,
        workflowJSON: mockWorkflowJSON
      } as any);

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
      mockUseNodeMenuStore.mockReturnValue({
        openNodeMenu: mockOpenNodeMenu,
        closeNodeMenu: mockCloseNodeMenu,
        isMenuOpen: true
      } as any);

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

  describe("handleToggleTerminal", () => {
    it("toggles terminal panel", () => {
      const { result } = renderHook(() => useFloatingToolbarActions());

      act(() => {
        result.current.handleToggleTerminal();
      });

      expect(mockToggleBottomPanel).toHaveBeenCalledWith("terminal");
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
      mockUseWebsocketRunner.mockReturnValue({
        run: mockRun,
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        isWorkflowRunning: true,
        isPaused: false,
        isSuspended: false,
        state: "running"
      } as any);

      const { result } = renderHook(() => useFloatingToolbarActions());

      expect(result.current.isWorkflowRunning).toBe(true);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isSuspended).toBe(false);
    });

    it("exposes paused state", () => {
      mockUseWebsocketRunner.mockReturnValue({
        run: mockRun,
        cancel: mockCancel,
        pause: mockPause,
        resume: mockResume,
        isWorkflowRunning: false,
        isPaused: true,
        isSuspended: false,
        state: "paused"
      } as any);

      const { result } = renderHook(() => useFloatingToolbarActions());

      expect(result.current.isWorkflowRunning).toBe(false);
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isSuspended).toBe(false);
    });
  });
});
