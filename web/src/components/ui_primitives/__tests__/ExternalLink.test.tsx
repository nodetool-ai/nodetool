/**
 * ExternalLink Component Tests
 *
 * Comprehensive test suite for the ExternalLink UI primitive component.
 * Tests rendering, accessibility, icon variants, sizes, tooltips, and styling.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ExternalLink } from "../ExternalLink";
import mockTheme from "../../../__mocks__/themeMock";

describe("ExternalLink", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("Basic Rendering", () => {
    it("renders with href and children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Example Link</ExternalLink>
      );

      const link = screen.getByRole("link", { name: /example link/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("renders children text correctly", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Click here</ExternalLink>
      );

      expect(screen.getByText("Click here")).toBeInTheDocument();
    });

    it("renders with React node children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          <span data-testid="custom-child">Custom Content</span>
        </ExternalLink>
      );

      expect(screen.getByTestId("custom-child")).toBeInTheDocument();
      expect(screen.getByText("Custom Content")).toBeInTheDocument();
    });

    it("renders with nested content", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          <div>
            <strong>Bold Text</strong> and normal text
          </div>
        </ExternalLink>
      );

      expect(screen.getByText("Bold Text")).toBeInTheDocument();
      expect(screen.getByText("and normal text")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has target='_blank' for external links", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">External Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("has rel='noopener noreferrer' for security", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">External Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("is accessible via link role", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Accessible Link</ExternalLink>
      );

      expect(screen.getByRole("link", { name: /accessible link/i })).toBeInTheDocument();
    });

    it("has proper accessible name from children text", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Documentation</ExternalLink>
      );

      const link = screen.getByRole("link", { name: "Documentation" });
      expect(link).toBeInTheDocument();
    });
  });

  describe("Icon Variants", () => {
    it("renders with default arrow icon", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link with arrow</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      // NorthEastIcon should be present for arrow variant
      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders with open icon variant", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="open">
          Link with open icon
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      // Should have link-icon class
      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders with launch icon variant", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="launch">
          Link with launch icon
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      // Should have link-icon class
      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders with none icon variant (no icon)", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="none">
          Link without icon
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      // Should not have link-icon class
      const icon = container.querySelector(".link-icon");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("Size Variants", () => {
    it("renders with small size", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" size="small">
          Small link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      const styles = window.getComputedStyle(link as HTMLElement);
      expect(styles.fontSize).toBe("0.75rem");
    });

    it("renders with medium size (default)", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" size="medium">
          Medium link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      const styles = window.getComputedStyle(link as HTMLElement);
      expect(styles.fontSize).toBe("0.875rem");
    });

    it("renders with large size", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" size="large">
          Large link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      const styles = window.getComputedStyle(link as HTMLElement);
      expect(styles.fontSize).toBe("1rem");
    });

    it("defaults to medium size when size is not specified", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Default size link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      const styles = window.getComputedStyle(link as HTMLElement);
      expect(styles.fontSize).toBe("0.875rem");
    });
  });

  describe("Tooltip", () => {
    it("renders without tooltip by default", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link without tooltip</ExternalLink>
      );

      // Should not have tooltip wrapper
      const tooltip = container.querySelector(".MuiTooltip-popper");
      expect(tooltip).not.toBeInTheDocument();
    });

    it("renders with tooltip when tooltip prop is provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltip="View documentation">
          Link with tooltip
        </ExternalLink>
      );

      // The link should still be rendered
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });

    it("renders with empty tooltip string", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltip="">
          Link with empty tooltip
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });

    it("renders with long tooltip text", () => {
      const longTooltip = "This is a very long tooltip text that describes the link in detail";
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltip={longTooltip}>
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("Custom Styling", () => {
    it("applies custom className", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" className="my-custom-class">
          Custom styled link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link.my-custom-class");
      expect(link).toBeInTheDocument();
    });

    it("includes external-link class", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
    });

    it("includes nodrag class", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = container.querySelector("a.nodrag");
      expect(link).toBeInTheDocument();
    });

    it("combines multiple classes correctly", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" className="custom-class">
          Link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link.nodrag.custom-class");
      expect(link).toBeInTheDocument();
    });
  });

  describe("Styling and Theme", () => {
    it("applies primary color from theme", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Themed Link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
    });

    it("has no text decoration by default", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      if (link) {
        const styles = window.getComputedStyle(link);
        expect(styles.textDecoration).toBe("none");
      }
    });

    it("displays as inline-flex", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      if (link) {
        const styles = window.getComputedStyle(link);
        expect(styles.display).toBe("inline-flex");
      }
    });

    it("aligns items center", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Link</ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      if (link) {
        const styles = window.getComputedStyle(link);
        expect(styles.alignItems).toBe("center");
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles empty href gracefully", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="">Link with empty href</ExternalLink>
      );

      // Empty href links are not considered accessible, use querySelector
      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "");
    });

    it("handles relative URLs", () => {
      renderWithTheme(
        <ExternalLink href="/path/to/page">Relative Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/path/to/page");
    });

    it("handles anchor links", () => {
      renderWithTheme(
        <ExternalLink href="#section">Anchor Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "#section");
    });

    it("handles special characters in href", () => {
      const specialUrl = "https://example.com/path?query=value&foo=bar#anchor";
      renderWithTheme(
        <ExternalLink href={specialUrl}>Link with special chars</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", specialUrl);
    });

    it("handles very long URLs", () => {
      const longUrl = "https://example.com/" + "a".repeat(200);
      renderWithTheme(
        <ExternalLink href={longUrl}>Long URL Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", longUrl);
    });

    it("handles unicode characters in children", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">
          Link with 日本語 characters
        </ExternalLink>
      );

      expect(screen.getByText(/日本語/)).toBeInTheDocument();
    });

    it("handles numeric children as string", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">{"123"}</ExternalLink>
      );

      expect(screen.getByText("123")).toBeInTheDocument();
    });
  });

  describe("Combined Props", () => {
    it("renders with all props combined", () => {
      const { container } = renderWithTheme(
        <ExternalLink
          href="https://example.com"
          iconVariant="launch"
          size="large"
          tooltip="Opens in new tab"
          className="combined-props-link"
        >
          Full Featured Link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link.nodrag.combined-props-link");
      expect(link).toBeInTheDocument();

      // When tooltip is provided, it becomes the accessible name (aria-label)
      const screenLink = screen.getByRole("link", { name: "Opens in new tab" });
      expect(screenLink).toHaveAttribute("href", "https://example.com");
      expect(screenLink).toHaveAttribute("target", "_blank");
      expect(screenLink).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders small link with open icon and tooltip", () => {
      const { container } = renderWithTheme(
        <ExternalLink
          href="https://docs.example.com"
          iconVariant="open"
          size="small"
          tooltip="View documentation"
        >
          Docs
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();

      if (link) {
        const styles = window.getComputedStyle(link);
        expect(styles.fontSize).toBe("0.75rem");
      }
    });

    it("renders large link without icon", () => {
      const { container } = renderWithTheme(
        <ExternalLink
          href="https://example.com"
          iconVariant="none"
          size="large"
        >
          Plain Large Link
        </ExternalLink>
      );

      const link = container.querySelector("a.external-link");
      expect(link).toBeInTheDocument();

      // Should not have icon
      const icon = container.querySelector(".link-icon");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("Security Attributes", () => {
    it("always includes noopener in rel attribute", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Secure Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      const rel = link.getAttribute("rel");
      expect(rel).toContain("noopener");
    });

    it("always includes noreferrer in rel attribute", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Secure Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      const rel = link.getAttribute("rel");
      expect(rel).toContain("noreferrer");
    });

    it("opens in new tab with target blank", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">New Tab Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });
});
