import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useVersionHistoryStore } from "../../stores/VersionHistoryStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAutosave, UseAutosaveOptions } from "../useAutosave";
import { Workflow } from "../../stores/ApiTypes";

// Mock fetch globally
global.fetch = jest.fn();

// Create a wrapper with QueryClientProvider
const createTestWrapper = (): React.FC<{ children: React.ReactNode }> => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useAutosave", () => {
  const mockWorkflow: Workflow = {
    id: "test-workflow",
    name: "Test Workflow",
    access: "private",
    description: "",
    thumbnail: "",
    tags: [],
    settings: {},
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    graph: {
      nodes: [{ id: "1", type: "test", data: {}, dynamic_properties: {}, sync_mode: "automatic", ui_properties: { position: { x: 0, y: 0 }, selected: false, selectable: true } }],
      edges: []
    }
  };

  const createMockOptions = (overrides: Partial<UseAutosaveOptions> = {}): UseAutosaveOptions => ({
    workflowId: "test-workflow",
    getWorkflow: () => mockWorkflow,
    isDirty: () => true,
    ...overrides
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        autosave: {
          enabled: true,
          intervalMinutes: 10,
          saveBeforeRun: true,
          saveOnClose: true,
          maxVersionsPerWorkflow: 50,
          keepManualVersionsDays: 90,
          keepAutosaveVersionsDays: 7
        }
      }
    });

    useVersionHistoryStore.setState({
      getLastAutosaveTime: jest.fn().mockReturnValue(0),
      updateLastAutosaveTime: jest.fn()
    });

    useNotificationStore.setState({
      addNotification: jest.fn()
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        version: { id: "v1", version: 1, created_at: new Date().toISOString() },
        message: "Saved",
        skipped: false
      })
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("returns initial lastAutosaveTime as 0", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      expect(result.current.lastAutosaveTime).toBe(0);
    });

    it("returns triggerAutosave and saveBeforeRun functions", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      expect(typeof result.current.triggerAutosave).toBe("function");
      expect(typeof result.current.saveBeforeRun).toBe("function");
    });
  });

  describe("triggerAutosave", () => {
    it("does nothing when autosave is disabled", () => {
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          autosave: {
            enabled: false,
            intervalMinutes: 10,
            saveBeforeRun: true,
            saveOnClose: true,
            maxVersionsPerWorkflow: 50,
            keepManualVersionsDays: 90,
            keepAutosaveVersionsDays: 7
          }
        }
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does nothing when workflowId is null", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ workflowId: null })), { wrapper: createTestWrapper() });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does nothing when workflow is not dirty", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ isDirty: () => false })), { wrapper: createTestWrapper() });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not save empty workflows", () => {
      const emptyWorkflow: Workflow = {
        ...mockWorkflow,
        graph: { nodes: [], edges: [] }
      };

      const { result } = renderHook(() => useAutosave(createMockOptions({ getWorkflow: () => emptyWorkflow })), { wrapper: createTestWrapper() });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls autosave endpoint when conditions are met", async () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/workflows/test-workflow/autosave",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    it("updates lastAutosaveTime on successful save", async () => {
      const updateLastAutosaveTime = jest.fn();
      useVersionHistoryStore.setState({
        getLastAutosaveTime: jest.fn().mockReturnValue(0),
        updateLastAutosaveTime
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(updateLastAutosaveTime).toHaveBeenCalledWith("test-workflow");
    });

    it("adds notification on successful save", async () => {
      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).toHaveBeenCalledWith({
        content: "Workflow autosaved",
        type: "info",
        alert: false
      });
    });

    it("handles skipped response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          version: null,
          message: "skipped",
          skipped: true
        })
      });

      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).not.toHaveBeenCalled();
    });

    it("handles fetch errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(consoleSpy).toHaveBeenCalledWith("Autosave failed:", expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe("saveBeforeRun", () => {
    it("does nothing when saveBeforeRun is disabled", () => {
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          autosave: {
            enabled: true,
            intervalMinutes: 10,
            saveBeforeRun: false,
            saveOnClose: true,
            maxVersionsPerWorkflow: 50,
            keepManualVersionsDays: 90,
            keepAutosaveVersionsDays: 7
          }
        }
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      act(() => {
        result.current.saveBeforeRun();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls checkpoint endpoint when enabled", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          version: { id: "v1", version: 1, created_at: new Date().toISOString() },
          message: "Saved",
          skipped: false
        })
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), { wrapper: createTestWrapper() });
      
      await result.current.saveBeforeRun();

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body as string);
      expect(fetchBody.save_type).toBe("checkpoint");
      expect(fetchBody.description).toBe("Before execution");
      expect(fetchBody.force).toBe(true);
    });

    it("does not save empty workflows", async () => {
      const emptyWorkflow: Workflow = {
        ...mockWorkflow,
        graph: { nodes: [], edges: [] }
      };

      const { result } = renderHook(() => useAutosave(createMockOptions({ getWorkflow: () => emptyWorkflow })), { wrapper: createTestWrapper() });
      
      await act(async () => {
        await result.current.saveBeforeRun();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("workflowId changes", () => {
    it("updates lastAutosaveTime when workflowId changes", () => {
      const getLastAutosaveTimeMock = jest.fn().mockReturnValue(0);
      useVersionHistoryStore.setState({
        getLastAutosaveTime: getLastAutosaveTimeMock,
        updateLastAutosaveTime: jest.fn()
      });

      const { result, rerender } = renderHook(
        (props) => useAutosave(props as UseAutosaveOptions),
        { initialProps: createMockOptions({ workflowId: "workflow-1" }), wrapper: createTestWrapper() }
      );

      expect(getLastAutosaveTimeMock).toHaveBeenCalledWith("workflow-1");
      expect(result.current.lastAutosaveTime).toBe(0);

      rerender(createMockOptions({ workflowId: "workflow-2" }));

      expect(getLastAutosaveTimeMock).toHaveBeenCalledWith("workflow-2");
    });

    it("resets autosave state when workflowId becomes null", () => {
      const { result, rerender } = renderHook(
        (props) => useAutosave(props as UseAutosaveOptions),
        { initialProps: createMockOptions({ workflowId: "workflow-1" }), wrapper: createTestWrapper() }
      );

      rerender(createMockOptions({ workflowId: null }));

      expect(result.current.lastAutosaveTime).toBe(0);
    });
  });
});
