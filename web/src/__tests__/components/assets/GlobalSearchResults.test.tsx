import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import GlobalSearchResults from "../../../components/assets/GlobalSearchResults";
import { AssetWithPath } from "../../../stores/ApiTypes";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:8000"
}));

// MUI Tooltip can access theme vars; keep Tooltip pass-through
jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    Tooltip: ({ children }: any) => <>{children}</>
  };
});

// Mock the stores and hooks
jest.mock("../../../hooks/assets/useAssetSelection", () => ({
  useAssetSelection: () => ({
    selectedAssetIds: [],
    handleSelectAsset: jest.fn()
  })
}));

jest.mock("../../../config/data_types", () => ({
  IconForType: () => <div>Icon</div>
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => mockTheme
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

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

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
      renderWithTheme(<GlobalSearchResults results={mockAssets} />);
    }).not.toThrow();
  });

  it("should handle empty results gracefully", () => {
    expect(() => {
      renderWithTheme(<GlobalSearchResults results={[]} />);
    }).not.toThrow();

    // Should show empty state
    expect(
      screen.getByText(/no assets found matching your search/i)
    ).toBeInTheDocument();
  });

  it("should not break when clicking results", () => {
    const mockOnAssetDoubleClick = jest.fn();

    renderWithTheme(
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
      renderWithTheme(<GlobalSearchResults results={largeAssetList} />);
    }).not.toThrow();
  });
});
