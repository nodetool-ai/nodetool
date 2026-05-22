import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import {
  useLanguageModelsByProvider,
  useImageModelsByProvider
} from "../useModelsByProvider";

// Mock both the providers list (used internally to fan-out to per-provider
// queries) and the per-provider model-list query that the hook calls.
jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      providers: { query: jest.fn() },
      llmByProvider: { query: jest.fn() },
      imageByProvider: { query: jest.fn() }
    }
  }
}));

// useImageModelsByProvider fans out over the providers returned by
// useImageModelProviders. Keep every other export real so the language-model
// tests above still exercise the real useLanguageModelProviders.
jest.mock("../useProviders", () => ({
  ...jest.requireActual("../useProviders"),
  useImageModelProviders: () => ({
    providers: [{ provider: "fal_ai", capabilities: ["text_to_image"] }],
    isLoading: false,
    error: null
  })
}));

const providersQuery = trpc.models.providers.query as jest.Mock;
const llmByProviderQuery = trpc.models.llmByProvider.query as jest.Mock;
const imageByProviderQuery = trpc.models.imageByProvider.query as jest.Mock;

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

describe("useImageModelsByProvider — task filter", () => {
  // Catalog mirrors what the backend now emits: generators tagged with both
  // generation tasks, specialized transforms tagged exclusively, plus one
  // untagged model standing in for an unclassified third-party (e.g. HF) model.
  const CATALOG = [
    { id: "fal-ai/flux/schnell", name: "Flux Schnell", provider: "fal_ai", supported_tasks: ["text_to_image", "image_to_image"] },
    { id: "fal-ai/image-apps-v2/relighting", name: "Relight", provider: "fal_ai", supported_tasks: ["relight"] },
    { id: "fal-ai/clarity-upscaler", name: "Clarity Upscaler", provider: "fal_ai", supported_tasks: ["upscale"] },
    { id: "fal-ai/bria/background/remove", name: "Bria BG Remove", provider: "fal_ai", supported_tasks: ["remove_background"] },
    { id: "untagged/legacy", name: "Untagged", provider: "fal_ai", supported_tasks: [] }
  ];

  beforeEach(() => imageByProviderQuery.mockResolvedValue(CATALOG));

  it("relight (strict) returns ONLY relight models — no generators, no untagged", async () => {
    const { result } = renderHook(
      () => useImageModelsByProvider({ task: "relight" }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((m) => m.id)).toEqual([
      "fal-ai/image-apps-v2/relighting"
    ]);
  });

  it("upscale (strict) returns only the upscaler", async () => {
    const { result } = renderHook(
      () => useImageModelsByProvider({ task: "upscale" }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((m) => m.id)).toEqual([
      "fal-ai/clarity-upscaler"
    ]);
  });

  it("text_to_image (lenient) includes generators + untagged, excludes specialized transforms", async () => {
    const { result } = renderHook(
      () => useImageModelsByProvider({ task: "text_to_image" }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = result.current.models.map((m) => m.id);
    expect(ids).toContain("fal-ai/flux/schnell");
    expect(ids).toContain("untagged/legacy");
    expect(ids).not.toContain("fal-ai/image-apps-v2/relighting");
    expect(ids).not.toContain("fal-ai/clarity-upscaler");
    expect(ids).not.toContain("fal-ai/bria/background/remove");
  });

  it("no task returns the full catalog (regression: undefined task = no filter)", async () => {
    const { result } = renderHook(() => useImageModelsByProvider(), {
      wrapper: wrapper()
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toHaveLength(CATALOG.length);
  });
});
