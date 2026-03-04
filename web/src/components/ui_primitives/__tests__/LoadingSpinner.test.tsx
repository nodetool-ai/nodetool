/**
 * Tests for LoadingSpinner component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { LoadingSpinner } from "../LoadingSpinner";

describe("LoadingSpinner", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("circular variant", () => {
    it("renders circular spinner by default", () => {
      renderWithTheme(<LoadingSpinner />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toBeInTheDocument();
    });

    it("renders small circular spinner", () => {
      renderWithTheme(<LoadingSpinner size="small" variant="circular" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toBeInTheDocument();
      expect(circularProgress).toHaveClass("MuiCircularProgress-root");
    });

    it("renders medium circular spinner by default", () => {
      renderWithTheme(<LoadingSpinner variant="circular" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toBeInTheDocument();
    });

    it("renders large circular spinner", () => {
      renderWithTheme(<LoadingSpinner size="large" variant="circular" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toBeInTheDocument();
    });

    it("applies primary color by default", () => {
      renderWithTheme(<LoadingSpinner variant="circular" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toHaveClass("MuiCircularProgress-colorPrimary");
    });

    it("applies secondary color", () => {
      renderWithTheme(<LoadingSpinner variant="circular" color="secondary" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toHaveClass("MuiCircularProgress-colorSecondary");
    });

    it("applies inherit color", () => {
      renderWithTheme(<LoadingSpinner variant="circular" color="inherit" />);
      const circularProgress = screen.getByRole("progressbar");
      expect(circularProgress).toHaveClass("MuiCircularProgress-colorInherit");
    });
  });

  describe("dots variant", () => {
    it("renders dots variant", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
    });

    it("renders small dots", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" size="small" />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();
    });

    it("renders medium dots by default", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();
    });

    it("renders large dots", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" size="large" />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();
    });

    it("dots container has flex layout", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" />);
      const dotsContainer = container.querySelector(".dots-container");
      expect(dotsContainer).toBeInTheDocument();
    });
  });

  describe("loading text", () => {
    it("renders with loading text", () => {
      renderWithTheme(<LoadingSpinner text="Loading data..." />);
      expect(screen.getByText("Loading data...")).toBeInTheDocument();
    });

    it("does not render text when not provided", () => {
      renderWithTheme(<LoadingSpinner />);
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it("renders with small size and text", () => {
      renderWithTheme(<LoadingSpinner size="small" text="Loading..." />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
    });

    it("renders with medium size and text", () => {
      renderWithTheme(<LoadingSpinner size="medium" text="Loading..." />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
    });

    it("renders with large size and text", () => {
      renderWithTheme(<LoadingSpinner size="large" text="Loading..." />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
    });
  });

  describe("container and layout", () => {
    it("applies loading-spinner class", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);
      const wrapper = container.querySelector(".loading-spinner");
      expect(wrapper).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = renderWithTheme(<LoadingSpinner className="custom-class" />);
      const wrapper = container.querySelector(".loading-spinner");
      expect(wrapper).toHaveClass("custom-class");
    });

    it("container wrapper exists", () => {
      const { container } = renderWithTheme(<LoadingSpinner />);
      const wrapper = container.querySelector(".loading-spinner");
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("circular progress has proper role", () => {
      renderWithTheme(<LoadingSpinner variant="circular" />);
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
    });

    it("dots variant does not have progressbar role (no standard loading indicator)", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" />);
      const progressbar = container.querySelector('[role="progressbar"]');
      expect(progressbar).not.toBeInTheDocument();
    });
  });

  describe("combinations", () => {
    it("renders large dots spinner with text", () => {
      renderWithTheme(<LoadingSpinner variant="dots" size="large" text="Please wait..." />);
      expect(screen.getByText("Please wait...")).toBeInTheDocument();
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" size="large" text="Please wait..." />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
    });

    it("renders small circular spinner with text", () => {
      renderWithTheme(<LoadingSpinner variant="circular" size="small" text="Loading..." />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
    });

    it("renders secondary colored large spinner with text", () => {
      renderWithTheme(<LoadingSpinner variant="circular" size="large" color="secondary" text="Processing..." />);
      expect(screen.getByText("Processing...")).toBeInTheDocument();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveClass("MuiCircularProgress-colorSecondary");
    });

    it("renders inherit colored dots without text", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="dots" color="inherit" />);
      const dots = container.querySelectorAll(".dot");
      expect(dots).toHaveLength(3);
      const progressbar = container.querySelector('[role="progressbar"]');
      expect(progressbar).not.toBeInTheDocument();
    });

    it("renders primary small spinner with custom className", () => {
      const { container } = renderWithTheme(<LoadingSpinner variant="circular" size="small" color="primary" className="my-spinner" />);
      const wrapper = container.querySelector(".loading-spinner");
      expect(wrapper).toHaveClass("my-spinner");
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveClass("MuiCircularProgress-colorPrimary");
    });
  });
});
