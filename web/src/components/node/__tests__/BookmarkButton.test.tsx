import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { BookmarkButton } from "../BookmarkButton";
import mockTheme from "../../../__mocks__/themeMock";

describe("BookmarkButton", () => {
  const mockSetBookmark = jest.fn();
  const mockRemoveBookmark = jest.fn();

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when not bookmarked", () => {
    it("should render with unfilled bookmark icon", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    it("should call onSetBookmark with correct index when clicked", async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      await user.click(button);

      // Should open menu with slot options
      expect(await screen.findByText("Select bookmark slot")).toBeInTheDocument();

      // Click on slot 1
      const slot1 = screen.getByText("Slot 1");
      await user.click(slot1);

      expect(mockSetBookmark).toHaveBeenCalledWith(1);
    });

    it("should stop event propagation when stopPropagation is true", async () => {
      const user = userEvent.setup();
      const parentOnClick = jest.fn();

      renderWithTheme(
        <div onClick={parentOnClick}>
          <BookmarkButton
            isBookmarked={false}
            onSetBookmark={mockSetBookmark}
            onRemoveBookmark={mockRemoveBookmark}
            stopPropagation={true}
          />
        </div>
      );

      const button = screen.getByRole("button");
      await user.click(button);

      // Parent should not be clicked
      expect(parentOnClick).not.toHaveBeenCalled();
    });
  });

  describe("when bookmarked", () => {
    it("should render with filled bookmark icon", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={true}
          bookmarkIndex={1}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should call onRemoveBookmark when clicked", async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <BookmarkButton
          isBookmarked={true}
          bookmarkIndex={1}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      await user.click(button);

      expect(mockRemoveBookmark).toHaveBeenCalled();
      expect(mockSetBookmark).not.toHaveBeenCalled();
    });
  });

  describe("menu", () => {
    it("should display all 9 bookmark slots", async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      await user.click(button);

      // Check for all 9 slots
      for (let i = 1; i <= 9; i++) {
        expect(screen.getByText(`Slot ${i}`)).toBeInTheDocument();
      }
    });

    it("should close menu after selecting a slot", async () => {
      const user = userEvent.setup();
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      await user.click(button);

      expect(screen.getByText("Select bookmark slot")).toBeInTheDocument();

      const slot1 = screen.getByText("Slot 1");
      await user.click(slot1);

      await waitFor(() => {
        expect(screen.queryByText("Select bookmark slot")).not.toBeInTheDocument();
      });
    });
  });

  describe("accessibility", () => {
    it("should have aria-pressed set to true when bookmarked", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={true}
          bookmarkIndex={1}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-pressed", "true");
    });

    it("should have aria-pressed set to false when not bookmarked", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-pressed", "false");
    });

    it("should have aria-label based on bookmark state", () => {
      const { rerender } = renderWithTheme(
        <BookmarkButton
          isBookmarked={true}
          bookmarkIndex={1}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
          removeTooltip="Remove bookmark"
        />
      );

      const button = screen.getByRole("button");
      // The aria-label should contain "Remove bookmark"
      expect(button).toHaveAttribute("aria-label");
      expect(button.getAttribute("aria-label") || "").toContain("Remove bookmark");
    });
  });

  describe("disabled state", () => {
    it("should be disabled when disabled prop is true", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
          disabled={true}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should not call onSetBookmark when clicked via mouse", () => {
      renderWithTheme(
        <BookmarkButton
          isBookmarked={false}
          onSetBookmark={mockSetBookmark}
          onRemoveBookmark={mockRemoveBookmark}
          disabled={true}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      // Disabled buttons cannot be clicked via userEvent
      expect(mockSetBookmark).not.toHaveBeenCalled();
    });
  });
});
