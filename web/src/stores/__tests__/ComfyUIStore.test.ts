/**
 * ComfyUIStore Tests
 *
 * Tests for the ComfyUI Zustand store that manages ComfyUI backend connection state.
 */

import { act } from "@testing-library/react";
import { useComfyUIStore, initializeComfyUI } from "../ComfyUIStore";
import type { ComfyUIObjectInfo } from "../../services/ComfyUIService";
import { getComfyUIService } from "../../services/ComfyUIService";

// Mock dependencies
jest.mock("../../services/ComfyUIService", () => {
  const mockComfyUIService = {
    setBaseUrl: jest.fn(),
    checkConnection: jest.fn(),
    disconnectWebSocket: jest.fn(),
    fetchObjectInfo: jest.fn(),
  };

  return {
    getComfyUIService: () => mockComfyUIService,
    getDefaultComfyBaseUrl: () => "/comfy-api",
    normalizeComfyBaseUrl: (url: string) => url,
  };
});

jest.mock("loglevel", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(global, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("ComfyUIStore", () => {
  let mockService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);

    // Get the mocked service
    mockService = getComfyUIService();

    // Reset store state before each test
    useComfyUIStore.getState().reset();
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const state = useComfyUIStore.getState();

      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
      expect(state.connectionError).toBeNull();
      expect(state.baseUrl).toBeTruthy();
      expect(state.objectInfo).toBeNull();
      expect(state.isFetchingObjectInfo).toBe(false);
      expect(state.objectInfoError).toBeNull();
      expect(state.currentPromptId).toBeNull();
      expect(state.isExecuting).toBe(false);
      expect(state.executionProgress).toBe(0);
    });
  });

  describe("setBaseUrl", () => {
    it("updates the base URL", () => {
      const { setBaseUrl } = useComfyUIStore.getState();

      act(() => {
        setBaseUrl("http://localhost:8000/api");
      });

      const state = useComfyUIStore.getState();
      expect(state.baseUrl).toBe("http://localhost:8000/api");
      expect(mockService.setBaseUrl).toHaveBeenCalledWith(
        "http://localhost:8000/api"
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "comfyui_base_url",
        "http://localhost:8000/api"
      );
    });

    it("resets connection state when URL changes", () => {
      const { setBaseUrl } = useComfyUIStore.getState();

      // First connect
      act(() => {
        useComfyUIStore.setState({
          isConnected: true,
          objectInfo: { KSampler: {} } as unknown as ComfyUIObjectInfo,
        });
      });

      // Then change URL
      act(() => {
        setBaseUrl("http://new-url:8000/api");
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.objectInfo).toBeNull();
    });

    it("normalizes URLs before setting", () => {
      const { setBaseUrl } = useComfyUIStore.getState();

      act(() => {
        setBaseUrl("http://example.com/api/");
      });

      const state = useComfyUIStore.getState();
      expect(state.baseUrl).toBe("http://example.com/api/");
    });
  });

  describe("checkConnection", () => {
    it("returns true when connection succeeds", async () => {
      mockService.checkConnection.mockResolvedValue(true);

      const { checkConnection } = useComfyUIStore.getState();

      let result: boolean | undefined;
      await act(async () => {
        result = await checkConnection();
      });

      expect(result).toBe(true);

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectionError).toBeNull();
    });

    it("returns false when connection fails", async () => {
      mockService.checkConnection.mockResolvedValue(false);

      const { checkConnection } = useComfyUIStore.getState();

      let result: boolean | undefined;
      await act(async () => {
        result = await checkConnection();
      });

      expect(result).toBe(false);

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.connectionError).toBeNull();
    });

    it("handles connection errors gracefully", async () => {
      const testError = new Error("Network error");
      mockService.checkConnection.mockRejectedValue(testError);

      const { checkConnection } = useComfyUIStore.getState();

      let result: boolean | undefined;
      await act(async () => {
        result = await checkConnection();
      });

      expect(result).toBe(false);

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.connectionError).toBe("Network error");
    });

    it("handles non-Error errors", async () => {
      mockService.checkConnection.mockRejectedValue("Unknown error");

      const { checkConnection } = useComfyUIStore.getState();

      await act(async () => {
        await checkConnection();
      });

      const state = useComfyUIStore.getState();
      expect(state.connectionError).toBe("Unknown error");
    });
  });

  describe("connect", () => {
    // Use a remote URL so connect() goes through the fetch path (easily mockable).
    // setBaseUrl also resets the connection cooldown timer.
    const remoteUrl = "http://runpod.example.com:8188";
    const mockObjectInfo: ComfyUIObjectInfo = {
      KSampler: {
        input: {
          required: {},
        },
        output: ["LATENT"],
        output_is_list: [false],
        output_name: ["latent"],
        name: "KSampler",
        display_name: "KSampler",
        description: "Sampler",
        category: "sampling",
        output_node: false,
      },
    };

    beforeEach(() => {
      // Set a remote URL so connect() uses the fetch path and resets cooldown.
      act(() => {
        useComfyUIStore.getState().setBaseUrl(remoteUrl);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("successfully connects to ComfyUI backend", async () => {
      (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockObjectInfo),
      });

      const { connect } = useComfyUIStore.getState();

      await act(async () => {
        await connect();
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.isConnecting).toBe(false);
      expect(state.connectionError).toBeNull();
      expect(state.objectInfo).toEqual(mockObjectInfo);
      expect(mockService.setBaseUrl).toHaveBeenCalled();
    });

    it("fails when backend returns an error response", async () => {
      (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: jest
          .fn()
          .mockResolvedValueOnce({ error: "ComfyUI backend is not reachable" }),
      });

      const { connect } = useComfyUIStore.getState();

      let _error: Error | undefined;
      await act(async () => {
        try {
          await connect();
        } catch (e) {
          _error = e as Error;
        }
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
      expect(state.connectionError).toBe("ComfyUI backend is not reachable");
      expect(_error?.message).toBe("ComfyUI backend is not reachable");
    });

    it("handles network errors", async () => {
      (global as Record<string, unknown>).fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error("Failed to fetch schema"));

      const { connect } = useComfyUIStore.getState();

      let _error: Error | undefined;
      await act(async () => {
        try {
          await connect();
        } catch (e) {
          _error = e as Error;
        }
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
      expect(state.connectionError).toBe("Failed to fetch schema");
      expect(_error?.message).toBe("Failed to fetch schema");
    });

    it("sets isConnecting during connection attempt", async () => {
      let resolveFetch!: (v: unknown) => void;
      const pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      (global as Record<string, unknown>).fetch = jest
        .fn()
        .mockReturnValueOnce(pendingFetch);

      const { connect } = useComfyUIStore.getState();

      act(() => {
        void connect();
      });

      // Should be connecting immediately after calling connect
      let state = useComfyUIStore.getState();
      expect(state.isConnecting).toBe(true);

      // Resolve the pending fetch
      resolveFetch({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockObjectInfo),
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // After completion, should not be connecting
      state = useComfyUIStore.getState();
      expect(state.isConnecting).toBe(false);
      expect(state.isConnected).toBe(true);
    });
  });

  describe("disconnect", () => {
    it("disconnects from ComfyUI backend", () => {
      const { disconnect } = useComfyUIStore.getState();

      // First, simulate being connected
      act(() => {
        useComfyUIStore.setState({
          isConnected: true,
          currentPromptId: "test-prompt-id",
          isExecuting: true,
          executionProgress: 50,
        });
      });

      act(() => {
        disconnect();
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.currentPromptId).toBeNull();
      expect(state.isExecuting).toBe(false);
      expect(state.executionProgress).toBe(0);
      expect(mockService.disconnectWebSocket).toHaveBeenCalled();
    });

    it("clears connection error on disconnect", () => {
      const { disconnect } = useComfyUIStore.getState();

      act(() => {
        useComfyUIStore.setState({
          connectionError: "Previous error",
        });
      });

      act(() => {
        disconnect();
      });

      const state = useComfyUIStore.getState();
      expect(state.connectionError).toBeNull();
    });
  });

  describe("fetchObjectInfo", () => {
    const mockObjectInfo: ComfyUIObjectInfo = {
      KSampler: {
        input: {
          required: {},
        },
        output: ["LATENT"],
        output_is_list: [false],
        output_name: ["latent"],
        name: "KSampler",
        display_name: "KSampler",
        description: "Sampler",
        category: "sampling",
        output_node: false,
      },
    };

    it("successfully fetches object info", async () => {
      mockService.fetchObjectInfo.mockResolvedValue(mockObjectInfo);

      const { fetchObjectInfo } = useComfyUIStore.getState();

      await act(async () => {
        await fetchObjectInfo();
      });

      const state = useComfyUIStore.getState();
      expect(state.objectInfo).toEqual(mockObjectInfo);
      expect(state.isFetchingObjectInfo).toBe(false);
      expect(state.objectInfoError).toBeNull();
    });

    it("sets isFetchingObjectInfo during fetch", async () => {
      mockService.fetchObjectInfo.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockObjectInfo), 100);
          })
      );

      const { fetchObjectInfo } = useComfyUIStore.getState();

      act(() => {
        fetchObjectInfo();
      });

      let state = useComfyUIStore.getState();
      expect(state.isFetchingObjectInfo).toBe(true);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      state = useComfyUIStore.getState();
      expect(state.isFetchingObjectInfo).toBe(false);
    });

    it("handles fetch errors", async () => {
      const testError = new Error("Fetch failed");
      mockService.fetchObjectInfo.mockRejectedValue(testError);

      const { fetchObjectInfo } = useComfyUIStore.getState();

      let _error: Error | undefined;
      await act(async () => {
        try {
          await fetchObjectInfo();
        } catch (e) {
          _error = e as Error;
        }
      });

      const state = useComfyUIStore.getState();
      expect(state.objectInfo).toBeNull();
      expect(state.objectInfoError).toBe("Fetch failed");
      expect(_error?.message).toBe("Fetch failed");
    });

    it("passes forceRefresh parameter to service", async () => {
      mockService.fetchObjectInfo.mockResolvedValue(mockObjectInfo);

      const { fetchObjectInfo } = useComfyUIStore.getState();

      await act(async () => {
        await fetchObjectInfo(true);
      });

      expect(mockService.fetchObjectInfo).toHaveBeenCalledWith(true);
    });
  });

  describe("setCurrentPromptId", () => {
    it("sets the current prompt ID", () => {
      const { setCurrentPromptId } = useComfyUIStore.getState();

      act(() => {
        setCurrentPromptId("test-prompt-123");
      });

      const state = useComfyUIStore.getState();
      expect(state.currentPromptId).toBe("test-prompt-123");
    });

    it("can clear the prompt ID by setting to null", () => {
      const { setCurrentPromptId } = useComfyUIStore.getState();

      act(() => {
        setCurrentPromptId("test-prompt-123");
      });

      act(() => {
        setCurrentPromptId(null);
      });

      const state = useComfyUIStore.getState();
      expect(state.currentPromptId).toBeNull();
    });
  });

  describe("setExecuting", () => {
    it("sets execution state", () => {
      const { setExecuting } = useComfyUIStore.getState();

      act(() => {
        setExecuting(true);
      });

      const state = useComfyUIStore.getState();
      expect(state.isExecuting).toBe(true);
    });

    it("resets progress when execution stops", () => {
      const { setExecuting } = useComfyUIStore.getState();

      act(() => {
        useComfyUIStore.setState({
          executionProgress: 75,
        });
      });

      act(() => {
        setExecuting(false);
      });

      const state = useComfyUIStore.getState();
      expect(state.isExecuting).toBe(false);
      expect(state.executionProgress).toBe(0);
    });

    it("does not reset progress when execution starts", () => {
      const { setExecuting } = useComfyUIStore.getState();

      act(() => {
        useComfyUIStore.setState({
          executionProgress: 50,
        });
      });

      act(() => {
        setExecuting(true);
      });

      const state = useComfyUIStore.getState();
      expect(state.isExecuting).toBe(true);
      expect(state.executionProgress).toBe(50);
    });
  });

  describe("setExecutionProgress", () => {
    it("sets execution progress", () => {
      const { setExecutionProgress } = useComfyUIStore.getState();

      act(() => {
        setExecutionProgress(50);
      });

      const state = useComfyUIStore.getState();
      expect(state.executionProgress).toBe(50);
    });

    it("allows setting progress to 100", () => {
      const { setExecutionProgress } = useComfyUIStore.getState();

      act(() => {
        setExecutionProgress(100);
      });

      const state = useComfyUIStore.getState();
      expect(state.executionProgress).toBe(100);
    });

    it("allows setting progress to 0", () => {
      const { setExecutionProgress } = useComfyUIStore.getState();

      act(() => {
        setExecutionProgress(0);
      });

      const state = useComfyUIStore.getState();
      expect(state.executionProgress).toBe(0);
    });
  });

  describe("reset", () => {
    it("resets all state to initial values", () => {
      // Set various states
      act(() => {
        useComfyUIStore.setState({
          isConnected: true,
          isConnecting: true,
          connectionError: "Some error",
          objectInfo: { KSampler: {} } as unknown as ComfyUIObjectInfo,
          isFetchingObjectInfo: true,
          objectInfoError: "Fetch error",
          currentPromptId: "prompt-123",
          isExecuting: true,
          executionProgress: 75,
        });
      });

      // Reset
      const { reset } = useComfyUIStore.getState();

      act(() => {
        reset();
      });

      const state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
      expect(state.connectionError).toBeNull();
      expect(state.objectInfo).toBeNull();
      expect(state.isFetchingObjectInfo).toBe(false);
      expect(state.objectInfoError).toBeNull();
      expect(state.currentPromptId).toBeNull();
      expect(state.isExecuting).toBe(false);
      expect(state.executionProgress).toBe(0);
    });
  });

  describe("integration scenarios", () => {
    const remoteUrl = "http://runpod.example.com:8188";
    const mockObjectInfo: ComfyUIObjectInfo = {
      KSampler: {
        input: { required: {} },
        output: ["LATENT"],
        output_is_list: [false],
        output_name: ["latent"],
        name: "KSampler",
        display_name: "KSampler",
        description: "Sampler",
        category: "sampling",
        output_node: false,
      },
    };

    beforeEach(() => {
      act(() => {
        useComfyUIStore.getState().setBaseUrl(remoteUrl);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("handles full connection lifecycle", async () => {
      (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockObjectInfo),
      });

      const { connect, disconnect } = useComfyUIStore.getState();

      // Connect
      await act(async () => {
        await connect();
      });

      let state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.objectInfo).toEqual(mockObjectInfo);

      // Start execution
      act(() => {
        useComfyUIStore.getState().setExecuting(true);
      });

      act(() => {
        useComfyUIStore.getState().setCurrentPromptId("prompt-123");
      });

      state = useComfyUIStore.getState();
      expect(state.isExecuting).toBe(true);
      expect(state.currentPromptId).toBe("prompt-123");

      // Update progress
      act(() => {
        useComfyUIStore.getState().setExecutionProgress(50);
      });

      state = useComfyUIStore.getState();
      expect(state.executionProgress).toBe(50);

      // End execution
      act(() => {
        useComfyUIStore.getState().setExecuting(false);
      });

      state = useComfyUIStore.getState();
      expect(state.isExecuting).toBe(false);
      expect(state.executionProgress).toBe(0);

      // Disconnect
      act(() => {
        disconnect();
      });

      state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);
    });

    it("handles reconnection after disconnect", async () => {
      (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockObjectInfo),
      });

      const { connect, disconnect } = useComfyUIStore.getState();

      // First connection
      await act(async () => {
        await connect();
      });

      let state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(true);

      // Disconnect
      act(() => {
        disconnect();
      });

      state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(false);

      // Reconnect — setBaseUrl resets the cooldown so this succeeds
      act(() => {
        useComfyUIStore.getState().setBaseUrl(remoteUrl);
      });

      await act(async () => {
        await connect();
      });

      state = useComfyUIStore.getState();
      expect(state.isConnected).toBe(true);
    });
  });
});

describe("initializeComfyUI", () => {
  let mockService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue("/comfy-api");

    mockService = getComfyUIService();
  });

  it("initializes ComfyUI service with stored URL", () => {
    mockLocalStorage.getItem.mockReturnValue("http://localhost:8000/api");

    initializeComfyUI();

    expect(mockService.setBaseUrl).toHaveBeenCalledWith(
      "http://localhost:8000/api"
    );
  });

  it("uses default URL when no URL is stored", () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    initializeComfyUI();

    expect(mockService.setBaseUrl).toHaveBeenCalledWith("/comfy-api");
  });
});
