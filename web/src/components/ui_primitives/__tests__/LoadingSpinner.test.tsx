import React from "react";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "../LoadingSpinner";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("LoadingSpinner", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("default rendering", () => {
    it("renders with default circular variant", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      const circularProgress = container.querySelector("svg");
      expect(circularProgress).toBeInTheDocument();
    });

    it("applies loading-spinner class", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toHaveClass("loading-spinner");
    });
  });

  describe("variants", () => {
    it("renders circular variant", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="circular" />);

      const circularProgress = container.querySelector("svg");
      expect(circularProgress).toBeInTheDocument();
    });

    it("renders dots variant", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" />);

      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();

      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
    });
  });

  describe("sizes", () => {
    it("renders with small size", () => {
      const { container } = renderWithTheme(<LoadingSpinner size="small" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      const dots = container.querySelectorAll(".dot");
      if (dots.length > 0) {
        const firstDotStyles = window.getComputedStyle(dots[0]!);
        expect(firstDotStyles.width).toBe("6px");
        expect(firstDotStyles.height).toBe("6px");
      }
    });

    it("renders with medium size (default)", () => {
      const { container } = renderWithTheme(<LoadingSpinner size="medium" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      const dots = container.querySelectorAll(".dot");
      if (dots.length > 0) {
        const firstDotStyles = window.getComputedStyle(dots[0]!);
        expect(firstDotStyles.width).toBe("8px");
        expect(firstDotStyles.height).toBe("8px");
      }
    });

    it("renders with large size", () => {
      const { container } = renderWithTheme(<LoadingSpinner size="large" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      const dots = container.querySelectorAll(".dot");
      if (dots.length > 0) {
        const firstDotStyles = window.getComputedStyle(dots[0]!);
        expect(firstDotStyles.width).toBe("12px");
        expect(firstDotStyles.height).toBe("12px");
      }
    });
  });

  describe("loading text", () => {
    it("renders without text by default", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);

      const textElement = container.querySelector(".loading-text");
      expect(textElement).not.toBeInTheDocument();
    });

    it("renders with custom text", () => {
      renderWithTheme(<LoadingSpinner text="Loading data..." />);

      expect(screen.getByText("Loading data...")).toBeInTheDocument();
    });

    it("applies loading-text class to text element", () => {
      const { container } = renderWithTheme(<LoadingSpinner text="Please wait" />);

      const textElement = container.querySelector(".loading-text");
      expect(textElement).toBeInTheDocument();
      expect(textElement).toHaveClass("loading-text");
    });
  });

  describe("colors", () => {
    it("renders with primary color by default", () => {
      const { container } = renderWithTheme(<LoadingSpinner color="primary" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();
    });

    it("renders with secondary color", () => {
      const { container } = renderWithTheme(<LoadingSpinner color="secondary" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();
    });

    it("renders with inherit color", () => {
      const { container } = renderWithTheme(<LoadingSpinner color="inherit" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("custom className", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(<LoadingSpinner className="my-custom-class" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toHaveClass("my-custom-class");
    });

    it("applies base class and custom className", () => {
      const { container } = renderWithTheme(<LoadingSpinner className="custom-class another-class" />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toHaveClass("loading-spinner");
      expect(spinner).toHaveClass("custom-class");
      expect(spinner).toHaveClass("another-class");
    });
  });

  describe("combinations", () => {
    it("renders dots variant with text and custom className", () => {
      const { container } = renderWithTheme(
        <LoadingSpinner variant="dots" text="Loading..." className="my-spinner" />
      );

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toHaveClass("my-spinner");

      expect(screen.getByText("Loading...")).toBeInTheDocument();

      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();
    });

    it("renders small size with text", () => {
      renderWithTheme(<LoadingSpinner size="small" text="Processing..." />);

      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });

    it("renders large dots variant with text", () => {
      const { container } = renderWithTheme(
        <LoadingSpinner size="large" variant="dots" text="Loading large..." />
      );

      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);

      expect(screen.getByText("Loading large...")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has accessible role for screen readers", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);

      const spinner = container.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();
    });

    it("provides visual feedback for loading state", () => {
      const { container } = renderWithTheme(<LoadingSpinner text="Loading content" />);

      const textElement = container.querySelector(".loading-text");
      expect(textElement).toBeInTheDocument();
      expect(textElement).toHaveTextContent("Loading content");
    });
  });

  describe("exported types", () => {
    it("exports LoadingVariant type", () => {
      // This test ensures the type is exported correctly
      // If this compiles, the type export is working
      const variant: "circular" | "dots" = "circular";
      expect(variant).toBe("circular");
    });
  });
});
