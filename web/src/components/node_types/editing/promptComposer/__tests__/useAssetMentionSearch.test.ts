import { renderHook, waitFor } from "@testing-library/react";
import type { Entity } from "@nodetool-ai/protocol";
import {
  filterEntitiesForMention,
  useAssetMentionSearch
} from "../useAssetMentionSearch";
import { useAssetStore } from "../../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../../stores/RecentAssetsStore";
import { useEntities } from "../../../../../serverState/useEntities";

jest.mock("../../../../../stores/AssetStore");
jest.mock("../../../../../stores/RecentAssetsStore");
jest.mock("../../../../../serverState/useEntities", () => ({
  useEntities: jest.fn()
}));

describe("useAssetMentionSearch", () => {
  const mockSearch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAssetStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({ search: mockSearch, update: jest.fn() })
    );
    (useRecentAssetsStore as unknown as jest.Mock).mockImplementation(
      (selector) =>
        selector({ recentAssets: [], renameRecentAsset: jest.fn() })
    );
    (useEntities as unknown as jest.Mock).mockReturnValue({ data: [] });
  });

  it("filters folders out of empty-query browse results", async () => {
    mockSearch.mockResolvedValue({
      assets: [
        { id: "folder-1", name: "Photos", content_type: "folder" },
        { id: "file-1", name: "cat.png", content_type: "image/png" }
      ],
      next_cursor: null
    });

    const { result } = renderHook(() => useAssetMentionSearch(""));
    result.current.setActiveTab("saved");

    await waitFor(() => {
      expect(result.current.displayedAssets).toEqual([
        { id: "file-1", name: "cat.png", content_type: "image/png" }
      ]);
    });
  });

  it("surfaces library entities filtered by the query", async () => {
    mockSearch.mockResolvedValue({ assets: [], next_cursor: null });
    (useEntities as unknown as jest.Mock).mockReturnValue({
      data: [
        { type: "entity", id: "e1", kind: "character", name: "Marta", descriptor: "" },
        { type: "entity", id: "e2", kind: "style", name: "Noir", descriptor: "" }
      ]
    });

    const { result, rerender } = renderHook(
      ({ q }: { q: string | null }) => useAssetMentionSearch(q),
      { initialProps: { q: "mar" as string | null } }
    );
    expect(result.current.entities.map((e) => e.id)).toEqual(["e1"]);

    // No active mention → no entities offered.
    rerender({ q: null });
    expect(result.current.entities).toEqual([]);
  });
});

describe("filterEntitiesForMention", () => {
  const entities = [
    { type: "entity", id: "a", kind: "character", name: "Amara", descriptor: "" },
    { type: "entity", id: "b", kind: "character", name: "Marta", descriptor: "" },
    { type: "entity", id: "c", kind: "style", name: "Noir", descriptor: "", tags: ["moody"] }
  ] as unknown as Entity[];

  it("keeps library order for an empty query", () => {
    expect(filterEntitiesForMention(entities, "").map((e) => e.id)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("ranks name prefix over substring over kind/tag matches", () => {
    expect(filterEntitiesForMention(entities, "mar").map((e) => e.id)).toEqual([
      "b", // "Marta" starts with mar
      "a" // "Amara" contains mar
    ]);
    expect(filterEntitiesForMention(entities, "moody").map((e) => e.id)).toEqual(
      ["c"]
    );
  });

  it("drops non-matches", () => {
    expect(filterEntitiesForMention(entities, "zzz")).toEqual([]);
  });
});
