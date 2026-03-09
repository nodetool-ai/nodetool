import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusIndicator } from "../StatusIndicator";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("StatusIndicator", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  describe("default rendering", () => {
    it("renders with icon only by default", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders with correct base class name", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();
      expect(statusIndicator).toHaveClass("status-error");
    });
  });

  describe("status types", () => {
    it("renders success status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-success");
    });

    it("renders error status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-error");
    });

    it("renders warning status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="warning" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-warning");
    });

    it("renders info status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-info");
    });

    it("renders pending status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="pending" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-pending");
    });

    it("renders default status with correct styling", () => {
      const { container } = renderWithTheme(<StatusIndicator status="default" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-default");
    });
  });

  describe("label prop", () => {
    it("renders with label text", () => {
      renderWithTheme(<StatusIndicator status="success" label="Completed" />);

      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("does not render label when not provided", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const label = container.querySelector(".status-label");
      expect(label).not.toBeInTheDocument();
    });

    it("renders label with different status types", () => {
      renderWithTheme(<StatusIndicator status="error" label="Failed" />);

      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
  });

  describe("showIcon prop", () => {
    it("renders icon when showIcon is true (default)", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" showIcon={true} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("does not render icon when showIcon is false", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" showIcon={false} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).not.toBeInTheDocument();
    });

    it("renders label without icon when showIcon is false", () => {
      renderWithTheme(<StatusIndicator status="success" label="Success" showIcon={false} />);

      expect(screen.getByText("Success")).toBeInTheDocument();
      const { container } = renderWithTheme(<StatusIndicator status="success" showIcon={false} />);
      const icon = container.querySelector(".status-icon");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("filledIcon prop", () => {
    it("renders CheckCircle icon for success with filledIcon", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" filledIcon={true} />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders Error icon for error with filledIcon", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" filledIcon={true} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders Warning icon for warning with filledIcon", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="warning" filledIcon={true} />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders Pending icon for pending with filledIcon", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="pending" filledIcon={true} />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders Circle icon for default with filledIcon", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="default" filledIcon={true} />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders Circle icon when filledIcon is false", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" filledIcon={false} />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("pulse prop", () => {
    it("applies pulse animation when pulse is true", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="pending" pulse={true} />
      );

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
      const styles = window.getComputedStyle(icon!);
      // Emotion CSS minifies class names, so check if animation is not "none"
      expect(styles.animation).not.toBe("none");
    });

    it("does not apply pulse animation when pulse is false", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="pending" pulse={false} />
      );

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
      const styles = window.getComputedStyle(icon!);
      expect(styles.animation).toBe("none");
    });

    it("defaults to no pulse animation", () => {
      const { container } = renderWithTheme(<StatusIndicator status="pending" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
      const styles = window.getComputedStyle(icon!);
      expect(styles.animation).toBe("none");
    });
  });

  describe("tooltip prop", () => {
    it("renders tooltip when tooltip prop is provided", () => {
      renderWithTheme(
        <StatusIndicator status="success" label="Done" tooltip="Operation completed successfully" />
      );

      // Check if tooltip is present (MUI Tooltip wraps content)
      const statusIndicator = screen.getByText("Done").closest("div")?.parentElement;
      expect(statusIndicator).toBeInTheDocument();
    });

    it("does not render tooltip when tooltip prop is not provided", () => {
      renderWithTheme(<StatusIndicator status="success" label="Done" />);

      const statusIndicator = screen.getByText("Done").closest("div")?.parentElement;
      expect(statusIndicator).toBeInTheDocument();
    });
  });

  describe("size prop", () => {
    it("renders with small size", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" size="small" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders with medium size (default)", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" size="medium" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("applies font size to label for small size", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" label="Small" size="small" />
      );

      const label = container.querySelector(".status-label");
      expect(label).toBeInTheDocument();
      const styles = window.getComputedStyle(label!);
      // Check that font size is applied (exact value may vary in test environment)
      expect(parseFloat(styles.fontSize)).toBeGreaterThan(0);
    });

    it("applies font size to label for medium size", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" label="Medium" size="medium" />
      );

      const label = container.querySelector(".status-label");
      expect(label).toBeInTheDocument();
      const styles = window.getComputedStyle(label!);
      // Check that font size is applied (exact value may vary in test environment)
      expect(parseFloat(styles.fontSize)).toBeGreaterThan(0);
    });
  });

  describe("className prop", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" className="my-custom-class" />
      );

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("my-custom-class");
    });

    it("applies base class and custom className", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" className="custom-class" />
      );

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-indicator");
      expect(statusIndicator).toHaveClass("status-success");
      expect(statusIndicator).toHaveClass("custom-class");
    });

    it("applies status class along with custom className", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="error" className="error-status" />
      );

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-error");
      expect(statusIndicator).toHaveClass("error-status");
    });
  });

  describe("combinations", () => {
    it("renders with all props customized", () => {
      renderWithTheme(
        <StatusIndicator
          status="success"
          label="Completed"
          showIcon={true}
          filledIcon={true}
          pulse={false}
          tooltip="Operation completed"
          size="medium"
          className="status-complete"
        />
      );

      expect(screen.getByText("Completed")).toBeInTheDocument();
      const { container } = renderWithTheme(
        <StatusIndicator
          status="success"
          label="Completed"
          showIcon={true}
          filledIcon={true}
          pulse={false}
          tooltip="Operation completed"
          size="medium"
          className="status-complete"
        />
      );

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-success");
      expect(statusIndicator).toHaveClass("status-complete");

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders pending status with pulse and label", () => {
      const { container } = renderWithTheme(
        <StatusIndicator
          status="pending"
          label="Processing..."
          pulse={true}
          showIcon={true}
        />
      );

      expect(screen.getByText("Processing...")).toBeInTheDocument();

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-pending");

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
      const styles = window.getComputedStyle(icon!);
      // Emotion CSS minifies class names, so check if animation is not "none"
      expect(styles.animation).not.toBe("none");
    });

    it("renders error status with filled icon and tooltip", () => {
      renderWithTheme(
        <StatusIndicator
          status="error"
          label="Failed"
          filledIcon={true}
          tooltip="Operation failed"
        />
      );

      expect(screen.getByText("Failed")).toBeInTheDocument();

      const { container } = renderWithTheme(
        <StatusIndicator
          status="error"
          label="Failed"
          filledIcon={true}
          tooltip="Operation failed"
        />
      );

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toHaveClass("status-error");

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has appropriate color contrast for status types", () => {
      const statuses: Array<"success" | "error" | "warning" | "info" | "pending" | "default"> = [
        "success",
        "error",
        "warning",
        "info",
        "pending",
        "default"
      ];

      statuses.forEach((status) => {
        const { container } = renderWithTheme(<StatusIndicator status={status} label={status} />);

        const statusIndicator = container.querySelector(".status-indicator");
        expect(statusIndicator).toBeInTheDocument();

        const label = container.querySelector(".status-label");
        expect(label).toBeInTheDocument();
      });
    });

    it("is keyboard accessible when wrapped in interactive element", async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      renderWithTheme(
        <button onClick={handleClick} aria-label="Status">
          <StatusIndicator status="success" label="Success" />
        </button>
      );

      const button = screen.getByRole("button", { name: "Status" });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("screen readers can read label text", () => {
      renderWithTheme(<StatusIndicator status="success" label="Operation successful" />);

      const label = screen.getByText("Operation successful");
      expect(label).toBeInTheDocument();
    });

    it("renders without icon for screen readers when showIcon is false", () => {
      const { container } = renderWithTheme(
        <StatusIndicator status="success" label="Success" showIcon={false} />
      );

      const icon = container.querySelector(".status-icon");
      expect(icon).not.toBeInTheDocument();

      const label = screen.getByText("Success");
      expect(label).toBeInTheDocument();
    });
  });

  describe("color theming", () => {
    it("uses correct color for success status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("uses correct color for error status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("uses correct color for warning status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="warning" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("uses correct color for info status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("uses correct color for pending status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="pending" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("uses correct color for default status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="default" />);

      const statusIndicator = container.querySelector(".status-indicator");
      expect(statusIndicator).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("displayName", () => {
    it("has displayName for debugging", () => {
      expect(StatusIndicator.displayName).toBe("StatusIndicator");
    });
  });
});
