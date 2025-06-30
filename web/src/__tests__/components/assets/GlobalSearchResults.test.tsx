import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalSearchResults from "../../../components/assets/GlobalSearchResults";
import { AssetWithPath } from "../../../stores/ApiTypes";

// Mock the stores and hooks
jest.mock("../../../hooks/assets/useAssetSelection", () => ({
  useAssetSelection: () => ({
    selectedAssetIds: [],
    handleSelectAsset: jest.fn()
  })
}));

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: any) => {
    const mockState = {
      openContextMenu: jest.fn()
    };
    return selector(mockState);
  }
}));

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: any) => {
    const mockState = {
      globalSearchQuery: "test"
    };
    return selector(mockState);
  }
}));

describe("GlobalSearchResults - Stability", () => {
  const mockAssets: AssetWithPath[] = [
    {
      id: "1",
      name: "test-image.jpg",
      content_type: "image/jpeg",
      size: 1024,
      user_id: "user1",
      parent_id: "folder1",
      workflow_id: null,
      created_at: new Date().toISOString(),
      get_url: "/api/assets/1",
      thumb_url: "/api/assets/1/thumb",
      folder_name: "Test Folder",
      folder_path: "Home / Test Folder",
      folder_id: "folder1"
    }
  ];

  it("should render without crashing", () => {
    expect(() => {
      render(<GlobalSearchResults results={mockAssets} />);
    }).not.toThrow();
  });

  it("should handle empty results gracefully", () => {
    expect(() => {
      render(<GlobalSearchResults results={[]} />);
    }).not.toThrow();

    // Should show empty state
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it("should not break when clicking results", () => {
    const mockOnAssetDoubleClick = jest.fn();

    render(
      <GlobalSearchResults
        results={mockAssets}
        onAssetDoubleClick={mockOnAssetDoubleClick}
      />
    );

    const resultItem = screen
      .getByText("test-image.jpg")
      .closest(".search-result-item");

    expect(() => {
      if (resultItem) {
        fireEvent.click(resultItem);
        fireEvent.doubleClick(resultItem);
      }
    }).not.toThrow();
  });

  it("should handle large result sets without freezing", () => {
    const largeAssetList: AssetWithPath[] = Array.from(
      { length: 100 },
      (_, i) => ({
        id: `asset-${i}`,
        name: `asset-${i}.jpg`,
        content_type: "image/jpeg",
        size: 1024 * i,
        user_id: "user1",
        parent_id: "folder1",
        workflow_id: null,
        created_at: new Date().toISOString(),
        get_url: `/api/assets/asset-${i}`,
        thumb_url: `/api/assets/asset-${i}/thumb`,
        folder_name: "Test Folder",
        folder_path: "Home / Test Folder",
        folder_id: "folder1"
      })
    );

    expect(() => {
      render(<GlobalSearchResults results={largeAssetList} />);
    }).not.toThrow();
  });
});
