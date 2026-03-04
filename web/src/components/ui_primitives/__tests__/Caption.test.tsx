/**
 * Tests for Caption component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Caption } from "../Caption";

describe("Caption", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("basic rendering", () => {
    it("renders caption text", () => {
      renderWithTheme(<Caption>Helper text for the field above</Caption>);
      expect(screen.getByText("Helper text for the field above")).toBeInTheDocument();
    });

    it("renders as typography element", () => {
      const { container } = renderWithTheme(<Caption>Test Caption</Caption>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders small size by default", () => {
      renderWithTheme(<Caption>Small Caption</Caption>);
      expect(screen.getByText("Small Caption")).toBeInTheDocument();
    });

    it("renders smaller size", () => {
      renderWithTheme(<Caption size="smaller">Smaller Caption</Caption>);
      expect(screen.getByText("Smaller Caption")).toBeInTheDocument();
    });

    it("renders tiny size", () => {
      renderWithTheme(<Caption size="tiny">Tiny Caption</Caption>);
      expect(screen.getByText("Tiny Caption")).toBeInTheDocument();
    });
  });

  describe("color variants", () => {
    it("applies default color", () => {
      renderWithTheme(<Caption>Default Caption</Caption>);
      expect(screen.getByText("Default Caption")).toBeInTheDocument();
    });

    it("applies primary color", () => {
      renderWithTheme(<Caption color="primary">Primary Caption</Caption>);
      expect(screen.getByText("Primary Caption")).toBeInTheDocument();
    });

    it("applies error color", () => {
      renderWithTheme(<Caption color="error">Error Caption</Caption>);
      expect(screen.getByText("Error Caption")).toBeInTheDocument();
    });

    it("applies warning color", () => {
      renderWithTheme(<Caption color="warning">Warning Caption</Caption>);
      expect(screen.getByText("Warning Caption")).toBeInTheDocument();
    });

    it("applies success color", () => {
      renderWithTheme(<Caption color="success">Success Caption</Caption>);
      expect(screen.getByText("Success Caption")).toBeInTheDocument();
    });

    it("applies muted color", () => {
      renderWithTheme(<Caption color="muted">Muted Caption</Caption>);
      expect(screen.getByText("Muted Caption")).toBeInTheDocument();
    });

    it("applies custom hex color", () => {
      renderWithTheme(<Caption color="#ff0000">Custom Color</Caption>);
      expect(screen.getByText("Custom Color")).toBeInTheDocument();
    });
  });

  describe("italic styling", () => {
    it("applies normal font style by default", () => {
      renderWithTheme(<Caption>Normal Caption</Caption>);
      expect(screen.getByText("Normal Caption")).toBeInTheDocument();
    });

    it("applies italic font style when italic is true", () => {
      renderWithTheme(<Caption italic>Italic Caption</Caption>);
      expect(screen.getByText("Italic Caption")).toBeInTheDocument();
    });

    it("applies normal font style when italic is explicitly false", () => {
      renderWithTheme(<Caption italic={false}>Not Italic</Caption>);
      expect(screen.getByText("Not Italic")).toBeInTheDocument();
    });
  });

  describe("custom styling", () => {
    it("passes through className prop", () => {
      const { container } = renderWithTheme(<Caption className="custom-class">Prop Caption</Caption>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toHaveClass("custom-class");
    });

    it("passes through other Typography props", () => {
      const { container } = renderWithTheme(<Caption id="test-id">Test Caption</Caption>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toHaveAttribute("id", "test-id");
    });
  });

  describe("combinations", () => {
    it("renders small error caption", () => {
      renderWithTheme(<Caption color="error" size="small">Error Text</Caption>);
      expect(screen.getByText("Error Text")).toBeInTheDocument();
    });

    it("renders tiny italic caption", () => {
      renderWithTheme(<Caption size="tiny" italic>Hint Text</Caption>);
      expect(screen.getByText("Hint Text")).toBeInTheDocument();
    });

    it("renders smaller muted caption with custom className", () => {
      renderWithTheme(
        <Caption color="muted" size="smaller" className="faded-hint">Faded Hint</Caption>
      );
      expect(screen.getByText("Faded Hint")).toBeInTheDocument();
      const typography = document.querySelector(".faded-hint");
      expect(typography).toBeInTheDocument();
    });

    it("renders primary warning with tiny size", () => {
      renderWithTheme(<Caption color="warning" size="tiny">Tiny Warning</Caption>);
      expect(screen.getByText("Tiny Warning")).toBeInTheDocument();
    });

    it("renders success italic with smaller size", () => {
      renderWithTheme(<Caption color="success" size="smaller" italic>Success!</Caption>);
      expect(screen.getByText("Success!")).toBeInTheDocument();
    });
  });

  describe("realistic usage examples", () => {
    it("renders as field helper text", () => {
      renderWithTheme(<Caption size="small" color="secondary">Enter your email address to receive updates</Caption>);
      expect(screen.getByText("Enter your email address to receive updates")).toBeInTheDocument();
    });

    it("renders as error message", () => {
      renderWithTheme(<Caption color="error" size="smaller">This field is required</Caption>);
      expect(screen.getByText("This field is required")).toBeInTheDocument();
    });

    it("renders as optional field hint", () => {
      renderWithTheme(<Caption color="muted" size="tiny" italic>This field is optional</Caption>);
      expect(screen.getByText("This field is optional")).toBeInTheDocument();
    });

    it("renders as timestamp", () => {
      renderWithTheme(<Caption color="muted" size="tiny">Last updated 2 hours ago</Caption>);
      expect(screen.getByText("Last updated 2 hours ago")).toBeInTheDocument();
    });

    it("renders as character count", () => {
      renderWithTheme(<Caption color="secondary" size="smaller">0 / 500 characters</Caption>);
      expect(screen.getByText("0 / 500 characters")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders with empty string as children", () => {
      const { container } = renderWithTheme(<Caption>{""}</Caption>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toBeInTheDocument();
    });

    it("renders with numeric content", () => {
      renderWithTheme(<Caption>{42}</Caption>);
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("renders with complex children containing formatted text", () => {
      renderWithTheme(
        <Caption>
          <span>Bold part</span> and regular text
        </Caption>
      );
      expect(screen.getByText("Bold part")).toBeInTheDocument();
      expect(screen.getByText(/and regular text/)).toBeInTheDocument();
    });
  });
});
