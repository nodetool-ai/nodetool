import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import {
  readStoredModelRef,
  useNodeVideoModelConstraints,
  useNodeImageModelConstraints
} from "../useMediaModelConstraints";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      videoByProvider: { query: jest.fn() },
      imageByProvider: { query: jest.fn() }
    }
  }
}));

let storedProperties: Record<string, unknown> = {};

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({
      findNode: (id: string) =>
        id === "node1" ? { id, data: { properties: storedProperties } } : undefined
    })
}));

const videoQuery = jest.mocked(trpc.models.videoByProvider.query);
const imageQuery = jest.mocked(trpc.models.imageByProvider.query);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    }
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  storedProperties = {};
});

describe("readStoredModelRef", () => {
  it("reads a stored provider-model ref", () => {
    expect(
      readStoredModelRef({
        type: "video_model",
        provider: "fal_ai",
        id: "fal-ai/veo3.1"
      })
    ).toEqual({ provider: "fal_ai", id: "fal-ai/veo3.1" });
  });

  it.each([
    ["null", null],
    ["a string", "fal-ai/veo3.1"],
    ["a ref with no id", { provider: "fal_ai" }],
    ["a ref with no provider", { id: "fal-ai/veo3.1" }],
    ["a ref with blank fields", { provider: "  ", id: "  " }]
  ])("returns null for %s", (_label, value) => {
    expect(readStoredModelRef(value)).toBeNull();
  });
});

describe("useNodeVideoModelConstraints", () => {
  it("returns no constraints and queries nothing when no model is selected", () => {
    const { result } = renderHook(() => useNodeVideoModelConstraints("node1"), {
      wrapper
    });
    expect(result.current).toEqual({});
    expect(videoQuery).not.toHaveBeenCalled();
  });

  it("resolves the selected model's declared constraints", async () => {
    storedProperties = {
      model: { type: "video_model", provider: "atlascloud", id: "google/veo3.1/text-to-video" }
    };
    videoQuery.mockResolvedValue([
      { id: "some/other-model", durations: [2, 3] },
      {
        id: "google/veo3.1/text-to-video",
        durations: [4, 6, 8],
        resolutions: ["720p", "1080p"],
        aspect_ratios: ["16:9", "9:16"]
      }
    ] as never);

    const { result } = renderHook(() => useNodeVideoModelConstraints("node1"), {
      wrapper
    });
    await waitFor(() =>
      expect(result.current.durations).toEqual([4, 6, 8])
    );
    expect(result.current.resolutions).toEqual(["720p", "1080p"]);
    expect(result.current.aspectRatios).toEqual(["16:9", "9:16"]);
    expect(videoQuery).toHaveBeenCalledWith({ provider: "atlascloud" });
  });

  it("leaves constraints unknown when the provider list omits the model", async () => {
    storedProperties = {
      model: { type: "video_model", provider: "fal_ai", id: "not/in-the-list" }
    };
    videoQuery.mockResolvedValue([{ id: "other", durations: [5] }] as never);

    const { result } = renderHook(() => useNodeVideoModelConstraints("node1"), {
      wrapper
    });
    await waitFor(() => expect(videoQuery).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it("leaves constraints unknown when the provider list cannot be fetched", async () => {
    storedProperties = {
      model: { type: "video_model", provider: "fal_ai", id: "fal-ai/veo3.1" }
    };
    videoQuery.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useNodeVideoModelConstraints("node1"), {
      wrapper
    });
    await waitFor(() => expect(videoQuery).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});

describe("useNodeImageModelConstraints", () => {
  it("resolves the selected image model's declared constraints", async () => {
    storedProperties = {
      model: { type: "image_model", provider: "fal_ai", id: "fal-ai/flux" }
    };
    imageQuery.mockResolvedValue([
      {
        id: "fal-ai/flux",
        resolutions: ["1K", "2K", "480p"],
        aspect_ratios: ["1:1", "16:9"]
      }
    ] as never);

    const { result } = renderHook(() => useNodeImageModelConstraints("node1"), {
      wrapper
    });
    // "480p" is outside the app's image vocabulary and is dropped by
    // imageModelConstraints before it can reach a picker.
    await waitFor(() =>
      expect(result.current.resolutions).toEqual(["1K", "2K"])
    );
    expect(result.current.aspectRatios).toEqual(["1:1", "16:9"]);
  });
});
