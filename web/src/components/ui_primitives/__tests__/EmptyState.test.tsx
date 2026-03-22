import React from "react";
import { render, screen, act } from "@testing-library/react";
import { EmptyState } from "../EmptyState";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("EmptyState", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("default rendering", () => {
    it("renders with default empty variant", () => {
      renderWithTheme(<EmptyState />);

      expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
      expect(screen.getByText("Get started by creating your first item.")).toBeInTheDocument();
    });

    it("renders with icon container", () => {
      const { container } = renderWithTheme(<EmptyState />);

      const iconContainer = container.querySelector(".empty-icon");
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("renders no-results variant", () => {
      renderWithTheme(<EmptyState variant="no-results" />);

      expect(screen.getByText("No results found")).toBeInTheDocument();
      expect(screen.getByText("Try adjusting your search or filters.")).toBeInTheDocument();
    });

    it("renders no-data variant", () => {
      renderWithTheme(<EmptyState variant="no-data" />);

      expect(screen.getByText("No data available")).toBeInTheDocument();
      expect(screen.getByText("Data will appear here when available.")).toBeInTheDocument();
    });

    it("renders offline variant", () => {
      renderWithTheme(<EmptyState variant="offline" />);

      expect(screen.getByText("You're offline")).toBeInTheDocument();
      expect(screen.getByText("Check your internet connection and try again.")).toBeInTheDocument();
    });

    it("renders error variant", () => {
      renderWithTheme(<EmptyState variant="error" />);

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
    });
  });

  describe("custom content", () => {
    it("renders with custom title", () => {
      renderWithTheme(<EmptyState title="Custom Title" />);

      expect(screen.getByText("Custom Title")).toBeInTheDocument();
      expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
    });

    it("renders with custom description", () => {
      renderWithTheme(<EmptyState description="Custom description text" />);

      expect(screen.getByText("Custom description text")).toBeInTheDocument();
      expect(screen.queryByText("Get started by creating your first item.")).not.toBeInTheDocument();
    });

    it("renders with custom icon", () => {
      renderWithTheme(<EmptyState icon={<div data-testid="custom-icon">Custom Icon</div>} />);

      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    });

    it("renders with default description when empty string is provided", () => {
      renderWithTheme(<EmptyState description="" />);

      expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
      expect(screen.getByText("Get started by creating your first item.")).toBeInTheDocument();
    });
  });

  describe("action button", () => {
    it("renders action button when actionText and onAction are provided", () => {
      const handleClick = jest.fn();

      renderWithTheme(<EmptyState actionText="Create Item" onAction={handleClick} />);

      const button = screen.getByRole("button", { name: "Create Item" });
      expect(button).toBeInTheDocument();
    });

    it("does not render action button when only actionText is provided", () => {
      renderWithTheme(<EmptyState actionText="Create Item" />);

      const button = screen.queryByRole("button", { name: "Create Item" });
      expect(button).not.toBeInTheDocument();
    });

    it("does not render action button when only onAction is provided", () => {
      const handleClick = jest.fn();

      renderWithTheme(<EmptyState onAction={handleClick} />);

      const button = screen.queryByRole("button");
      expect(button).not.toBeInTheDocument();
    });

    it("calls onAction when button is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      renderWithTheme(<EmptyState actionText="Click Me" onAction={handleClick} />);

      const button = screen.getByRole("button", { name: "Click Me" });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("sizes", () => {
    it("renders with small size", () => {
      const { container } = renderWithTheme(<EmptyState size="small" />);

      const emptyState = container.querySelector(".empty-state");
      expect(emptyState).toBeInTheDocument();

      const styles = window.getComputedStyle(emptyState!);
      expect(styles.padding).not.toBe("0px");
    });

    it("renders with medium size (default)", () => {
      const { container } = renderWithTheme(<EmptyState size="medium" />);

      const emptyState = container.querySelector(".empty-state");
      expect(emptyState).toBeInTheDocument();
    });

    it("renders with large size", () => {
      const { container } = renderWithTheme(<EmptyState size="large" />);

      const emptyState = container.querySelector(".empty-state");
      expect(emptyState).toBeInTheDocument();
    });
  });

  describe("custom className", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(<EmptyState className="my-custom-class" />);

      const emptyState = container.querySelector(".empty-state");
      expect(emptyState).toHaveClass("my-custom-class");
    });

    it("applies base class and custom className", () => {
      const { container } = renderWithTheme(<EmptyState className="custom-class" />);

      const emptyState = container.querySelector(".empty-state");
      expect(emptyState).toHaveClass("empty-state");
      expect(emptyState).toHaveClass("custom-class");
    });
  });

  describe("combinations", () => {
    it("renders custom content with action button", () => {
      const handleClick = jest.fn();

      renderWithTheme(
        <EmptyState
          variant="no-results"
          title="No items found"
          description="Try a different search term"
          actionText="Clear Filters"
          onAction={handleClick}
        />
      );

      expect(screen.getByText("No items found")).toBeInTheDocument();
      expect(screen.getByText("Try a different search term")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear Filters" })).toBeInTheDocument();
    });

    it("renders with all props customized", () => {
      const handleClick = jest.fn();

      renderWithTheme(
        <EmptyState
          variant="error"
          icon={<div data-testid="error-icon">Error</div>}
          title="Loading Failed"
          description="Could not load data from server"
          actionText="Retry"
          onAction={handleClick}
          size="large"
          className="error-state"
        />
      );

      expect(screen.getByTestId("error-icon")).toBeInTheDocument();
      expect(screen.getByText("Loading Failed")).toBeInTheDocument();
      expect(screen.getByText("Could not load data from server")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has correct heading level for small size", () => {
      renderWithTheme(<EmptyState size="small" title="Small Title" />);

      const title = screen.getByText("Small Title");
      expect(title.tagName).toBe("P");
    });

    it("has correct heading level for medium size", () => {
      renderWithTheme(<EmptyState size="medium" title="Medium Title" />);

      const title = screen.getByText("Medium Title");
      expect(title.tagName).toBe("H6");
    });

    it("has correct heading level for large size", () => {
      renderWithTheme(<EmptyState size="large" title="Large Title" />);

      const title = screen.getByText("Large Title");
      expect(title.tagName).toBe("H5");
    });

    it("action button is keyboard accessible", async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      renderWithTheme(<EmptyState actionText="Action" onAction={handleClick} />);

      const button = screen.getByRole("button", { name: "Action" });
      
      await act(async () => {
        button.focus();
      });
      
      expect(button).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
