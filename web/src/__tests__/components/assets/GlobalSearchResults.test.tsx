import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import GlobalSearchResults from "../../../components/assets/GlobalSearchResults";
import { AssetWithPath } from "../../../stores/ApiTypes";

// Create a simple mock theme for testing
const mockTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#77b4e6"
    },
    background: {
      default: "#202020",
      paper: "#232323"
    },
    text: {
      primary: "#fff"
    },
    grey: {
      "0": "#ffffff",
      "100": "#f5f5f5",
      "200": "#eeeeee",
      "400": "#bdbdbd",
      "500": "#9e9e9e",
      "600": "#757575",
      "800": "#424242"
    }
  },
  fontSizeNormal: "1rem",
  fontSizeSmall: "0.875rem",
  fontSizeSmaller: "0.75rem",
  fontFamily2: "Roboto, sans-serif"
});

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
