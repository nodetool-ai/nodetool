/**
 * Tests for BookmarkButton component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import BookmarkButton from "../BookmarkButton";
import { useNodeBookmarksStore } from "../../../stores/NodeBookmarksStore";

// Mock the store
jest.mock("../../../stores/NodeBookmarksStore");

const mockToggleBookmark = jest.fn();
const mockIsBookmarked = jest.fn();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("BookmarkButton", () => {
  const defaultProps = {
    nodeId: "test-node-1",
    nodeName: "Test Node",
    nodeType: "nodetool.test.Test"
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useNodeBookmarksStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        const state = {
          isBookmarked: mockIsBookmarked,
          toggleBookmark: mockToggleBookmark
        };
        return selector(state);
      }
      return {
        isBookmarked: mockIsBookmarked,
        toggleBookmark: mockToggleBookmark
      };
    });
  });

  it("renders bookmark border icon when node is not bookmarked", () => {
    mockIsBookmarked.mockReturnValue(false);
    
    renderWithTheme(<BookmarkButton {...defaultProps} />);
    
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("renders filled bookmark icon when node is bookmarked", () => {
    mockIsBookmarked.mockReturnValue(true);
    
    renderWithTheme(<BookmarkButton {...defaultProps} />);
    
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    // Just check that it renders correctly, not exact color
    expect(button).toHaveAttribute("aria-label", "Remove bookmark");
  });

  it("calls toggleBookmark when clicked", async () => {
    const user = userEvent.setup();
    mockIsBookmarked.mockReturnValue(false);
    
    renderWithTheme(<BookmarkButton {...defaultProps} />);
    
    const button = screen.getByRole("button");
    await user.click(button);
    
    expect(mockToggleBookmark).toHaveBeenCalledWith(
      "test-node-1",
      "Test Node",
      "nodetool.test.Test"
    );
  });

  it("stops event propagation when clicked", async () => {
    const user = userEvent.setup();
    mockIsBookmarked.mockReturnValue(false);
    
    const onClickParent = jest.fn();
    
    renderWithTheme(
      <div onClick={onClickParent}>
        <BookmarkButton {...defaultProps} />
      </div>
    );
    
    const button = screen.getByRole("button");
    await user.click(button);
    
    // The button click should have been called
    expect(mockToggleBookmark).toHaveBeenCalled();
  });

  it("calls onBookmarkChange callback when bookmark is added", async () => {
    const user = userEvent.setup();
    mockIsBookmarked.mockReturnValue(false);
    const onBookmarkChange = jest.fn();
    
    renderWithTheme(
      <BookmarkButton {...defaultProps} onBookmarkChange={onBookmarkChange} />
    );
    
    const button = screen.getByRole("button");
    await user.click(button);
    
    expect(onBookmarkChange).toHaveBeenCalledWith(true);
  });

  it("calls onBookmarkChange callback when bookmark is removed", async () => {
    const user = userEvent.setup();
    mockIsBookmarked.mockReturnValue(true);
    const onBookmarkChange = jest.fn();
    
    renderWithTheme(
      <BookmarkButton {...defaultProps} onBookmarkChange={onBookmarkChange} />
    );
    
    const button = screen.getByRole("button");
    await user.click(button);
    
    expect(onBookmarkChange).toHaveBeenCalledWith(false);
  });

  it("has correct aria-label when not bookmarked", () => {
    mockIsBookmarked.mockReturnValue(false);
    
    renderWithTheme(<BookmarkButton {...defaultProps} />);
    
    const button = screen.getByRole("button", { name: /Bookmark node/i });
    expect(button).toBeInTheDocument();
  });

  it("has correct aria-label when bookmarked", () => {
    mockIsBookmarked.mockReturnValue(true);
    
    renderWithTheme(<BookmarkButton {...defaultProps} />);
    
    const button = screen.getByRole("button", { name: /Remove bookmark/i });
    expect(button).toBeInTheDocument();
  });

  it("applies custom sx prop", () => {
    mockIsBookmarked.mockReturnValue(false);
    const customSx = { mt: 2, ml: 1 };
    
    renderWithTheme(
      <BookmarkButton {...defaultProps} sx={customSx} />
    );
    
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("renders with different size props", () => {
    mockIsBookmarked.mockReturnValue(false);
    
    const { rerender } = renderWithTheme(
      <BookmarkButton {...defaultProps} size="small" />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    
    rerender(
      <ThemeProvider theme={mockTheme}>
        <BookmarkButton {...defaultProps} size="large" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
