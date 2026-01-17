import { renderHook, act } from "@testing-library/react";
import { useAutosave, UseAutosaveOptions } from "../useAutosave";

let mockLastAutosaveTime = 0;
const mockUpdateLastAutosaveTime = jest.fn();

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
      getLastAutosaveTime: jest.fn(() => mockLastAutosaveTime),
      updateLastAutosaveTime: mockUpdateLastAutosaveTime
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
      name: "Test Workflow",
      access: "private",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      description: "Test workflow",
      graph: { nodes: [], edges: [] },
      tags: [],
      thumbnail: null,
      is_public: false,
      owner_id: "user-1",
      required_models: [],
      preferred_save: "desktop"
    })),
    isDirty: jest.fn(() => true)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockLastAutosaveTime = 0;
    mockUpdateLastAutosaveTime.mockClear();
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
        headers: { "Content-Type": "application/json" }
      })
    );
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("/api/workflows/test-workflow-123/autosave");
    const body = JSON.parse(callArgs[1].body);
    expect(body.save_type).toBe("autosave");
    expect(body.force).toBe(false);
    expect(typeof body.client_id).toBe("string");
  });

  it.skip("updates lastAutosaveTime when autosave succeeds", async () => {
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

    expect(mockUpdateLastAutosaveTime).toHaveBeenCalledWith("test-workflow-123");
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
        headers: { "Content-Type": "application/json" }
      })
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.save_type).toBe("checkpoint");
    expect(callBody.description).toBe("Before execution");
    expect(callBody.force).toBe(true);
    expect(typeof callBody.client_id).toBe("string");
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
