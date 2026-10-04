import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRecommendedModelKeys } from "../useRecommendedModelKeys";

const mockRecommended = jest.fn();
const mockRankedKeys = jest.fn();

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      recommended: { query: (...args: unknown[]) => mockRecommended(...args) },
      rankedKeys: { query: (...args: unknown[]) => mockRankedKeys(...args) }
    }
  }
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

describe("useRecommendedModelKeys", () => {
  beforeEach(() => {
    mockRecommended.mockResolvedValue([
      { provider: "openai", id: "gpt-5-mini" },
      { provider: "fal_ai", id: "fal-ai/pinned" }
    ]);
    mockRankedKeys.mockResolvedValue([
      "fal_ai:fal-ai/best",
      "kie:best",
      "fal_ai:fal-ai/second"
    ]);
  });

  it("orders ranked models ahead of the pinned list", async () => {
    const { result } = renderHook(() => useRecommendedModelKeys(), {
      wrapper
    });
    await waitFor(() =>
      expect(result.current).toContain("openai:gpt-5-mini")
    );
    const keys = result.current;
    expect(keys.indexOf("fal_ai:fal-ai/best")).toBeLessThan(
      keys.indexOf("fal_ai:fal-ai/second")
    );
    expect(keys.indexOf("fal_ai:fal-ai/second")).toBeLessThan(
      keys.indexOf("fal_ai:fal-ai/pinned")
    );
    expect(keys.indexOf("fal_ai:fal-ai/second")).toBeLessThan(
      keys.indexOf("openai:gpt-5-mini")
    );
  });

  it("keeps the pinned list when the rankings are empty", async () => {
    mockRankedKeys.mockResolvedValue([]);
    const { result } = renderHook(() => useRecommendedModelKeys(), {
      wrapper
    });
    await waitFor(() =>
      expect(result.current).toContain("fal_ai:fal-ai/pinned")
    );
    expect(result.current).not.toContain("kie:best");
  });
});
