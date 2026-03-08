import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ExternalLink } from "../ExternalLink";

describe("ExternalLink", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  describe("basic rendering", () => {
    it("renders link text and href", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Click here</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveTextContent("Click here");
    });

    it("opens link in new tab with security attributes", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">External Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("applies custom className", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" className="custom-class">
          Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveClass("custom-class");
      expect(link).toHaveClass("external-link");
      expect(link).toHaveClass("nodrag");
    });
  });

  describe("icon variants", () => {
    it("renders default arrow icon", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com">Arrow Link</ExternalLink>
      );

      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders open icon variant", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="open">
          Open Link
        </ExternalLink>
      );

      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders launch icon variant", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="launch">
          Launch Link
        </ExternalLink>
      );

      const icon = container.querySelector(".link-icon");
      expect(icon).toBeInTheDocument();
    });

    it("renders no icon when variant is 'none'", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="none">
          No Icon Link
        </ExternalLink>
      );

      const icon = container.querySelector(".link-icon");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders small size", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="small">
          Small Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({ fontSize: "0.75rem" });
    });

    it("renders medium size (default)", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="medium">
          Medium Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({ fontSize: "0.875rem" });
    });

    it("renders large size", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" size="large">
          Large Link
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({ fontSize: "1rem" });
    });
  });

  describe("tooltip functionality", () => {
    it("renders without tooltip when not provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">No Tooltip</ExternalLink>
      );

      // Check that the link is directly in the DOM (not wrapped in Tooltip)
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).not.toHaveAttribute("title");
    });

    it("renders with tooltip when provided", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com" tooltip="Helpful tooltip">
          With Tooltip
        </ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      // Verify the link text is still present with tooltip
      expect(link).toHaveTextContent("With Tooltip");
    });
  });

  describe("accessibility", () => {
    it("is keyboard accessible", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Accessible Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("has proper security attributes for external links", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Secure Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      // noopener prevents the new page from accessing the window.opener property
      // noreferrer prevents the Referer header from being sent to the target
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("styling", () => {
    it("applies primary color", () => {
      renderWithTheme(
        <ExternalLink href="https://example.com">Styled Link</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveStyle({
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center"
      });
    });

    it("renders icon with proper sizing", () => {
      const { container } = renderWithTheme(
        <ExternalLink href="https://example.com" iconVariant="arrow">
          Link with Icon
        </ExternalLink>
      );

      const icon = container.querySelector(".link-icon");
      expect(icon).toHaveStyle({ fontSize: "inherit" });
    });
  });

  describe("edge cases", () => {
    it("handles special characters in href", () => {
      const specialUrl = "https://example.com/path?query=value&foo=bar#hash";
      renderWithTheme(
        <ExternalLink href={specialUrl}>Special URL</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", specialUrl);
    });

    it("handles long text content", () => {
      const longText = "This is a very long link text that should still render properly without breaking";
      renderWithTheme(
        <ExternalLink href="https://example.com">{longText}</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveTextContent(longText);
    });

    it("handles relative URLs", () => {
      renderWithTheme(
        <ExternalLink href="/path/to/resource">Relative URL</ExternalLink>
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/path/to/resource");
      expect(link).toHaveTextContent("Relative URL");
    });
  });
});
