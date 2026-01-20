import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSecrets } from "../useSecrets";

const mockFetchSecrets = jest.fn();

jest.mock("../../stores/SecretsStore", () => ({
  default: {
    getState: jest.fn(() => ({
      fetchSecrets: mockFetchSecrets
    }))
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false
      }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useSecrets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSecrets.mockResolvedValue([
      { key: "openai_api_key", description: "OpenAI API Key" },
      { key: "anthropic_api_key", description: "Anthropic API Key" }
    ]);
  });

  it("fetches secrets on mount", async () => {
    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    expect(result.current.isLoading).toBe(true);
    expect(mockFetchSecrets).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.secrets).toHaveLength(2);
    expect(result.current.isSuccess).toBe(true);
  });

  it("returns empty secrets array when no secrets exist", async () => {
    mockFetchSecrets.mockResolvedValue([]);

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.secrets).toEqual([]);
  });

  it("isApiKeySet returns true for existing key", async () => {
    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isApiKeySet("openai_api_key")).toBe(true);
    expect(result.current.isApiKeySet("anthropic_api_key")).toBe(true);
  });

  it("isApiKeySet returns false for non-existing key", async () => {
    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isApiKeySet("non_existent_key")).toBe(false);
  });

  it("isApiKeySet memoizes correctly with secrets dependency", async () => {
    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstCall = result.current.isApiKeySet("openai_api_key");
    const secondCall = result.current.isApiKeySet("openai_api_key");

    expect(firstCall).toBe(secondCall);
    expect(firstCall).toBe(true);
  });

  it("handles fetch error gracefully", async () => {
    mockFetchSecrets.mockRejectedValue(new Error("Failed to fetch secrets"));

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.secrets).toEqual([]);
  });
});
