import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import AssetSearchInput from "../../../components/assets/AssetSearchInput";

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
    // Add the custom palette properties
    c_hl1: "#77b4e6",
    c_white: "#FCFCFC",
    c_gray1: "#242424"
  } as any // Use 'as any' to bypass TypeScript checking for custom properties
});

// Mock the stores and hooks
jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: any) => {
    const mockState = {
      isGlobalSearchMode: false,
      setIsGlobalSearchMode: jest.fn(),
      globalSearchResults: [],
      setGlobalSearchResults: jest.fn(),
      setIsGlobalSearchActive: jest.fn(),
      setGlobalSearchQuery: jest.fn()
    };
    return selector(mockState);
  }
}));

jest.mock("../../../serverState/useAssetSearch", () => ({
  useAssetSearch: () => ({
    searchAssets: jest.fn().mockResolvedValue({ assets: [] })
  })
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("AssetSearchInput - Basic Functionality", () => {
  const mockOnLocalSearchChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should not crash when switching modes", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <AssetSearchInput onLocalSearchChange={mockOnLocalSearchChange} />
    );

    const toggleButton = screen.getByTestId("asset-search-mode-toggle");

    // Should not crash when clicking mode toggle multiple times
    expect(() => {
      fireEvent.click(toggleButton);
      fireEvent.click(toggleButton);
      fireEvent.click(toggleButton);
    }).not.toThrow();
  });

  it("should not crash with empty search input", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <AssetSearchInput onLocalSearchChange={mockOnLocalSearchChange} />
    );

    const searchInput = screen.getByTestId("asset-search-input-field");

    // Should not crash with empty input
    expect(() => {
      fireEvent.change(searchInput, { target: { value: "" } });
    }).not.toThrow();
  });

  it("should not break keyboard navigation", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <AssetSearchInput onLocalSearchChange={mockOnLocalSearchChange} />
    );

    const searchInput = screen.getByTestId("asset-search-input-field");

    // Should not crash with keyboard events
    expect(() => {
      fireEvent.keyDown(searchInput, { key: "Enter" });
      fireEvent.keyDown(searchInput, { key: "Escape" });
      fireEvent.keyDown(searchInput, { key: "Backspace", metaKey: true });
    }).not.toThrow();
  });

  it("should handle rapid mode switching gracefully", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <AssetSearchInput onLocalSearchChange={mockOnLocalSearchChange} />
    );

    const toggleButton = screen.getByTestId("asset-search-mode-toggle");
    const searchInput = screen.getByTestId("asset-search-input-field");

    // Rapid mode switching while typing
    expect(() => {
      fireEvent.change(searchInput, { target: { value: "test" } });
      fireEvent.click(toggleButton);
      fireEvent.change(searchInput, { target: { value: "test2" } });
      fireEvent.click(toggleButton);
    }).not.toThrow();
  });
});
