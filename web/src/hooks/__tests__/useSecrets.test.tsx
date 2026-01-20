import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSecrets } from "../useSecrets";
import useSecretsStore from "../../stores/SecretsStore";

jest.mock("../../stores/SecretsStore");

describe("useSecrets", () => {
  const mockSecrets = [
    { key: "OPENAI_API_KEY", value: "sk-..." },
    { key: "ANTHROPIC_API_KEY", value: "sk-ant-..." }
  ];

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    
    (useSecretsStore.getState as jest.Mock).mockReturnValue({
      fetchSecrets: jest.fn().mockResolvedValue(mockSecrets)
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
    Wrapper.displayName = "SecretsTestWrapper";
    return Wrapper;
  };

  describe("initial state", () => {
    it("returns empty secrets initially while loading", () => {
      const { result } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      expect(result.current.secrets).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("isApiKeySet", () => {
    it("returns false when secret is not found", async () => {
      const { result } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      
      expect(result.current.isApiKeySet("UNKNOWN_KEY")).toBe(false);
    });

    it("returns true when secret is found", async () => {
      const { result } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      
      expect(result.current.isApiKeySet("OPENAI_API_KEY")).toBe(true);
      expect(result.current.isApiKeySet("ANTHROPIC_API_KEY")).toBe(true);
    });
  });

  describe("store integration", () => {
    it("calls fetchSecrets on mount", async () => {
      const fetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets
      });
      
      renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(fetchSecrets).toHaveBeenCalledTimes(1);
      });
    });

    it("caches secrets after successful fetch", async () => {
      const fetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets
      });
      
      const { result, rerender } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      
      expect(result.current.secrets).toEqual(mockSecrets);
      
      rerender();
      
      expect(result.current.secrets).toEqual(mockSecrets);
    });
  });

  describe("error handling", () => {
    it("handles empty secrets array", async () => {
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: jest.fn().mockResolvedValue([])
      });
      
      const { result } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      
      expect(result.current.secrets).toEqual([]);
      expect(result.current.isApiKeySet("ANY_KEY")).toBe(false);
    });

    it("handles multiple API keys", async () => {
      const multipleSecrets = [
        { key: "OPENAI_API_KEY", value: "sk-1" },
        { key: "ANTHROPIC_API_KEY", value: "sk-ant-1" },
        { key: "REPLICATE_API_TOKEN", value: "r8-..." }
      ];
      
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: jest.fn().mockResolvedValue(multipleSecrets)
      });
      
      const { result } = renderHook(() => useSecrets(), { wrapper: createWrapper() });
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      
      expect(result.current.secrets).toHaveLength(3);
      expect(result.current.isApiKeySet("OPENAI_API_KEY")).toBe(true);
      expect(result.current.isApiKeySet("ANTHROPIC_API_KEY")).toBe(true);
      expect(result.current.isApiKeySet("REPLICATE_API_TOKEN")).toBe(true);
    });
  });
});
