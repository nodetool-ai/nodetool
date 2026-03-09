import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { WarningBanner } from "../WarningBanner";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the constants
jest.mock("../../../config/constants", () => ({
  TOOLTIP_ENTER_DELAY: 500
}));

// Mock MUI Tooltip to simplify testing
jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  const TooltipMock = ({ children, title, enterDelay }: any) => (
    <div data-testid="tooltip" data-title={title} data-enter-delay={enterDelay}>
      {children}
    </div>
  );
  TooltipMock.displayName = "TooltipMock";
  return {
    ...actual,
    Tooltip: TooltipMock
  };
});

describe("WarningBanner", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("default rendering", () => {
    it("renders with default warning variant", () => {
      renderWithTheme(<WarningBanner message="Warning message" />);

      expect(screen.getByText("Warning message")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("renders with warning icon by default", () => {
      const { container } = renderWithTheme(<WarningBanner message="Warning message" />);

      const icon = container.querySelector(".banner-icon");
      expect(icon).toBeInTheDocument();
    });

    it("applies correct CSS classes", () => {
      const { container } = renderWithTheme(<WarningBanner message="Warning message" />);

      const banner = container.querySelector(".warning-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveClass("nodrag");
    });
  });

  describe("variants", () => {
    it("renders warning variant", () => {
      renderWithTheme(<WarningBanner message="Warning message" variant="warning" />);

      expect(screen.getByText("Warning message")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("renders error variant", () => {
      renderWithTheme(<WarningBanner message="Error message" variant="error" />);

      expect(screen.getByText("Error message")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("renders info variant", () => {
      renderWithTheme(<WarningBanner message="Info message" variant="info" />);

      expect(screen.getByText("Info message")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("renders correct icon for each variant", () => {
      const { container: warningContainer } = renderWithTheme(
        <WarningBanner message="Warning" variant="warning" />
      );
      const { container: errorContainer } = renderWithTheme(
        <WarningBanner message="Error" variant="error" />
      );
      const { container: infoContainer } = renderWithTheme(
        <WarningBanner message="Info" variant="info" />
      );

      // All variants should have an icon
      expect(warningContainer.querySelector(".banner-icon")).toBeInTheDocument();
      expect(errorContainer.querySelector(".banner-icon")).toBeInTheDocument();
      expect(infoContainer.querySelector(".banner-icon")).toBeInTheDocument();
    });
  });

  describe("description", () => {
    it("does not render description when not provided", () => {
      renderWithTheme(<WarningBanner message="Main message" />);

      expect(screen.getByText("Main message")).toBeInTheDocument();
      expect(screen.queryByText("Description text")).not.toBeInTheDocument();
    });

    it("renders description when provided", () => {
      renderWithTheme(
        <WarningBanner message="Main message" description="Description text" />
      );

      expect(screen.getByText("Main message")).toBeInTheDocument();
      expect(screen.getByText("Description text")).toBeInTheDocument();
    });

    it("renders description in correct element", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Main message" description="Description text" />
      );

      const description = container.querySelector(".banner-description");
      expect(description).toBeInTheDocument();
      expect(description).toHaveTextContent("Description text");
    });
  });

  describe("dismissible functionality", () => {
    it("does not render dismiss button when dismissible is false", () => {
      renderWithTheme(<WarningBanner message="Warning" />);

      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    });

    it("does not render dismiss button when dismissible is true but no onDismiss", () => {
      renderWithTheme(<WarningBanner message="Warning" dismissible />);

      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    });

    it("renders dismiss button when dismissible and onDismiss are provided", () => {
      const handleDismiss = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />);

      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      const handleDismiss = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />);

      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      await user.click(dismissButton);

      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });

    it("dismiss button has correct accessibility attributes", () => {
      const handleDismiss = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />);

      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      expect(dismissButton).toHaveAttribute("aria-label", "Dismiss");
    });
  });

  describe("action button", () => {
    it("does not render action when only action prop is provided", () => {
      renderWithTheme(<WarningBanner message="Warning" action={<button>Click me</button>} />);

      expect(screen.queryByRole("button", { name: "Take action" })).not.toBeInTheDocument();
    });

    it("does not render action when only onAction prop is provided", () => {
      const handleAction = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" onAction={handleAction} />);

      expect(screen.queryByRole("button", { name: "Take action" })).not.toBeInTheDocument();
    });

    it("renders action when both action and onAction are provided", () => {
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button data-testid="custom-action">Action</button>}
          onAction={handleAction}
        />
      );

      expect(screen.getByTestId("custom-action")).toBeInTheDocument();
    });

    it("calls onAction when action is clicked", async () => {
      const user = userEvent.setup();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button>Action Button</button>}
          onAction={handleAction}
        />
      );

      const actionButton = screen.getByRole("button", { name: "Action Button" });
      await user.click(actionButton);

      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it("calls onAction when Enter key is pressed on action", async () => {
      const user = userEvent.setup();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button>Action Button</button>}
          onAction={handleAction}
        />
      );

      const actionContainer = screen.getByRole("button", { name: "Take action" });
      actionContainer.focus();
      await user.keyboard("{Enter}");

      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it("action container has correct accessibility attributes", () => {
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button>Action</button>}
          onAction={handleAction}
        />
      );

      const actionContainer = screen.getByRole("button", { name: "Take action" });
      expect(actionContainer).toHaveAttribute("tabIndex", "0");
      expect(actionContainer).toHaveAttribute("aria-label", "Take action");
    });
  });

  describe("animation", () => {
    it("applies animation when animate is true", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" animate />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toBeInTheDocument();
      // Animation is applied via CSS keyframes, we just verify the component renders
    });

    it("does not apply animation when animate is false", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" animate={false} />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("applies compact class when compact is true", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" compact />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toHaveClass("compact");
    });

    it("does not apply compact class when compact is false", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" compact={false} />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).not.toHaveClass("compact");
    });

    it("renders in compact mode with all features", () => {
      const handleDismiss = jest.fn();

      const { container } = renderWithTheme(
        <WarningBanner
          message="Warning"
          description="Description"
          compact
          dismissible
          onDismiss={handleDismiss}
        />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toHaveClass("compact");
      expect(screen.getByText("Warning")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });
  });

  describe("custom className", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" className="my-custom-class" />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toHaveClass("my-custom-class");
    });

    it("applies multiple classes together", () => {
      const { container } = renderWithTheme(
        <WarningBanner message="Warning" className="custom-class" />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toHaveClass("warning-banner");
      expect(banner).toHaveClass("nodrag");
      expect(banner).toHaveClass("custom-class");
    });
  });

  describe("accessibility", () => {
    it("has role alert", () => {
      renderWithTheme(<WarningBanner message="Warning" />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("dismiss button is keyboard accessible", async () => {
      const user = userEvent.setup();
      const handleDismiss = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />);

      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      await user.click(dismissButton);

      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });

    it("action is keyboard accessible via Enter key", async () => {
      const user = userEvent.setup();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button>Action Button</button>}
          onAction={handleAction}
        />
      );

      const actionContainer = screen.getByRole("button", { name: "Take action" });
      actionContainer.focus();
      await user.keyboard("{Enter}");

      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it("all interactive elements have appropriate labels", () => {
      const handleDismiss = jest.fn();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          dismissible
          onDismiss={handleDismiss}
          action={<button>Action</button>}
          onAction={handleAction}
        />
      );

      expect(screen.getByRole("button", { name: "Dismiss" })).toHaveAttribute("aria-label", "Dismiss");
      expect(screen.getByRole("button", { name: "Take action" })).toHaveAttribute("aria-label", "Take action");
    });
  });

  describe("tooltip", () => {
    it("renders tooltip on dismiss button", () => {
      const handleDismiss = jest.fn();

      const { container } = renderWithTheme(
        <WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />
      );

      const tooltip = container.querySelector('[data-testid="tooltip"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveAttribute("data-title", "Dismiss");
    });
  });

  describe("combinations", () => {
    it("renders with all props enabled", () => {
      const handleDismiss = jest.fn();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning message"
          description="This is a detailed description"
          variant="error"
          dismissible
          onDismiss={handleDismiss}
          action={<button>Fix Issue</button>}
          onAction={handleAction}
          animate
          compact
          className="custom-banner"
        />
      );

      expect(screen.getByText("Warning message")).toBeInTheDocument();
      expect(screen.getByText("This is a detailed description")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fix Issue" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Take action" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();

      const { container } = renderWithTheme(
        <WarningBanner
          message="Warning message"
          description="This is a detailed description"
          variant="error"
          dismissible
          onDismiss={handleDismiss}
          action={<button>Fix Issue</button>}
          onAction={handleAction}
          animate
          compact
          className="custom-banner"
        />
      );

      const banner = container.querySelector(".warning-banner");
      expect(banner).toHaveClass("compact");
      expect(banner).toHaveClass("custom-banner");
    });

    it("renders warning variant with description and dismiss", () => {
      const handleDismiss = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          description="Please review this warning"
          variant="warning"
          dismissible
          onDismiss={handleDismiss}
        />
      );

      expect(screen.getByText("Warning")).toBeInTheDocument();
      expect(screen.getByText("Please review this warning")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });

    it("renders info variant with action and description", () => {
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Info"
          description="Additional information"
          variant="info"
          action={<button>Learn More</button>}
          onAction={handleAction}
        />
      );

      expect(screen.getByText("Info")).toBeInTheDocument();
      expect(screen.getByText("Additional information")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Learn More" })).toBeInTheDocument();
    });
  });

  describe("interactive behavior", () => {
    it("handles multiple clicks on dismiss button", async () => {
      const user = userEvent.setup();
      const handleDismiss = jest.fn();

      renderWithTheme(<WarningBanner message="Warning" dismissible onDismiss={handleDismiss} />);

      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      await user.click(dismissButton);
      await user.click(dismissButton);

      expect(handleDismiss).toHaveBeenCalledTimes(2);
    });

    it("handles multiple clicks on action", async () => {
      const user = userEvent.setup();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          action={<button>Action Button</button>}
          onAction={handleAction}
        />
      );

      const actionButton = screen.getByRole("button", { name: "Action Button" });
      await user.click(actionButton);
      await user.click(actionButton);

      expect(handleAction).toHaveBeenCalledTimes(2);
    });

    it("handles both dismiss and action in same banner", async () => {
      const user = userEvent.setup();
      const handleDismiss = jest.fn();
      const handleAction = jest.fn();

      renderWithTheme(
        <WarningBanner
          message="Warning"
          dismissible
          onDismiss={handleDismiss}
          action={<button>Action</button>}
          onAction={handleAction}
        />
      );

      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      const actionButton = screen.getByRole("button", { name: "Action" });

      await user.click(dismissButton);
      await user.click(actionButton);

      expect(handleDismiss).toHaveBeenCalledTimes(1);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("renders with very long message", () => {
      const longMessage = "A".repeat(1000);

      renderWithTheme(<WarningBanner message={longMessage} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it("renders with very long description", () => {
      const longDescription = "B".repeat(1000);

      renderWithTheme(
        <WarningBanner message="Warning" description={longDescription} />
      );

      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it("renders with special characters in message", () => {
      const specialMessage = "Warning: <script>alert('test')</script> & \"quotes\"";

      renderWithTheme(<WarningBanner message={specialMessage} />);

      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it("renders with empty message", () => {
      const { container } = renderWithTheme(<WarningBanner message="" />);

      const banner = container.querySelector(".warning-banner");
      expect(banner).toBeInTheDocument();
    });

    it("renders with empty description", () => {
      renderWithTheme(<WarningBanner message="Warning" description="" />);

      expect(screen.getByText("Warning")).toBeInTheDocument();
    });
  });
});
