import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { useLanguageModelsByProvider } from "../useModelsByProvider";

// Mock both the providers list (used internally to fan-out to per-provider
// queries) and the per-provider model-list query that the hook calls.
jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      providers: { query: jest.fn() },
      llmByProvider: { query: jest.fn() }
    }
  }
}));

const providersQuery = trpc.models.providers.query as jest.Mock;
const llmByProviderQuery = trpc.models.llmByProvider.query as jest.Mock;

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 }
    }
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const wrapper = () => TestWrapper;

beforeEach(() => {
  jest.clearAllMocks();
  providersQuery.mockResolvedValue([
    { provider: "openai", capabilities: ["generate_message"] }
  ]);
});

describe("useLanguageModelsByProvider — requireToolSupport filter", () => {
  it("keeps every model when requireToolSupport is false", async () => {
    llmByProviderQuery.mockResolvedValue([
      { id: "tool-yes", name: "Yes", provider: "openai", supports_tools: true },
      { id: "tool-no", name: "No", provider: "openai", supports_tools: false },
      { id: "tool-unknown", name: "?", provider: "openai" }
    ]);

    const { result } = renderHook(() => useLanguageModelsByProvider(), {
      wrapper: wrapper()
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = result.current.models.map((m) => m.id);
    expect(ids).toEqual(["tool-yes", "tool-no", "tool-unknown"]);
  });

  it("drops models with supports_tools === false when requireToolSupport is true", async () => {
    llmByProviderQuery.mockResolvedValue([
      { id: "tool-yes", name: "Yes", provider: "openai", supports_tools: true },
      { id: "tool-no", name: "No", provider: "openai", supports_tools: false },
      { id: "tool-unknown", name: "?", provider: "openai" }
    ]);

    const { result } = renderHook(
      () => useLanguageModelsByProvider({ requireToolSupport: true }),
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = result.current.models.map((m) => m.id);
    // `tool-no` is dropped; `tool-yes` and `tool-unknown` (null/undefined)
    // are kept — unknown is treated as supported, matching the
    // BaseProvider.hasToolSupport default.
    expect(ids).toContain("tool-yes");
    expect(ids).toContain("tool-unknown");
    expect(ids).not.toContain("tool-no");
  });

  it("treats supports_tools === null as unknown (kept under requireToolSupport)", async () => {
    llmByProviderQuery.mockResolvedValue([
      { id: "explicit-null", name: "Null", provider: "openai", supports_tools: null }
    ]);

    const { result } = renderHook(
      () => useLanguageModelsByProvider({ requireToolSupport: true }),
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((m) => m.id)).toEqual(["explicit-null"]);
  });
});
