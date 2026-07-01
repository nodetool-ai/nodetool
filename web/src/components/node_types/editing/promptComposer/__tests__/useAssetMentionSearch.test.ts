import { renderHook, waitFor } from "@testing-library/react";
import { useAssetMentionSearch } from "../useAssetMentionSearch";
import { useAssetStore } from "../../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../../stores/RecentAssetsStore";

jest.mock("../../../../../stores/AssetStore");
jest.mock("../../../../../stores/RecentAssetsStore");

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
});
