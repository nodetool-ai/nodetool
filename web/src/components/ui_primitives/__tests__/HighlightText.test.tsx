/**
 * Tests for HighlightText component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { HighlightText } from "../HighlightText";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe("HighlightText", () => {
  describe("Basic rendering", () => {
    it("should render text without highlighting when query is null", () => {
      renderWithTheme(<HighlightText text="Hello World" query={null} />);
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    it("should render text without highlighting when query is empty string", () => {
      renderWithTheme(<HighlightText text="Hello World" query="" />);
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    it("should render text without highlighting when query is only whitespace", () => {
      renderWithTheme(<HighlightText text="Hello World" query="   " />);
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const { container } = renderWithTheme(
        <HighlightText text="Hello" query="" className="custom-class" />
      );
      expect(container.querySelector(".custom-class")).toBeInTheDocument();
    });
  });

  describe("Text highlighting with primary match style", () => {
    it("should highlight matching text", () => {
      renderWithTheme(<HighlightText text="Hello World" query="World" />);
      const highlightedElement = screen.getByText("World");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should highlight multiple occurrences of the query", () => {
      renderWithTheme(<HighlightText text="Hello World Hello" query="Hello" />);
      const highlightedElements = screen.getAllByText("Hello");
      expect(highlightedElements).toHaveLength(2);
      highlightedElements.forEach((el) => {
        expect(el).toHaveClass("highlight-match");
      });
    });

    it("should be case-insensitive", () => {
      renderWithTheme(<HighlightText text="Hello World" query="world" />);
      const highlightedElement = screen.getByText("World");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should not highlight non-matching text", () => {
      renderWithTheme(<HighlightText text="Hello World" query="Foo" />);
      const textElement = screen.getByText("Hello World");
      expect(textElement).not.toHaveClass("highlight-match");
    });
  });

  describe("Text highlighting with underline match style", () => {
    it("should highlight with underline style", () => {
      renderWithTheme(
        <HighlightText text="Hello World" query="World" matchStyle="underline" />
      );
      const highlightedElement = screen.getByText("World");
      expect(highlightedElement).toHaveClass("highlight-match");
    });
  });

  describe("Bullet list rendering", () => {
    it("should render text as bullet list when isBulletList is true", () => {
      const { container } = renderWithTheme(
        <HighlightText
          text="First item\nSecond item\nThird item"
          query={null}
          isBulletList={true}
        />
      );
      const list = container.querySelector("ul");
      expect(list).toBeInTheDocument();
    });

    it("should highlight text in bullet list items", () => {
      renderWithTheme(
        <HighlightText
          text="First item\nSecond item\nThird item"
          query="Second"
          isBulletList={true}
        />
      );
      const highlightedElement = screen.getByText("Second");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should not render as bullet list when isBulletList is false", () => {
      const { container } = renderWithTheme(
        <HighlightText
          text="First item\nSecond item"
          query={null}
          isBulletList={false}
        />
      );
      const list = container.querySelector("ul");
      expect(list).not.toBeInTheDocument();
    });
  });

  describe("Special characters in query", () => {
    it("should escape special regex characters in query", () => {
      renderWithTheme(<HighlightText text="Price: $100" query="$100" />);
      const highlightedElement = screen.getByText("$100");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should handle dots in query", () => {
      renderWithTheme(<HighlightText text="example.com" query="example.com" />);
      const highlightedElement = screen.getByText("example.com");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should handle plus signs in query", () => {
      renderWithTheme(<HighlightText text="C++ Programming" query="C++" />);
      const highlightedElement = screen.getByText("C++");
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should handle parentheses in query", () => {
      renderWithTheme(<HighlightText text="Function (test)" query="(test)" />);
      const highlightedElement = screen.getByText("(test)");
      expect(highlightedElement).toHaveClass("highlight-match");
    });
  });

  describe("Edge cases", () => {
    it("should handle very long queries", () => {
      const longText = "This is a very long text that contains many words";
      const longQuery = "very long text that contains";
      renderWithTheme(<HighlightText text={longText} query={longQuery} />);
      const highlightedElement = screen.getByText(longQuery);
      expect(highlightedElement).toHaveClass("highlight-match");
    });

    it("should handle unicode characters", () => {
      renderWithTheme(<HighlightText text="Hello 世界" query="世界" />);
      const highlightedElement = screen.getByText("世界");
      expect(highlightedElement).toHaveClass("highlight-match");
    });
  });

  describe("Performance and memoization", () => {
    it("should have displayName for debugging", () => {
      expect(HighlightText.displayName).toBe("HighlightText");
    });
  });

  describe("Error handling", () => {
    it("should handle regex errors gracefully and return original text", () => {
      // This test verifies the try-catch block in tokenize function
      // by using a query that would cause issues if not properly escaped
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      renderWithTheme(<HighlightText text="Test text" query="[" />);
      expect(screen.getByText("Test text")).toBeInTheDocument();

      consoleWarnSpy.mockRestore();
    });
  });
});
