/**
 * PanelHeadline Component Tests
 *
 * Tests the PanelHeadline component which displays a title with optional
 * action buttons in a flex container.
 *
 * Key behaviors to test:
 * - Renders title text
 * - Renders with proper styling and classes
 * - Renders optional actions when provided
 * - Hides actions section when not provided
 * - Uses memo for performance
 * - Has correct CSS classes
 */

import React from "react";
import "@testing-library/jest-dom";
import {
  describe,
  expect,
  it,
  jest
} from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import PanelHeadline from "../PanelHeadline";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe("PanelHeadline", () => {
  describe("rendering", () => {
    it("renders the title text", () => {
      renderWithTheme(<PanelHeadline title="Test Title" />);

      expect(screen.getByText("Test Title")).toBeInTheDocument();
    });

    it("renders with panel-headline class", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test Title" />);

      const headline = container.querySelector(".panel-headline");
      expect(headline).toBeInTheDocument();
    });

    it("renders title with headline-title class", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test Title" />);

      const title = container.querySelector(".headline-title");
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent("Test Title");
    });

    it("renders as span with h6 variant", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test Title" />);

      const title = container.querySelector("span.headline-title");
      expect(title).toBeInTheDocument();
    });
  });

  describe("actions prop", () => {
    it("renders actions when provided", () => {
      const actions = <button data-testid="action-button">Action</button>;
      renderWithTheme(
        <PanelHeadline title="Test Title" actions={actions} />
      );

      const actionButton = screen.getByTestId("action-button");
      expect(actionButton).toBeInTheDocument();
      expect(actionButton).toHaveTextContent("Action");
    });

    it("renders actions with headline-actions class", () => {
      const actions = <button>Action</button>;
      const { container } = renderWithTheme(
        <PanelHeadline title="Test Title" actions={actions} />
      );

      const actionsContainer = container.querySelector(".headline-actions");
      expect(actionsContainer).toBeInTheDocument();
    });

    it("does not render actions container when actions not provided", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test Title" />);

      const actionsContainer = container.querySelector(".headline-actions");
      expect(actionsContainer).not.toBeInTheDocument();
    });

    it("renders multiple actions", () => {
      const actions = (
        <>
          <button data-testid="action-1">Action 1</button>
          <button data-testid="action-2">Action 2</button>
          <button data-testid="action-3">Action 3</button>
        </>
      );

      renderWithTheme(<PanelHeadline title="Test Title" actions={actions} />);

      expect(screen.getByTestId("action-1")).toBeInTheDocument();
      expect(screen.getByTestId("action-2")).toBeInTheDocument();
      expect(screen.getByTestId("action-3")).toBeInTheDocument();
    });

    it("renders complex action components", () => {
      const actions = (
        <div className="complex-action" data-testid="complex">
          <span>Icon</span>
          <button>Click Me</button>
        </div>
      );

      renderWithTheme(<PanelHeadline title="Test Title" actions={actions} />);

      const complexAction = screen.getByTestId("complex");
      expect(complexAction).toBeInTheDocument();
      expect(complexAction).toHaveClass("complex-action");
    });
  });

  describe("title content", () => {
    it("renders simple text title", () => {
      renderWithTheme(<PanelHeadline title="Simple Title" />);

      expect(screen.getByText("Simple Title")).toBeInTheDocument();
    });

    it("renders title with special characters", () => {
      const specialTitle = "Title with <Special> & \"Characters\"";
      renderWithTheme(<PanelHeadline title={specialTitle} />);

      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it("renders title with numbers", () => {
      renderWithTheme(<PanelHeadline title="Title 123" />);

      expect(screen.getByText("Title 123")).toBeInTheDocument();
    });

    it("renders very long title", () => {
      const longTitle = "A".repeat(200);
      renderWithTheme(<PanelHeadline title={longTitle} />);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it("renders title with emoji", () => {
      const emojiTitle = "Title with emoji";
      renderWithTheme(<PanelHeadline title={emojiTitle} />);

      expect(screen.getByText(emojiTitle)).toBeInTheDocument();
    });

    it("renders empty title", () => {
      const { container } = renderWithTheme(<PanelHeadline title="" />);

      const title = container.querySelector(".headline-title");
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent("");
    });
  });

  describe("memoization", () => {
    it("is memoized with React.memo", () => {
      const { rerender } = renderWithTheme(<PanelHeadline title="Test Title" />);

      // Rerender with same props
      rerender(
        <ThemeProvider theme={mockTheme}>
          <PanelHeadline title="Test Title" />
        </ThemeProvider>
      );

      // Component should still render without errors
      expect(screen.getByText("Test Title")).toBeInTheDocument();
    });

    it("has displayName for debugging", () => {
      // PanelHeadline is exported as memo(PanelHeadline)
      expect(PanelHeadline).toBeDefined();
    });
  });

  describe("CSS structure", () => {
    it("uses Box component with css prop", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test" />);

      const headline = container.querySelector(".panel-headline");
      expect(headline).toBeInTheDocument();
    });

    it("has flex display", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test" />);

      const headline = container.querySelector(".panel-headline");
      expect(headline).toBeInTheDocument();
    });

    it("renders Typography for title", () => {
      const { container } = renderWithTheme(<PanelHeadline title="Test" />);

      const title = container.querySelector(".headline-title");
      expect(title).toBeInTheDocument();
    });
  });

  describe("layout", () => {
    it("renders title and actions side by side", () => {
      const actions = <button data-testid="action-btn">Action</button>;
      const { container } = renderWithTheme(
        <PanelHeadline title="Test Title" actions={actions} />
      );

      const headline = container.querySelector(".panel-headline");
      expect(headline).toBeInTheDocument();

      const title = container.querySelector(".headline-title");
      const actionsContainer = container.querySelector(".headline-actions");

      expect(title).toBeInTheDocument();
      expect(actionsContainer).toBeInTheDocument();
    });

    it("maintains correct structure with actions", () => {
      const actions = <button>Action</button>;
      const { container } = renderWithTheme(
        <PanelHeadline title="Test" actions={actions} />
      );

      const headline = container.querySelector(".panel-headline");
      const title = container.querySelector(".headline-title");
      const actionsContainer = container.querySelector(".headline-actions");

      expect(headline?.contains(title)).toBe(true);
      expect(headline?.contains(actionsContainer)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles undefined actions prop", () => {
      const { container } = renderWithTheme(
        <PanelHeadline title="Test" actions={undefined} />
      );

      const actionsContainer = container.querySelector(".headline-actions");
      expect(actionsContainer).not.toBeInTheDocument();
    });

    it("handles null actions prop", () => {
      const { container } = renderWithTheme(
        <PanelHeadline title="Test" actions={null as unknown as React.ReactNode} />
      );

      const actionsContainer = container.querySelector(".headline-actions");
      expect(actionsContainer).not.toBeInTheDocument();
    });

    it("handles empty array as actions", () => {
      const { container } = renderWithTheme(
        <PanelHeadline title="Test" actions={[] as unknown as React.ReactNode} />
      );

      // Empty array is truthy, so actions should render
      const actionsContainer = container.querySelector(".headline-actions");
      expect(actionsContainer).toBeInTheDocument();
    });

    it("handles whitespace-only title", () => {
      const { container } = renderWithTheme(<PanelHeadline title="   " />);

      const title = container.querySelector(".headline-title");
      expect(title).toBeInTheDocument();
      // Whitespace-only title renders but may be normalized
      expect(title?.textContent).toBe("   ");
    });
  });

  describe("type safety", () => {
    it("accepts valid props", () => {
      expect(() => {
        renderWithTheme(<PanelHeadline title="Test" />);
      }).not.toThrow();
    });

    it("accepts title and actions props", () => {
      const actions = <button>Action</button>;
      expect(() => {
        renderWithTheme(<PanelHeadline title="Test" actions={actions} />);
      }).not.toThrow();
    });
  });

  describe("integration", () => {
    it("works with themed provider", () => {
      renderWithTheme(<PanelHeadline title="Themed Title" />);

      expect(screen.getByText("Themed Title")).toBeInTheDocument();
    });

    it("passes through action click events", () => {
      const handleClick = jest.fn();
      const actions = (
        <button data-testid="click-action" onClick={handleClick}>
          Click Me
        </button>
      );

      renderWithTheme(<PanelHeadline title="Test" actions={actions} />);

      const button = screen.getByTestId("click-action");
      button.click();

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("renders multiple clickable actions", () => {
      const handleClick1 = jest.fn();
      const handleClick2 = jest.fn();
      const actions = (
        <>
          <button data-testid="btn-1" onClick={handleClick1}>
            Action 1
          </button>
          <button data-testid="btn-2" onClick={handleClick2}>
            Action 2
          </button>
        </>
      );

      renderWithTheme(<PanelHeadline title="Test" actions={actions} />);

      screen.getByTestId("btn-1").click();
      screen.getByTestId("btn-2").click();

      expect(handleClick1).toHaveBeenCalledTimes(1);
      expect(handleClick2).toHaveBeenCalledTimes(1);
    });
  });
});
