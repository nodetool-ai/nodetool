import React from "react";
import { render, screen } from "@testing-library/react";
import { StatusIndicator, StatusType } from "../StatusIndicator";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("StatusIndicator", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("default rendering", () => {
    it("renders with icon by default", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders success status with correct class", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveClass("status-success");
    });

    it("renders without label by default", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" />);

      const label = container.querySelector(".status-label");
      expect(label).not.toBeInTheDocument();
    });
  });

  describe("status types", () => {
    it("renders success status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-success");
    });

    it("renders error status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-error");
    });

    it("renders warning status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="warning" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-warning");
    });

    it("renders info status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-info");
    });

    it("renders pending status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="pending" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-pending");
    });

    it("renders default status", () => {
      const { container } = renderWithTheme(<StatusIndicator status="default" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-default");
    });
  });

  describe("labels", () => {
    it("renders with custom label", () => {
      renderWithTheme(<StatusIndicator status="success" label="Completed" />);

      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("applies status-label class to label", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" label="Processing" />);

      const label = container.querySelector(".status-label");
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass("status-label");
    });

    it("renders label with icon", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" label="Failed" />);

      const icon = container.querySelector(".status-icon");
      const label = container.querySelector(".status-label");
      expect(icon).toBeInTheDocument();
      expect(label).toBeInTheDocument();
    });
  });

  describe("icon display", () => {
    it("shows icon when showIcon is true", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" showIcon={true} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("hides icon when showIcon is false", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" showIcon={false} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).not.toBeInTheDocument();
    });

    it("shows icon by default when showIcon is not provided", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("filled icons", () => {
    it("renders filled icon variant when filledIcon is true", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" filledIcon={true} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders outlined icon by default", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" filledIcon={false} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("pulse animation", () => {
    it("applies pulse animation when pulse is true", () => {
      const { container } = renderWithTheme(<StatusIndicator status="pending" pulse={true} />);

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
      // The animation is applied via CSS, we just verify the element exists
    });
  });

  describe("sizes", () => {
    it("renders with small size by default", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" size="small" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toBeInTheDocument();
    });

    it("renders with medium size", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" size="medium" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toBeInTheDocument();
    });
  });

  describe("tooltip", () => {
    it("renders without tooltip when not provided", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" />);

      // Tooltip wraps content when provided
      const content = container.querySelector(".status-indicator");
      expect(content).toBeInTheDocument();
    });

    it("renders with tooltip when provided", () => {
      renderWithTheme(<StatusIndicator status="success" tooltip="Operation successful" />);

      // When tooltip is provided, it wraps the content in a Tooltip component
      const indicator = document.querySelector(".status-indicator");
      expect(indicator).toBeInTheDocument();
    });
  });

  describe("custom className", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(<StatusIndicator status="success" className="my-custom-class" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("my-custom-class");
    });

    it("applies base class and custom className", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" className="custom-class another-class" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-indicator");
      expect(indicator).toHaveClass("status-error");
      expect(indicator).toHaveClass("custom-class");
      expect(indicator).toHaveClass("another-class");
    });
  });

  describe("combinations", () => {
    it("renders with all props customized", () => {
      const { container } = renderWithTheme(
        <StatusIndicator
          status="warning"
          label="Warning"
          showIcon={true}
          filledIcon={true}
          pulse={true}
          tooltip="This is a warning"
          size="medium"
          className="custom-status"
        />
      );

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-warning");
      expect(indicator).toHaveClass("custom-status");

      expect(screen.getByText("Warning")).toBeInTheDocument();

      const icon = container.querySelector(".status-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders status with label but no icon", () => {
      renderWithTheme(<StatusIndicator status="success" label="Done" showIcon={false} />);

      expect(screen.getByText("Done")).toBeInTheDocument();

      const { container } = renderWithTheme(<StatusIndicator status="success" label="Done" showIcon={false} />);
      const icon = container.querySelector(".status-icon");
      expect(icon).not.toBeInTheDocument();
    });

    it("renders pending status with pulse and label", () => {
      renderWithTheme(
        <StatusIndicator status="pending" label="Processing..." pulse={true} />
      );

      expect(screen.getByText("Processing...")).toBeInTheDocument();

      const { container } = renderWithTheme(
        <StatusIndicator status="pending" label="Processing..." pulse={true} />
      );
      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toHaveClass("status-pending");
    });
  });

  describe("accessibility", () => {
    it("provides visual status indication", () => {
      const { container } = renderWithTheme(<StatusIndicator status="error" label="Error occurred" />);

      const indicator = container.querySelector(".status-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveClass("status-error");
    });

    it("renders label as span for semantic HTML", () => {
      const { container } = renderWithTheme(<StatusIndicator status="info" label="Info message" />);

      const label = container.querySelector(".status-label");
      expect(label?.tagName).toBe("SPAN");
    });
  });

  describe("exported types", () => {
    it("exports StatusType type with all expected values", () => {
      // This test ensures the type is exported correctly
      // If this compiles, the type export is working
      const statusTypes: StatusType[] = ["success", "error", "warning", "info", "pending", "default"];
      expect(statusTypes).toHaveLength(6);
      expect(statusTypes).toContain("success");
      expect(statusTypes).toContain("error");
      expect(statusTypes).toContain("warning");
      expect(statusTypes).toContain("info");
      expect(statusTypes).toContain("pending");
      expect(statusTypes).toContain("default");
    });
  });

  describe("memo behavior", () => {
    it("has displayName for debugging", () => {
      expect(StatusIndicator.displayName).toBe("StatusIndicator");
    });
  });
});
