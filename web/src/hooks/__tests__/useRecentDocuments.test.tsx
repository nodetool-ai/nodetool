import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useRecentDocuments } from "../useRecentDocuments";
import { useApplications } from "../useApplications";
import { useTimelines } from "../useTimelineSequence";
import { useStoryboards } from "../storyboard/useStoryboards";
import { useScripts } from "../script/useScripts";
import { useJsScripts } from "../jsScript/useJsScripts";
import { trpc, trpcClient } from "../../trpc/client";

jest.mock("../useApplications", () => ({ useApplications: jest.fn() }));
jest.mock("../useTimelineSequence", () => ({ useTimelines: jest.fn() }));
jest.mock("../storyboard/useStoryboards", () => ({
  useStoryboards: jest.fn()
}));
jest.mock("../script/useScripts", () => ({ useScripts: jest.fn() }));
jest.mock("../jsScript/useJsScripts", () => ({ useJsScripts: jest.fn() }));
jest.mock("../../trpc/client", () => ({
  trpc: { sketch: { list: { useQuery: jest.fn() } } },
  trpcClient: { assets: { list: { query: jest.fn() } } }
}));

const mocked = {
  apps: useApplications as jest.Mock,
  timelines: useTimelines as jest.Mock,
  storyboards: useStoryboards as jest.Mock,
  scripts: useScripts as jest.Mock,
  jsScripts: useJsScripts as jest.Mock,
  sketches: trpc.sketch.list.useQuery as jest.Mock,
  assets: trpcClient.assets.list.query as jest.Mock
};

/** A typed list item, as every document router returns one. */
const item = (id: string, name: string, updatedAt: string) => ({
  id,
  name,
  updatedAt
});

const asset = (
  id: string,
  name: string,
  contentType: string,
  createdAt: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  name,
  content_type: contentType,
  created_at: createdAt,
  sketch_document_id: null,
  thumb_url: null,
  ...extra
});

/** Every list empty; individual tests fill in the ones they care about. */
const seedEmpty = () => {
  for (const key of [
    "apps",
    "timelines",
    "storyboards",
    "scripts",
    "jsScripts",
    "sketches"
  ] as const) {
    mocked[key].mockReturnValue({ data: [], isLoading: false });
  }
  mocked.assets.mockResolvedValue({ assets: [], next: null });
};

const renderDocuments = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRecentDocuments(), { wrapper });
};

describe("useRecentDocuments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedEmpty();
  });

  it("merges every document type into one feed, newest first", async () => {
    mocked.apps.mockReturnValue({
      data: [item("a1", "Note drafter", "2026-08-10T00:00:00Z")],
      isLoading: false
    });
    mocked.sketches.mockReturnValue({
      data: [item("sk1", "Poster", "2026-08-14T00:00:00Z")],
      isLoading: false
    });
    mocked.timelines.mockReturnValue({
      data: [item("t1", "Trailer", "2026-08-16T00:00:00Z")],
      isLoading: false
    });
    mocked.storyboards.mockReturnValue({
      data: [item("sb1", "Board", "2026-08-11T00:00:00Z")],
      isLoading: false
    });
    mocked.scripts.mockReturnValue({
      data: [item("s1", "Voiceover", "2026-08-12T00:00:00Z")],
      isLoading: false
    });
    mocked.jsScripts.mockReturnValue({
      data: [item("j1", "Sum", "2026-08-13T00:00:00Z")],
      isLoading: false
    });
    mocked.assets.mockResolvedValue({
      assets: [asset("as1", "photo.png", "image/png", "2026-08-15T00:00:00Z")],
      next: null
    });

    const { result } = renderDocuments();

    await waitFor(() => expect(result.current.documents).toHaveLength(7));
    expect(result.current.documents.map((d) => d.kind)).toEqual([
      "timeline",
      "image",
      "sketch",
      "jsscript",
      "script",
      "storyboard",
      "app"
    ]);
  });

  it("maps each asset content type to the tab that opens it", async () => {
    mocked.assets.mockResolvedValue({
      assets: [
        asset("i1", "photo.png", "image/png", "2026-08-16T00:00:00Z"),
        asset("a1", "take.wav", "audio/wav", "2026-08-15T00:00:00Z"),
        asset("m1", "cube.glb", "model/gltf-binary", "2026-08-14T00:00:00Z"),
        asset("t1", "notes.md", "text/markdown", "2026-08-13T00:00:00Z")
      ],
      next: null
    });

    const { result } = renderDocuments();

    await waitFor(() => expect(result.current.documents).toHaveLength(4));
    expect(result.current.documents.map((d) => d.tabType)).toEqual([
      "image",
      "audio",
      "model3d",
      "text"
    ]);
  });

  it("drops assets no workspace surface can open", async () => {
    mocked.assets.mockResolvedValue({
      assets: [
        asset("f1", "My folder", "folder", "2026-08-16T00:00:00Z"),
        asset("v1", "clip.mp4", "video/mp4", "2026-08-15T00:00:00Z"),
        asset("i1", "photo.png", "image/png", "2026-08-14T00:00:00Z")
      ],
      next: null
    });

    const { result } = renderDocuments();

    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    expect(result.current.documents[0].id).toBe("i1");
  });

  it("lists a sketch once, not also as its saved image asset", async () => {
    mocked.sketches.mockReturnValue({
      data: [item("sk1", "Poster", "2026-08-16T00:00:00Z")],
      isLoading: false
    });
    mocked.assets.mockResolvedValue({
      assets: [
        asset("as1", "Poster.png", "image/png", "2026-08-16T00:00:00Z", {
          sketch_document_id: "sk1"
        }),
        // An unrelated asset, so the wait below cannot settle before the
        // asset query has landed — otherwise "one document" would pass while
        // the sketch's own image was still in flight.
        asset("as2", "photo.png", "image/png", "2026-08-15T00:00:00Z")
      ],
      next: null
    });

    const { result } = renderDocuments();

    await waitFor(() =>
      expect(result.current.documents.some((d) => d.id === "as2")).toBe(true)
    );
    expect(result.current.documents.map((d) => d.key)).toEqual([
      "sketch:sk1",
      "image:as2"
    ]);
  });

  it("names an untitled document by its type", async () => {
    mocked.timelines.mockReturnValue({
      data: [item("t1", "", "2026-08-16T00:00:00Z")],
      isLoading: false
    });

    const { result } = renderDocuments();

    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    expect(result.current.documents[0].name).toBe("Untitled video");
  });

  it("keys documents by type so two ids can collide", async () => {
    mocked.scripts.mockReturnValue({
      data: [item("shared", "A script", "2026-08-16T00:00:00Z")],
      isLoading: false
    });
    mocked.storyboards.mockReturnValue({
      data: [item("shared", "A board", "2026-08-15T00:00:00Z")],
      isLoading: false
    });

    const { result } = renderDocuments();

    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    const keys = result.current.documents.map((d) => d.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("reports loading while any list is still in flight", () => {
    mocked.scripts.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderDocuments();

    expect(result.current.isLoading).toBe(true);
  });
});
