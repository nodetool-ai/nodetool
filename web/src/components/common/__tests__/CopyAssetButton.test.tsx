/**
 * CopyAssetButton Component Tests
 *
 * Tests the copy-to-clipboard button component for copying assets (images, text, html).
 * Uses Electron's clipboard API when available, falls back to browser Clipboard API.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CopyAssetButton } from "../CopyAssetButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock clipboard utilities
jest.mock("../../../utils/clipboardUtils", () => ({
  copyAssetToClipboard: jest.fn().mockResolvedValue(undefined),
  isClipboardSupported: jest.fn(() => true),
  getClipboardSupportMessage: jest.fn(() => "Test support message")
}));

// Mock browser detection
jest.mock("../../../utils/browser", () => ({
  isElectron: false
}));


import { getClipboardSupportMessage } from "../../../utils/clipboardUtils";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("CopyAssetButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("should render successfully with required props", () => {
      renderWithTheme(
        <CopyAssetButton contentType="image/png" url="https://example.com/image.png" />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label");
    });

    it("should render with custom tooltip", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          tooltip="Copy this image"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label", "Copy this image");
    });

    it("should render with small size", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          size="small"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should render with medium size", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          size="medium"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should render with large size", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          size="large"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should render disabled state", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          disabled
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should render with custom className", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          className="custom-class"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });

    it("should render with custom sx props", () => {
      const customSx = { color: "red" as const };
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          sx={customSx}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Tooltip behavior", () => {
    it("should show default tooltip for image type", () => {
      renderWithTheme(
        <CopyAssetButton contentType="image/png" url="https://example.com/image.png" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Copy image (paste into any image editor)");
    });

    it("should show default tooltip for video type", () => {
      renderWithTheme(
        <CopyAssetButton contentType="video/mp4" url="https://example.com/video.mp4" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Copy video info");
    });

    it("should show default tooltip for audio type", () => {
      renderWithTheme(
        <CopyAssetButton contentType="audio/mp3" url="https://example.com/audio.mp3" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Copy audio info");
    });

    it("should show default tooltip for text type", () => {
      renderWithTheme(
        <CopyAssetButton contentType="text/plain" url="https://example.com/text.txt" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Copy to clipboard");
    });

    it("should show compatibility info when enabled", () => {
      (getClipboardSupportMessage as jest.Mock).mockReturnValue("Image can be pasted into any image editor");

      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          showCompatibilityInfo
        />
      );

      expect(getClipboardSupportMessage).toHaveBeenCalledWith("image/png");
    });

    it("should use custom tooltip over default", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          tooltip="Custom tooltip text"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Custom tooltip text");
    });

    it("should support different tooltip placements", () => {
      const placements = [
        "top",
        "bottom",
        "left",
        "right",
        "bottom-end",
        "bottom-start",
        "left-end",
        "left-start",
        "right-end",
        "right-start",
        "top-end",
        "top-start"
      ] as const;

      placements.forEach((placement) => {
        const { unmount } = renderWithTheme(
          <CopyAssetButton
            contentType="image/png"
            url="https://example.com/image.png"
            tooltipPlacement={placement}
          />
        );

        const button = screen.getByRole("button");
        expect(button).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe("Copy functionality - basic interactions", () => {
    it("should render button that can be clicked", () => {
      renderWithTheme(
        <CopyAssetButton contentType="image/png" url="https://example.com/image.png" />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it("should not be interactive when disabled", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          disabled
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should accept onCopySuccess callback", () => {
      const onCopySuccess = jest.fn();

      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          onCopySuccess={onCopySuccess}
        />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should accept onCopyError callback", () => {
      const onCopyError = jest.fn();

      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          onCopyError={onCopyError}
        />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("electronOnly prop", () => {
    it("should not render when electronOnly is true and not in Electron", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          electronOnly
        />
      );

      const button = screen.queryByRole("button");
      expect(button).not.toBeInTheDocument();
    });

    it("should render when electronOnly is false regardless of environment", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          electronOnly={false}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Tab index", () => {
    it("should use default tab index", () => {
      renderWithTheme(
        <CopyAssetButton contentType="image/png" url="https://example.com/image.png" />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("tabIndex", "0");
    });

    it("should use custom tab index", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
          tabIndex={-1}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("URL handling", () => {
    it("should handle absolute URLs", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="https://example.com/image.png"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle relative URLs", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="/images/test.png"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle data URLs", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="data:image/png;base64,iVBORw0KGgoAAAANS..."
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle blob URLs", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="image/png"
          url="blob:http://example.com/uuid"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Content types", () => {
    const contentTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "audio/mp3",
      "audio/wav",
      "text/plain",
      "text/html",
      "application/json",
      "image", // Generic type
      "video", // Generic type
      "audio"  // Generic type
    ];

    contentTypes.forEach((contentType) => {
      it(`should handle ${contentType}`, () => {
        renderWithTheme(
          <CopyAssetButton
            contentType={contentType}
            url="https://example.com/test"
          />
        );

        const button = screen.getByRole("button");
        expect(button).toBeInTheDocument();
      });
    });
  });

  describe("Asset name prop", () => {
    it("should accept asset name prop", () => {
      renderWithTheme(
        <CopyAssetButton
          contentType="video/mp4"
          url="https://example.com/video.mp4"
          assetName="Test Video"
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Cleanup", () => {
    it("should clean up timeout on unmount", () => {
      const { unmount } = renderWithTheme(
        <CopyAssetButton contentType="image/png" url="https://example.com/image.png" />
      );

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });
});
