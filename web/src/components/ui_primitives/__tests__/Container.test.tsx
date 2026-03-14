import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { Container } from "../Container";
import mockTheme from "../../../__mocks__/themeMock";

describe("Container", () => {
  const renderContainer = (props = {}) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <Container {...props}>
          <div data-testid="test-content">Test Content</div>
        </Container>
      </ThemeProvider>
    );
  };

  describe("Basic Rendering", () => {
    it("renders with default props", () => {
      renderContainer();
      expect(screen.getByTestId("test-content")).toBeInTheDocument();
    });

    it("renders with normal padding by default", () => {
      const { container } = renderContainer();
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "16px" });
    });

    it("renders children correctly", () => {
      renderContainer();
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });
  });

  describe("Padding Variants", () => {
    it("renders with none padding", () => {
      const { container } = renderContainer({ padding: "none" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "0px" });
    });

    it("renders with compact padding", () => {
      const { container } = renderContainer({ padding: "compact" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "8px" });
    });

    it("renders with normal padding", () => {
      const { container } = renderContainer({ padding: "normal" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "16px" });
    });

    it("renders with comfortable padding", () => {
      const { container } = renderContainer({ padding: "comfortable" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "24px" });
    });

    it("renders with spacious padding", () => {
      const { container } = renderContainer({ padding: "spacious" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "32px" });
    });

    it("renders with custom number padding", () => {
      const { container } = renderContainer({ padding: 3 });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "24px" });
    });
  });

  describe("Scrollable", () => {
    it("does not set overflow when scrollable is false", () => {
      const { container } = renderContainer({ scrollable: false });
      const box = container.firstChild as HTMLElement;
      expect(box).not.toHaveStyle({ overflow: "auto" });
    });

    it("sets overflow auto when scrollable is true", () => {
      const { container } = renderContainer({ scrollable: true });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ overflow: "auto" });
    });
  });

  describe("Max Width", () => {
    it("does not set maxWidth when not provided", () => {
      const { container } = renderContainer();
      const box = container.firstChild as HTMLElement;
      expect(box.style.maxWidth).toBe("");
    });

    it("sets maxWidth with string value", () => {
      const { container } = renderContainer({ maxWidth: "800px" });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ maxWidth: "800px" });
    });

    it("sets maxWidth with number value", () => {
      const { container } = renderContainer({ maxWidth: 800 });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ maxWidth: "800px" });
    });
  });

  describe("Centered", () => {
    it("does not center when centered is false", () => {
      const { container } = renderContainer({ centered: false });
      const box = container.firstChild as HTMLElement;
      expect(box).not.toHaveStyle({ margin: "0 auto" });
    });

    it("centers horizontally when centered is true", () => {
      const { container } = renderContainer({ centered: true });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ margin: "0 auto" });
    });
  });

  describe("Custom Styles", () => {
    it("applies custom sx styles", () => {
      const { container } = renderContainer({
        sx: { backgroundColor: "red" }
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ backgroundColor: "red" });
    });

    it("merges custom sx with default styles", () => {
      const { container } = renderContainer({
        padding: "spacious",
        sx: { backgroundColor: "red" }
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "32px" });
      expect(box).toHaveStyle({ backgroundColor: "red" });
    });

    it("passes through other Box props", () => {
      const { container } = renderContainer({
        "data-testid": "custom-container"
      });
      expect(container.firstChild).toHaveAttribute("data-testid", "custom-container");
    });

    it("applies custom className", () => {
      const { container } = renderContainer({
        className: "custom-class"
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveClass("custom-class");
    });
  });

  describe("Complex Combinations", () => {
    it("handles scrollable with custom maxWidth", () => {
      const { container } = renderContainer({
        scrollable: true,
        maxWidth: 600
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ overflow: "auto" });
      expect(box).toHaveStyle({ maxWidth: "600px" });
    });

    it("handles centered with maxWidth", () => {
      const { container } = renderContainer({
        centered: true,
        maxWidth: 800
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ margin: "0 auto" });
      expect(box).toHaveStyle({ maxWidth: "800px" });
    });

    it("handles all props combined", () => {
      const { container } = renderContainer({
        padding: "comfortable",
        scrollable: true,
        maxWidth: 1000,
        centered: true
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveStyle({ padding: "24px" });
      expect(box).toHaveStyle({ overflow: "auto" });
      expect(box).toHaveStyle({ maxWidth: "1000px" });
      expect(box).toHaveStyle({ margin: "0 auto" });
    });
  });

  describe("Edge Cases", () => {
    it("renders with empty children", () => {
      const { container } = renderContainer({ children: undefined });
      const box = container.firstChild as HTMLElement;
      expect(box).toBeInTheDocument();
    });

    it("renders with multiple children", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <Container>
            <div data-testid="child1">Child 1</div>
            <div data-testid="child2">Child 2</div>
            <div data-testid="child3">Child 3</div>
          </Container>
        </ThemeProvider>
      );
      expect(screen.getByTestId("child1")).toBeInTheDocument();
      expect(screen.getByTestId("child2")).toBeInTheDocument();
      expect(screen.getByTestId("child3")).toBeInTheDocument();
    });

    it("renders with nested containers", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <Container padding="compact" data-testid="outer">
            <Container padding="spacious" data-testid="inner">
              <div data-testid="nested-content">Nested Content</div>
            </Container>
          </Container>
        </ThemeProvider>
      );
      expect(screen.getByTestId("nested-content")).toBeInTheDocument();
      expect(screen.getByTestId("outer")).toBeInTheDocument();
      expect(screen.getByTestId("inner")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("preserves accessibility props", () => {
      const { container } = renderContainer({
        role: "region",
        "aria-label": "Content region"
      });
      const box = container.firstChild as HTMLElement;
      expect(box).toHaveAttribute("role", "region");
      expect(box).toHaveAttribute("aria-label", "Content region");
    });
  });

  describe("Theme Integration", () => {
    it("uses theme spacing for padding calculation", () => {
      const { container } = renderContainer({ padding: "normal" });
      const box = container.firstChild as HTMLElement;
      // theme.spacing(2) should return "16px" (2 * 8px)
      expect(box).toHaveStyle({ padding: "16px" });
    });
  });
});
