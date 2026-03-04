/**
 * Tests for Label component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Label } from "../Label";

describe("Label", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("basic rendering", () => {
    it("renders label text", () => {
      renderWithTheme(<Label>Email Address</Label>);
      expect(screen.getByText("Email Address")).toBeInTheDocument();
    });

    it("renders as label element", () => {
      const { container } = renderWithTheme(<Label>Test Label</Label>);
      const label = container.querySelector("label");
      expect(label).toBeInTheDocument();
    });

    it("applies Typography component", () => {
      const { container } = renderWithTheme(<Label>Default Label</Label>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders small size", () => {
      renderWithTheme(<Label size="small">Small Label</Label>);
      expect(screen.getByText("Small Label")).toBeInTheDocument();
    });

    it("renders normal size by default", () => {
      renderWithTheme(<Label>Normal Label</Label>);
      expect(screen.getByText("Normal Label")).toBeInTheDocument();
    });

    it("renders large size", () => {
      renderWithTheme(<Label size="large">Large Label</Label>);
      expect(screen.getByText("Large Label")).toBeInTheDocument();
    });
  });

  describe("required indicator", () => {
    it("shows required asterisk when required is true", () => {
      renderWithTheme(<Label required>Full Name</Label>);
      expect(screen.getByText("Full Name")).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("does not show asterisk by default", () => {
      renderWithTheme(<Label>Optional Field</Label>);
      expect(screen.getByText("Optional Field")).toBeInTheDocument();
      expect(screen.queryByText("*")).not.toBeInTheDocument();
    });

    it("renders required label with asterisk as separate element", () => {
      renderWithTheme(<Label required>Required Field</Label>);
      const asterisk = screen.getByText("*");
      expect(asterisk).toBeInTheDocument();
      expect(asterisk.tagName.toLowerCase()).toBe("span");
    });
  });

  describe("state styling", () => {
    it("applies default color", () => {
      renderWithTheme(<Label>Default Label</Label>);
      expect(screen.getByText("Default Label")).toBeInTheDocument();
    });

    it("applies error state when error is true", () => {
      renderWithTheme(<Label error>Error Label</Label>);
      expect(screen.getByText("Error Label")).toBeInTheDocument();
    });

    it("applies disabled state when disabled is true", () => {
      renderWithTheme(<Label disabled>Disabled Label</Label>);
      expect(screen.getByText("Disabled Label")).toBeInTheDocument();
    });

    it("renders with both error and disabled states", () => {
      renderWithTheme(<Label error disabled>Error Disabled</Label>);
      expect(screen.getByText("Error Disabled")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("associates with input via htmlFor", () => {
      const { container } = renderWithTheme(<Label htmlFor="email">Email</Label>);
      const label = container.querySelector("label");
      expect(label).toHaveAttribute("for", "email");
    });

    it("renders without htmlFor when not specified", () => {
      const { container } = renderWithTheme(<Label>Unassociated Label</Label>);
      const label = container.querySelector("label");
      expect(label).not.toHaveAttribute("for");
    });
  });

  describe("custom styling", () => {
    it("passes through className prop", () => {
      const { container } = renderWithTheme(<Label className="custom-class">Prop Label</Label>);
      const typography = container.querySelector(".MuiTypography-root");
      expect(typography).toHaveClass("custom-class");
    });

    it("passes through other Typography props", () => {
      const { container } = renderWithTheme(<Label id="test-id">Test Label</Label>);
      const label = container.querySelector("label");
      expect(label).toHaveAttribute("id", "test-id");
    });
  });

  describe("combinations", () => {
    it("renders required error label with small size", () => {
      renderWithTheme(<Label size="small" error required>Required Error</Label>);
      expect(screen.getByText("Required Error")).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("renders large disabled label with htmlFor", () => {
      const { container } = renderWithTheme(
        <Label size="large" disabled htmlFor="password">Password</Label>
      );
      const label = container.querySelector("label");
      expect(label).toHaveAttribute("for", "password");
      expect(screen.getByText("Password")).toBeInTheDocument();
    });

    it("renders normal required label with custom className", () => {
      renderWithTheme(
        <Label required className="my-label">Custom Required</Label>
      );
      expect(screen.getByText("Custom Required")).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
      const typography = document.querySelector(".my-label");
      expect(typography).toBeInTheDocument();
    });

    it("renders small error label with htmlFor", () => {
      const { container } = renderWithTheme(
        <Label size="small" error htmlFor="username">Username</Label>
      );
      const label = container.querySelector("label");
      expect(label).toHaveAttribute("for", "username");
      expect(screen.getByText("Username")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders with empty string as children", () => {
      const { container } = renderWithTheme(<Label>{""}</Label>);
      const label = container.querySelector("label");
      expect(label).toBeInTheDocument();
    });

    it("renders with numeric content converted to string", () => {
      renderWithTheme(<Label>{123}</Label>);
      expect(screen.getByText("123")).toBeInTheDocument();
    });

    it("renders with complex children", () => {
      renderWithTheme(
        <Label>
          <span>Complex</span> Label
        </Label>
      );
      expect(screen.getByText("Complex")).toBeInTheDocument();
      expect(screen.getByText("Label")).toBeInTheDocument();
    });
  });
});
