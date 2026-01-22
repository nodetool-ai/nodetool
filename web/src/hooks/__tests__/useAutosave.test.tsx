import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useVersionHistoryStore } from "../../stores/VersionHistoryStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAutosave, UseAutosaveOptions } from "../useAutosave";
import { Workflow } from "../../stores/ApiTypes";

// Mock fetch globally
global.fetch = jest.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientProviderWrapper";
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
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.lastAutosaveTime).toBe(0);
    });

    it("returns triggerAutosave and saveBeforeRun functions", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
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

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does nothing when workflowId is null", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ workflowId: null })), {
        wrapper: createWrapper(),
      });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does nothing when workflow is not dirty", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ isDirty: () => false })), {
        wrapper: createWrapper(),
      });
      
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

      const { result } = renderHook(() => useAutosave(createMockOptions({ getWorkflow: () => emptyWorkflow })), {
        wrapper: createWrapper(),
      });
      
      act(() => {
        result.current.triggerAutosave();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls autosave endpoint when conditions are met", async () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
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

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(updateLastAutosaveTime).toHaveBeenCalledWith("test-workflow");
    });

    it("adds notification on successful save", async () => {
      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "Autosave"
        })
      );
    });

    it("skips notification when skipped is true in response", async () => {
      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          version: { id: "v1", version: 1, created_at: new Date().toISOString() },
          message: "Skipped",
          skipped: true
        })
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).not.toHaveBeenCalled();
    });

    it("handles fetch errors gracefully", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Autosave failed"
        })
      );
    });

    it("handles non-OK responses", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Server error" })
      });

      const addNotification = jest.fn();
      useNotificationStore.setState({ addNotification });

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.triggerAutosave();
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Autosave failed"
        })
      );
    });
  });

  describe("saveBeforeRun", () => {
    it("saves workflow before running", async () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.saveBeforeRun();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/workflows/test-workflow/autosave",
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    it("does not save when autosave is disabled", async () => {
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          autosave: {
            ...useSettingsStore.getState().settings.autosave,
            saveBeforeRun: false
          }
        }
      });

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.saveBeforeRun();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not save when workflow is not dirty", async () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ isDirty: () => false })), {
        wrapper: createWrapper(),
      });
      
      await act(async () => {
        await result.current.saveBeforeRun();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("resolves even when save fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Save failed"));

      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });
      
      // Should not throw
      await expect(result.current.saveBeforeRun()).resolves.toBeUndefined();
    });
  });

  describe("timer-based autosave", () => {
    it("starts timer when workflow is dirty", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });

      act(() => {
        jest.advanceTimersByTime(9 * 60 * 1000); // 9 minutes
      });

      // Should not have autosaved yet (interval is 10 minutes)
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("autosaves after interval", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions()), {
        wrapper: createWrapper(),
      });

      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    it("does not autosave when workflow is not dirty", () => {
      const { result } = renderHook(() => useAutosave(createMockOptions({ isDirty: () => false })), {
        wrapper: createWrapper(),
      });

      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000);
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("stops timer when workflow becomes clean", () => {
      let isDirty = true;
      const { result } = renderHook(() => useAutosave(createMockOptions({ 
        isDirty: () => isDirty 
      })), {
        wrapper: createWrapper(),
      });

      act(() => {
        jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
        isDirty = false;
        jest.advanceTimersByTime(10 * 60 * 1000); // Another 10 minutes
      });

      // Should not have autosaved because workflow became clean
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
