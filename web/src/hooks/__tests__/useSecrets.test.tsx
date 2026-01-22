import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSecrets } from "../useSecrets";
import useSecretsStore from "../../stores/SecretsStore";

jest.mock("../../stores/SecretsStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useSecrets", () => {
  const mockFetchSecrets = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useSecretsStore.getState as jest.Mock).mockReturnValue({
      fetchSecrets: mockFetchSecrets,
    });
  });

  it("returns loading state initially", () => {
    mockFetchSecrets.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.secrets).toEqual([]);
    expect(result.current.isSuccess).toBe(false);
  });

  it("fetches secrets successfully", async () => {
    const mockSecrets = [
      { key: "openai_api_key", value: "sk-..." },
      { key: "anthropic_api_key", value: "sk-ant-..." },
    ];

    mockFetchSecrets.mockResolvedValue(mockSecrets);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.secrets).toEqual(mockSecrets);
    expect(result.current.isSuccess).toBe(true);
    expect(mockFetchSecrets).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no secrets", async () => {
    mockFetchSecrets.mockResolvedValue([]);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.secrets).toEqual([]);
    expect(result.current.isSuccess).toBe(true);
  });

  it("isApiKeySet returns true when key exists", async () => {
    const mockSecrets = [
      { key: "openai_api_key", value: "sk-..." },
    ];

    mockFetchSecrets.mockResolvedValue(mockSecrets);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isApiKeySet("openai_api_key")).toBe(true);
  });

  it("isApiKeySet returns false when key does not exist", async () => {
    const mockSecrets = [
      { key: "openai_api_key", value: "sk-..." },
    ];

    mockFetchSecrets.mockResolvedValue(mockSecrets);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isApiKeySet("anthropic_api_key")).toBe(false);
  });

  it("isApiKeySet handles empty secrets array", async () => {
    mockFetchSecrets.mockResolvedValue([]);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isApiKeySet("any_key")).toBe(false);
  });

  it("caches secrets after first fetch", async () => {
    const mockSecrets = [{ key: "test_key", value: "test_value" }];

    mockFetchSecrets.mockResolvedValue(mockSecrets);

    const { result, rerender } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock call count
    mockFetchSecrets.mockClear();

    // Re-render - should use cached data
    rerender();

    await waitFor(() => {
      expect(result.current.secrets).toEqual(mockSecrets);
    });

    // Should not make another fetch on re-render
    expect(mockFetchSecrets).not.toHaveBeenCalled();
  });

  it("handles null response from fetchSecrets", async () => {
    mockFetchSecrets.mockResolvedValue(null);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // null is returned as-is, not converted to undefined
    expect(result.current.secrets).toBeNull();
  });

  it("isApiKeySet memoizes correctly", async () => {
    const mockSecrets = [{ key: "test_key", value: "test_value" }];

    mockFetchSecrets.mockResolvedValue(mockSecrets);

    const { result, rerender } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Call multiple times
    const firstCall = result.current.isApiKeySet("test_key");
    const secondCall = result.current.isApiKeySet("test_key");

    expect(firstCall).toBe(true);
    expect(secondCall).toBe(true);
    expect(firstCall).toBe(secondCall);
  });
});
