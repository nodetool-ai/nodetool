/**
 * ExternalLink Component Tests
 *
 * Tests the external link component that renders links with external navigation
 * and a visual indicator icon. This component ensures security attributes are
 * properly set for external links.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ExternalLink from "../ExternalLink";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ExternalLink", () => {
  describe("Basic functionality", () => {
    it("should render children content", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link Text</ExternalLink>
      );

      expect(screen.getByText("Link Text")).toBeInTheDocument();
    });

    it("should render with correct href attribute", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("should render the external link indicator icon", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link.querySelector("svg")).toBeInTheDocument();
    });

    it("should render React node children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          <span>Custom child</span>
        </ExternalLink>
      );

      expect(screen.getByText("Custom child")).toBeInTheDocument();
    });
  });

  describe("Security attributes", () => {
    it("should have target='_blank' for external navigation", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("should have rel='noopener noreferrer' for security", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("should include both security attributes together", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Size variants", () => {
    it("should render with small size by default", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveStyle({ fontSize: mockTheme.fontSizeSmaller });
    });

    it("should render with medium size prop", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="medium">
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveStyle({ fontSize: mockTheme.fontSizeSmall });
    });

    it("should render with large size prop", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="large">
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveStyle({ fontSize: mockTheme.fontSizeNormal });
    });
  });

  describe("Tooltip functionality", () => {
    it("should render without tooltip when tooltipText is not provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).not.toHaveAttribute("title");
    });

    it("should render with tooltip when tooltipText is provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltipText="Opens in new tab">
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("should accept and apply custom className", () => {
      renderWithTheme(
        <ExternalLink
          href="https://example.com"
          className="custom-link-class"
        >
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveClass("custom-link-class");
    });

    it("should apply multiple classes if provided", () => {
      renderWithTheme(
        <ExternalLink
          href="https://example.com"
          className="class1 class2"
        >
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveClass("class1");
      expect(link).toHaveClass("class2");
    });
  });

  describe("Ref forwarding", () => {
    it("should support ref forwarding", () => {
      const setRef = jest.fn();

      renderWithTheme(
        <ExternalLink href="https://example.com" ref={setRef}>
          Link
        </ExternalLink>
      );

      // The ref callback should be called with an HTMLAnchorElement
      expect(setRef).toHaveBeenCalled();
      const refValue = setRef.mock.calls[0][0];
      expect(refValue).toBeTruthy();
    });

    it("should pass ref to underlying anchor element", () => {
      const setRef = jest.fn();

      renderWithTheme(
        <ExternalLink href="https://example.com" ref={setRef}>
          Link
        </ExternalLink>
      );

      // Verify the ref callback was called
      expect(setRef).toHaveBeenCalled();
      const refValue = setRef.mock.calls[0][0];
      expect(refValue?.getAttribute).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty children gracefully", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">{""}</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent("");
    });

    it("should handle special characters in href", () => {
      const specialUrl = "https://example.com/path?query=value&foo=bar#anchor";
      renderWithTheme(
        <ExternalLink href={specialUrl}>Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", specialUrl);
    });

    it("should handle unicode characters in children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          世界 🌍
        </ExternalLink>
      );

      expect(screen.getByText("世界 🌍")).toBeInTheDocument();
    });

    it("should handle very long URLs", () => {
      const longUrl =
        "https://example.com/" + "a".repeat(1000) + "?param=" + "b".repeat(100);
      renderWithTheme(
        <ExternalLink href={longUrl}>Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", longUrl);
    });

    it("should handle URLs with special protocol handlers", () => {
      renderWithTheme(
        <ExternalLink href="mailto:test@example.com">Email</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "mailto:test@example.com");
    });

    it("should handle tel protocol URLs", () => {
      renderWithTheme(
        <ExternalLink href="tel:+1234567890">Call</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "tel:+1234567890");
    });
  });

  describe("Styling and theme integration", () => {
    it("should apply theme-based link color", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({
        color: mockTheme.vars.palette.grey[400],
      });
    });

    it("should have no text decoration by default", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({
        textDecoration: "none",
      });
    });

    it("should render with inline-flex display", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({
        display: "inline-flex",
      });
    });

    it("should align items to center", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({
        alignItems: "center",
      });
    });
  });

  describe("Icon rendering", () => {
    it("should always render the NorthEastIcon indicator", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      const svg = link.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should render icon after children text", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          <span data-testid="child-text">Link</span>
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      const childText = link.querySelector('[data-testid="child-text"]');
      const svg = link.querySelector("svg");

      expect(childText).toBeInTheDocument();
      expect(svg).toBeInTheDocument();

      expect(link.firstChild).toContainHTML(childText?.outerHTML || "");
    });

    it("should render icon with theme color", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("Component composition", () => {
    it("should work as a child of other components", () => {
      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <div className="wrapper">{children}</div>
      );

      renderWithTheme(
        <Wrapper>
          <ExternalLink href="https://example.com">Nested Link</ExternalLink>
        </Wrapper>
      );

      expect(screen.getByText("Nested Link")).toBeInTheDocument();
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("should render multiple instances correctly", () => {
      renderWithTheme(
        <>
          <ExternalLink href="https://example1.com">Link 1</ExternalLink>
          <ExternalLink href="https://example2.com">Link 2</ExternalLink>
          <ExternalLink href="https://example3.com">Link 3</ExternalLink>
        </>
      );

      expect(screen.getByText("Link 1")).toBeInTheDocument();
      expect(screen.getByText("Link 2")).toBeInTheDocument();
      expect(screen.getByText("Link 3")).toBeInTheDocument();

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(3);
    });
  });

  describe("Accessibility", () => {
    it("should be keyboard accessible as a standard link", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Accessible Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href");
      expect(link.tagName).toBe("A");
    });

    it("should have proper semantics with role='link'", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Semantic Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });
});
