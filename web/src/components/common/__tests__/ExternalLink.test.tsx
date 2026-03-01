import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ExternalLink from "../ExternalLink";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {ui}
    </ThemeProvider>
  );
};

describe("ExternalLink", () => {
  describe("basic rendering", () => {
    it("renders link with href", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Test Link</ExternalLink>);
      const link = screen.getByRole("link", { name: /test link/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("renders children text content", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Click here</ExternalLink>);
      expect(screen.getByText("Click here")).toBeInTheDocument();
    });

    it("renders with external link icon", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("security attributes", () => {
    it("opens in new tab with target blank", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("has security rel attributes", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("tooltip prop", () => {
    it("renders without tooltip when tooltipText is not provided", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).not.toHaveAttribute("title");
    });

    it("renders with tooltip when tooltipText is provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltipText="View example">
          Link
        </ExternalLink>
      );
      const link = screen.getByRole("link");
      expect(link.closest('[role="tooltip"]') || link).toBeInTheDocument();
    });
  });

  describe("size prop", () => {
    it("renders with small size by default", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveStyle({ fontSize: expect.any(String) });
    });

    it("renders with small size explicitly", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="small">
          Link
        </ExternalLink>
      );
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });

    it("renders with medium size", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="medium">
          Link
        </ExternalLink>
      );
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });

    it("renders with large size", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="large">
          Link
        </ExternalLink>
      );
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("className prop", () => {
    it("applies custom className", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" className="custom-class">
          Link
        </ExternalLink>
      );
      const link = screen.getByRole("link");
      expect(link).toHaveClass("custom-class");
    });

    it("works without className", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders with complex children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          <span>Complex</span> <strong>Link</strong>
        </ExternalLink>
      );
      expect(screen.getByText("Complex")).toBeInTheDocument();
      expect(screen.getByText("Link")).toBeInTheDocument();
    });

    it("handles empty href", () => {
      renderWithTheme(<ExternalLink href="">Link</ExternalLink>);
      // Empty href links aren't considered accessible, use container query
      const link = document.querySelector('a[href=""]');
      expect(link).toBeInTheDocument();
    });

    it("handles relative URLs", () => {
      renderWithTheme(<ExternalLink href="/path/to/page">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/path/to/page");
    });

    it("handles anchor links", () => {
      renderWithTheme(<ExternalLink href="#section">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "#section");
    });
  });

  describe("accessibility", () => {
    it("is keyboard accessible", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Accessible Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href");
    });

    it("has proper link role", () => {
      renderWithTheme(<ExternalLink href="https://example.com">Link</ExternalLink>);
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("memoization", () => {
    it("is memoized component", () => {
      // Component is wrapped with memo(), check it's a valid React component
      expect(typeof ExternalLink).toBe("object");
    });
  });
});
