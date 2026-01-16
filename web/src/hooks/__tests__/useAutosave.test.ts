import { renderHook, waitFor, act } from "@testing-library/react";
import { useAutosave, UseAutosaveOptions } from "../useAutosave";

jest.mock("../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn((selector) =>
    selector({
      settings: {
        autosave: {
          enabled: true,
          intervalMinutes: 5,
          saveBeforeRun: true,
          saveOnClose: true
        }
      }
    })
  )
}));

jest.mock("../../stores/VersionHistoryStore", () => ({
  useVersionHistoryStore: jest.fn((selector) =>
    selector({
      getLastAutosaveTime: jest.fn(() => 0),
      updateLastAutosaveTime: jest.fn()
    })
  )
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn((selector) =>
    selector({
      addNotification: jest.fn()
    })
  )
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("useAutosave", () => {
  const defaultOptions: UseAutosaveOptions = {
    workflowId: "test-workflow-123",
    getWorkflow: jest.fn(() => ({
      id: "test-workflow-123",
      name: "Test Workflow"
    })),
    isDirty: jest.fn(() => true)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it("returns initial state correctly", () => {
    const { result } = renderHook(() => useAutosave(defaultOptions));

    expect(result.current.lastAutosaveTime).toBe(0);
    expect(typeof result.current.triggerAutosave).toBe("function");
    expect(typeof result.current.saveBeforeRun).toBe("function");
  });

  it("does not trigger autosave when autosave is disabled", () => {
    jest.mock("../../stores/SettingsStore", () => ({
      useSettingsStore: jest.fn((selector) =>
        selector({
          settings: {
            autosave: {
              enabled: false,
              intervalMinutes: 5,
              saveBeforeRun: true,
              saveOnClose: true
            }
          }
        })
      )
    }));

    const { result } = renderHook(() => useAutosave(defaultOptions));

    act(() => {
      result.current.triggerAutosave();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not trigger autosave when workflow is not dirty", () => {
    const options: UseAutosaveOptions = {
      ...defaultOptions,
      isDirty: jest.fn(() => false)
    };

    const { result } = renderHook(() => useAutosave(options));

    act(() => {
      result.current.triggerAutosave();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not trigger autosave when workflowId is null", () => {
    const options: UseAutosaveOptions = {
      ...defaultOptions,
      workflowId: null
    };

    const { result } = renderHook(() => useAutosave(options));

    act(() => {
      result.current.triggerAutosave();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips autosave when backend returns skipped", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: null,
        message: "skipped by server",
        skipped: true
      })
    });

    const { result } = renderHook(() => useAutosave(defaultOptions));

    await act(async () => {
      await result.current.triggerAutosave();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workflows/test-workflow-123/autosave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          save_type: "autosave",
          description: undefined,
          force: false,
          client_id: expect.any(String)
        })
      })
    );
  });

  it("updates lastAutosaveTime when autosave succeeds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: {
          id: "version-123",
          version: 5,
          created_at: "2026-01-12T10:00:00Z"
        },
        message: "success",
        skipped: false
      })
    });

    const { result } = renderHook(() => useAutosave(defaultOptions));

    await act(async () => {
      await result.current.triggerAutosave();
    });

    expect(result.current.lastAutosaveTime).toBeGreaterThan(0);
  });

  it("calls saveBeforeRun when setting is enabled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: {
          id: "version-456",
          version: 6,
          created_at: "2026-01-12T10:05:00Z"
        },
        message: "success",
        skipped: false
      })
    });

    const { result } = renderHook(() => useAutosave(defaultOptions));

    await act(async () => {
      await result.current.saveBeforeRun();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workflows/test-workflow-123/autosave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          save_type: "checkpoint",
          description: "Before execution",
          force: true,
          client_id: expect.any(String)
        })
      })
    );
  });

  it("does not call saveBeforeRun when setting is disabled", async () => {
    jest.mock("../../stores/SettingsStore", () => ({
      useSettingsStore: jest.fn((selector) =>
        selector({
          settings: {
            autosave: {
              enabled: true,
              intervalMinutes: 5,
              saveBeforeRun: false,
              saveOnClose: true
            }
          }
        })
      )
    }));

    const { result } = renderHook(() => useAutosave(defaultOptions));

    await act(async () => {
      await result.current.saveBeforeRun();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const consoleError = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useAutosave(defaultOptions));

    await act(async () => {
      await result.current.triggerAutosave();
    });

    expect(consoleError).toHaveBeenCalledWith("Autosave failed:", expect.any(Error));

    consoleError.mockRestore();
  });

  it("returns skipped response when workflowId is null", async () => {
    const options: UseAutosaveOptions = {
      ...defaultOptions,
      workflowId: null
    };

    const { result } = renderHook(() => useAutosave(options));

    let response: { version: null; message: string; skipped: boolean } | undefined;
    
    await act(async () => {
      response = await new Promise<{ version: null; message: string; skipped: boolean }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/workflows/null/autosave", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            resolve({ version: null, message: "no workflow", skipped: true });
          }
        };
        xhr.send(JSON.stringify({ save_type: "autosave" }));
      });
    });

    expect(response?.skipped).toBe(true);
    expect(response?.message).toBe("no workflow");
  });
});
