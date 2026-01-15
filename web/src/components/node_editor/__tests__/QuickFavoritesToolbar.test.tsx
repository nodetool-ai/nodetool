import React from "react";
import { render, screen, act } from "@testing-library/react";
import QuickFavoritesToolbar from "../QuickFavoritesToolbar";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { useFavoriteNodesStore } from "../../../stores/FavoriteNodesStore";

jest.mock("../../../hooks/useCreateNode", () => ({
  useCreateNode: jest.fn(() => jest.fn())
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("QuickFavoritesToolbar", () => {
  beforeEach(() => {
    act(() => {
      useFavoriteNodesStore.setState({
        favorites: [
          { nodeType: "nodetool.test.Node1", timestamp: Date.now() },
          { nodeType: "nodetool.test.Node2", timestamp: Date.now() - 1000 },
          { nodeType: "nodetool.test.Node3", timestamp: Date.now() - 2000 }
        ],
        removeFavorite: jest.fn(),
        addFavorite: jest.fn()
      });
    });
  });

  afterEach(() => {
    act(() => {
      useFavoriteNodesStore.setState({ favorites: [] });
    });
  });

  it("renders when favorites exist", () => {
    renderWithTheme(<QuickFavoritesToolbar />);
    const toolbar = screen.getByRole("region", { name: /quick favorites toolbar/i });
    expect(toolbar).toBeInTheDocument();
  });

  it("displays favorite node buttons", () => {
    renderWithTheme(<QuickFavoritesToolbar />);
    const buttons = screen.getAllByRole("button", { name: /Add.*to canvas/i });
    expect(buttons.length).toBe(3);
  });

  it("contains add button to open node menu", () => {
    renderWithTheme(<QuickFavoritesToolbar />);
    const addButton = screen.getByRole("button", { name: /open node menu/i });
    expect(addButton).toBeInTheDocument();
  });

  it("shows star icon for favorites", () => {
    renderWithTheme(<QuickFavoritesToolbar />);
    const starIcons = screen.getAllByTestId("StarIcon");
    expect(starIcons.length).toBeGreaterThan(0);
  });

  it("does not render when no favorites", () => {
    act(() => {
      useFavoriteNodesStore.setState({ favorites: [] });
    });
    
    const { container } = renderWithTheme(<QuickFavoritesToolbar />);
    expect(container.querySelector('[role="region"]')).toBeNull();
  });
});
