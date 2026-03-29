import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import FavoriteStar from "../FavoriteStar";
import mockTheme from "../../../__mocks__/themeMock";

// Create mock favorites Set
const mockFavorites = new Set();
const mockToggleFavorite = jest.fn();

// Mock the store to return consistent values
jest.mock("../../../stores/ModelPreferencesStore", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((selector) => {
    return selector({
      favorites: mockFavorites,
      toggleFavorite: mockToggleFavorite
    });
  })
}));

// Mock Tooltip
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title, ...props }: any) => (
    <div data-title={title} data-testid="tooltip" {...props}>
      {children}
    </div>
  )
}));

describe("FavoriteStar", () => {
  it("renders without crashing", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar provider="test" id="123" />
      </ThemeProvider>
    );
    expect(document.querySelector(".favorite-star")).toBeInTheDocument();
  });

  it("renders with default props", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar />
      </ThemeProvider>
    );
    expect(document.querySelector(".favorite-star")).toBeInTheDocument();
  });

  it("renders with medium size", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar size="medium" />
      </ThemeProvider>
    );
    expect(document.querySelector(".favorite-star")).toBeInTheDocument();
  });

  it("renders with stopPropagation false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar stopPropagation={false} />
      </ThemeProvider>
    );
    expect(document.querySelector(".favorite-star")).toBeInTheDocument();
  });

  it("has correct displayName", () => {
    expect(FavoriteStar.displayName).toBe("FavoriteStar");
  });

  it("renders SVG icon", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar />
      </ThemeProvider>
    );
    const star = document.querySelector(".favorite-star");
    expect(star?.querySelector("svg")).toBeInTheDocument();
  });

  it("has correct CSS class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar />
      </ThemeProvider>
    );
    const star = document.querySelector(".favorite-star");
    expect(star).toHaveClass("favorite-star");
  });

  it("renders tooltip with title", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar />
      </ThemeProvider>
    );
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveAttribute("data-title");
  });
});
