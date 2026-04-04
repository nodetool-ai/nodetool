import React, { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertBanner } from "../AlertBanner";

describe("AlertBanner", () => {
  describe("renders all severity types", () => {
    const severities = ["error", "warning", "info", "success"] as const;

    severities.forEach((severity) => {
      it(`renders severity: ${severity}`, () => {
        render(<AlertBanner severity={severity}>Message</AlertBanner>);
        const alert = screen.getByRole("alert");
        expect(alert).toBeInTheDocument();
        // Default variant is "standard"
        const capitalizedSeverity =
          severity.charAt(0).toUpperCase() + severity.slice(1);
        expect(alert).toHaveClass(`MuiAlert-standard${capitalizedSeverity}`);
      });
    });
  });

  describe("renders with title", () => {
    it("displays title when provided", () => {
      render(
        <AlertBanner severity="info" title="Important">
          Message content
        </AlertBanner>
      );
      expect(screen.getByText("Important")).toBeInTheDocument();
    });

    it("does not display title when not provided", () => {
      render(<AlertBanner severity="info">Message content</AlertBanner>);
      // Check that no title element exists
      const titles = document.querySelectorAll(".MuiAlertTitle-root");
      expect(titles).toHaveLength(0);
    });
  });

  describe("renders children", () => {
    it("displays message content", () => {
      render(
        <AlertBanner severity="info">This is an info message</AlertBanner>
      );
      expect(screen.getByText("This is an info message")).toBeInTheDocument();
    });

    it("renders complex children", () => {
      render(
        <AlertBanner severity="warning">
          <span data-testid="custom-content">Custom content</span>
        </AlertBanner>
      );
      expect(screen.getByTestId("custom-content")).toBeInTheDocument();
    });
  });

  describe("variant prop", () => {
    it("renders standard variant by default", () => {
      render(<AlertBanner severity="info">Message</AlertBanner>);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-standard");
    });

    it("renders filled variant when specified", () => {
      render(
        <AlertBanner severity="info" variant="filled">
          Message
        </AlertBanner>
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-filled");
    });

    it("renders outlined variant when specified", () => {
      render(
        <AlertBanner severity="info" variant="outlined">
          Message
        </AlertBanner>
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-outlined");
    });
  });

  describe("compact mode", () => {
    it("applies different styling when compact is true", () => {
      const { container: compactContainer } = render(
        <AlertBanner severity="info" compact>
          Message
        </AlertBanner>
      );
      const { container: normalContainer } = render(
        <AlertBanner severity="info">Message</AlertBanner>
      );
      const compactAlert = compactContainer.querySelector('[role="alert"]');
      const normalAlert = normalContainer.querySelector('[role="alert"]');
      // compact prop adds reduced padding via sx, generating different emotion CSS classes
      expect(compactAlert?.className).not.toEqual(normalAlert?.className);
    });

    it("applies same styling when compact is false as when omitted", () => {
      const { container: noCompactContainer } = render(
        <AlertBanner severity="info" compact={false}>
          Message
        </AlertBanner>
      );
      const { container: defaultContainer } = render(
        <AlertBanner severity="info">Message</AlertBanner>
      );
      const noCompactAlert = noCompactContainer.querySelector('[role="alert"]');
      const defaultAlert = defaultContainer.querySelector('[role="alert"]');
      // compact=false (default) should produce identical classes to omitting the prop
      expect(noCompactAlert?.className).toEqual(defaultAlert?.className);
    });
  });

  describe("dismissible alerts", () => {
    it("renders close button when onClose is provided", () => {
      const handleClose = jest.fn();
      render(
        <AlertBanner severity="info" onClose={handleClose}>
          Message
        </AlertBanner>
      );
      const closeButton = screen.getByRole("button", { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });

    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(
        <AlertBanner severity="info" onClose={handleClose}>
          Message
        </AlertBanner>
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not render close button when onClose is not provided", () => {
      render(<AlertBanner severity="info">Message</AlertBanner>);
      const closeButton = screen.queryByRole("button", { name: /close/i });
      expect(closeButton).not.toBeInTheDocument();
    });
  });

  describe("custom styling via sx prop", () => {
    it("applies custom styles from sx prop", () => {
      const { container: withSxContainer } = render(
        <AlertBanner severity="info" sx={{ marginTop: "16px" }}>
          Message
        </AlertBanner>
      );
      const { container: withoutSxContainer } = render(
        <AlertBanner severity="info">Message</AlertBanner>
      );
      const withSxAlert = withSxContainer.querySelector('[role="alert"]');
      const withoutSxAlert = withoutSxContainer.querySelector('[role="alert"]');
      // sx prop is merged into the Alert's sx, generating different emotion CSS classes
      expect(withSxAlert?.className).not.toEqual(withoutSxAlert?.className);
    });
  });

  describe("forwardRef support", () => {
    it("forwards ref to underlying Alert component", () => {
      const ref = createRef<HTMLDivElement>();
      render(
        <AlertBanner severity="info" ref={ref}>
          Message
        </AlertBanner>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has proper role attribute", () => {
      render(<AlertBanner severity="info">Message</AlertBanner>);
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });

    it("announces title and content to screen readers", () => {
      render(
        <AlertBanner severity="error" title="Error occurred">
          Something went wrong
        </AlertBanner>
      );
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("Error occurred")).toBeInTheDocument();
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });

  describe("component props forwarding", () => {
    it("forwards additional props to MUI Alert", () => {
      render(
        <AlertBanner severity="success" data-testid="custom-alert">
          Message
        </AlertBanner>
      );
      expect(screen.getByTestId("custom-alert")).toBeInTheDocument();
    });
  });

  describe("displayName", () => {
    it("has displayName for debugging", () => {
      expect(AlertBanner.displayName).toBe("AlertBanner");
    });
  });
});
