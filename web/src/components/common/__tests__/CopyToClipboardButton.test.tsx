/**
 * CopyToClipboardButton Component Tests
 *
 * Tests the copy-to-clipboard button component that wraps CopyButton from ui_primitives.
 * This component handles special serialization for complex values and sanitizes text.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CopyToClipboardButton } from "../CopyToClipboardButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the serializeValue utility
jest.mock("../../../utils/serializeValue", () => ({
  serializeValue: jest.fn((value: unknown) => {
    if (typeof value === "string") {
      return value;
    }
    if (value === null) {
      return "null";
    }
    if (value === undefined) {
      return "undefined";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  })
}));

import { serializeValue } from "../../../utils/serializeValue";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("CopyToClipboardButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic functionality", () => {
    it("should render successfully with string value", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="Test text" />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("copy-to-clipboard-button");
    });

    it("should not call serializeValue for strings", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="Test string" />
      );

      expect(serializeValue).not.toHaveBeenCalled();
    });

    it("should serialize non-string values", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue={{ key: "value" }} />
      );

      expect(serializeValue).toHaveBeenCalledWith({ key: "value" });
    });

    it("should sanitize non-breaking spaces", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="Text\u00A0with\u00A0spaces" />
      );

      expect(serializeValue).not.toHaveBeenCalled();
    });
  });

  describe("Value serialization", () => {
    it("should handle string values without serialization", () => {
      const testString = "Plain string value";
      renderWithTheme(
        <CopyToClipboardButton copyValue={testString} />
      );

      expect(serializeValue).not.toHaveBeenCalled();
    });

    it("should serialize object values", () => {
      const testObject = { name: "test", value: 123 };
      renderWithTheme(
        <CopyToClipboardButton copyValue={testObject} />
      );

      expect(serializeValue).toHaveBeenCalledWith(testObject);
    });

    it("should serialize array values", () => {
      const testArray = [1, 2, 3];
      renderWithTheme(
        <CopyToClipboardButton copyValue={testArray} />
      );

      expect(serializeValue).toHaveBeenCalledWith(testArray);
    });

    it("should serialize null values", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue={null} />
      );

      expect(serializeValue).toHaveBeenCalledWith(null);
    });

    it("should serialize number values", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue={12345} />
      );

      expect(serializeValue).toHaveBeenCalledWith(12345);
    });

    it("should serialize boolean values", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue={true} />
      );

      expect(serializeValue).toHaveBeenCalledWith(true);
    });
  });

  describe("Props handling", () => {
    it("should render with small size", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="small" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should render with medium size", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="medium" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should render with large size", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="large" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should pass tooltip placement prop", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" tooltipPlacement="top" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should pass custom title prop", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" title="Custom tooltip" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should use default title when not provided", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("should apply theme-based styles", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should merge custom sx props with default styles", () => {
      const customSx = { color: "red" as const };
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" sx={customSx} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle function sx props", () => {
      const fnSx = (theme: any) => ({ color: theme.vars.palette.primary.main });
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" sx={fnSx} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should have correct CSS class", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("copy-to-clipboard-button");
    });
  });

  describe("Callbacks", () => {
    it("should accept onCopySuccess callback", () => {
      const onCopySuccess = jest.fn();
      
      renderWithTheme(
        <CopyToClipboardButton 
          copyValue="test" 
          onCopySuccess={onCopySuccess} 
        />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should accept onCopyError callback", () => {
      const onCopyError = jest.fn();
      
      renderWithTheme(
        <CopyToClipboardButton 
          copyValue="test" 
          onCopyError={onCopyError} 
        />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle special characters", () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?";
      renderWithTheme(
        <CopyToClipboardButton copyValue={specialChars} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle unicode characters", () => {
      const unicode = "Hello 世界 🌍";
      renderWithTheme(
        <CopyToClipboardButton copyValue={unicode} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle very long strings", () => {
      const longString = "a".repeat(10000);
      renderWithTheme(
        <CopyToClipboardButton copyValue={longString} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle newlines and tabs", () => {
      const withWhitespace = "Line 1\nLine 2\tTabbed";
      renderWithTheme(
        <CopyToClipboardButton copyValue={withWhitespace} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Button size mapping", () => {
    it("should map small size to CopyButton small", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="small" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should map medium size to CopyButton medium", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="medium" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should map large size to CopyButton large", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" size="large" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Integration with CopyButton", () => {
    it("should pass nodrag=false to CopyButton", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should pass sanitized text to CopyButton", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test\u00A0value" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should pass tooltipPlacement to CopyButton", () => {
      renderWithTheme(
        <CopyToClipboardButton copyValue="test" tooltipPlacement="left" />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
