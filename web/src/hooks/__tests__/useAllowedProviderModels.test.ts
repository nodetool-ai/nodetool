import { renderHook } from "@testing-library/react";
import { useAllowedProviderModels } from "../useAllowedProviderModels";
import type { ModelsByProviderResult } from "../useModelsByProvider";

const data: ModelsByProviderResult<{ id: string; provider: string }> = {
  models: [
    { id: "gemini-3.1-flash-image", provider: "gemini" },
    { id: "gemini-3.1-flash-image", provider: "gemini_vertex" },
    { id: "gpt-image-2", provider: "codex" }
  ],
  providers: ["gemini", "gemini_vertex", "codex"],
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: async () => {}
};

describe("useAllowedProviderModels", () => {
  it("passes every model through without a provider lock", () => {
    const { result } = renderHook(() => useAllowedProviderModels(data));
    expect(result.current).toBe(data);
  });

  it("keeps only the locked provider's models", () => {
    const { result } = renderHook(() =>
      useAllowedProviderModels(data, ["gemini_vertex"])
    );
    expect(result.current.models).toEqual([
      { id: "gemini-3.1-flash-image", provider: "gemini_vertex" }
    ]);
    expect(result.current.providers).toEqual(["gemini_vertex"]);
  });
});
