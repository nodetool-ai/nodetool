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

  describe("sizes", () => {
    it.each([
      ["small", 20],
      ["medium", 32],
      ["large", 48]
    ] as const)("draws the %s preset at %ipx", (size, px) => {
      const { container } = renderWithTheme(<LoadingSpinner size={size} />);

      const ring = container.querySelector(".MuiCircularProgress-root");
      expect(ring).toHaveStyle({ width: `${px}px`, height: `${px}px` });
    });

    it("renders an inline icon-sized ring with no status wrapper", () => {
      const { container } = renderWithTheme(<LoadingSpinner inline size={14} />);

      expect(container.querySelector(".loading-spinner")).not.toBeInTheDocument();
      const ring = container.querySelector(".MuiCircularProgress-root");
      expect(ring).toHaveStyle({ width: "14px", height: "14px" });
      // Small rings use a heavier stroke than MUI's 3.6 default.
      expect(container.querySelector("circle")).toHaveAttribute("stroke-width", "5");
    });
  });

  describe("loading text", () => {
    it("renders without text by default", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);

      const textElement = container.querySelector(".loading-text");
      expect(textElement).not.toBeInTheDocument();
    });

    it("renders with custom text", () => {
      renderWithTheme(<LoadingSpinner text="Loading data" />);

      expect(screen.getByText("Loading data")).toBeInTheDocument();
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
    it("renders small size with text", () => {
      renderWithTheme(<LoadingSpinner size="small" text="Processing" />);

      expect(screen.getByText("Processing")).toBeInTheDocument();
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
});
