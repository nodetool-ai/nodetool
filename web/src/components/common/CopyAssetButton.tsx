/**
 * CopyAssetButton
 *
 * A button for copying assets (images, text, html) to clipboard with visual feedback.
 * Uses Electron's clipboard API when available for compatibility with external applications.
 * Falls back to browser Clipboard API when not in Electron.
 *
 * @example
 * <CopyAssetButton
 *   contentType="image/png"
 *   url={imageUrl}
 *   tooltip="Copy image"
 * />
 */

import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import { IconButton, Tooltip } from "@mui/material";
import { SxProps, Theme, useTheme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { copyAssetToClipboard, isClipboardSupported, getClipboardSupportMessage } from "../../utils/clipboardUtils";
import { isElectron } from "../../utils/browser";
import log from "loglevel";

const FEEDBACK_TIMEOUT = 2000;

/**
 * Make a URL absolute if it's relative.
 * Required for fetch() and clipboard operations to work correctly.
 */
function makeAbsoluteUrl(url: string): string {
  if (!url) {
    return url;
  }
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Check if content type is an image type.
 * Handles both "image" and "image/*" formats.
 */
function isImageType(contentType: string): boolean {
  return contentType === "image" || contentType.startsWith("image/");
}

/**
 * Check if content type is a video type.
 * Handles both "video" and "video/*" formats.
 */
function isVideoType(contentType: string): boolean {
  return contentType === "video" || contentType.startsWith("video/");
}

/**
 * Check if content type is an audio type.
 * Handles both "audio" and "audio/*" formats.
 */
function isAudioType(contentType: string): boolean {
  return contentType === "audio" || contentType.startsWith("audio/");
}

/**
 * Check if content type is a text type.
 */
function isTextType(contentType: string): boolean {
  return contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml");
}

/**
 * Browser-based fallback for copying assets to clipboard.
 * Uses the Clipboard API available in modern browsers.
 */
async function copyAssetToClipboardBrowser(
  contentType: string,
  url: string,
  assetName?: string
): Promise<void> {
  // Make URL absolute for fetch to work
  const absoluteUrl = makeAbsoluteUrl(url);
  
  // For images, use the Clipboard API with ClipboardItem
  if (isImageType(contentType)) {
    try {
      const response = await fetch(absoluteUrl);
      const blob = await response.blob();
      
      // Convert to PNG for better compatibility (some browsers only support PNG)
      const pngBlob = await convertToPngBlob(blob);
      
      const clipboardItem = new ClipboardItem({
        "image/png": pngBlob
      });
      
      await navigator.clipboard.write([clipboardItem]);
      log.info("Image copied to clipboard via browser API");
      return;
    } catch (error) {
      log.warn("Browser clipboard image write failed, falling back to URL copy:", error);
      // Fall back to copying the URL as text
      await navigator.clipboard.writeText(absoluteUrl);
      log.info("Image URL copied to clipboard as text (fallback)");
      return;
    }
  }

  // For text-based content
  if (isTextType(contentType)) {
    try {
      const response = await fetch(absoluteUrl);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      log.info("Text content copied to clipboard via browser API");
      return;
    } catch {
      await navigator.clipboard.writeText(absoluteUrl);
      log.info("URL copied to clipboard as text (fallback)");
      return;
    }
  }

  // For video/audio, copy URL with metadata
  if (isVideoType(contentType) || isAudioType(contentType)) {
    const mediaType = isVideoType(contentType) ? "Video" : "Audio";
    const textContent = assetName ? `${mediaType}: ${assetName}\nURL: ${absoluteUrl}` : absoluteUrl;
    await navigator.clipboard.writeText(textContent);
    log.info("Media info copied to clipboard via browser API");
    return;
  }

  // Default: copy URL as text
  await navigator.clipboard.writeText(absoluteUrl);
  log.info("URL copied to clipboard as text");
}

/**
 * Convert an image blob to PNG format for clipboard compatibility.
 * Some browsers only support PNG in the clipboard.
 */
async function convertToPngBlob(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(blob);
    
    const cleanup = () => {
      URL.revokeObjectURL(blobUrl);
    };
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        cleanup();
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error("Failed to convert to PNG"));
        }
      }, "image/png");
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image"));
    };
    img.src = blobUrl;
  });
}

export interface CopyAssetButtonProps {
  /**
   * The MIME type of the asset (e.g., "image/png", "text/plain")
   */
  contentType: string;
  /**
   * The URL of the asset to copy
   */
  url: string;
  /**
   * Optional asset name for text representation (used for video/audio)
   */
  assetName?: string;
  /**
   * Tooltip text when not copied
   * @default Auto-generated based on content type
   */
  tooltip?: string;
  /**
   * Show enhanced tooltip with compatibility info
   * @default false
   */
  showCompatibilityInfo?: boolean;
  /**
   * Tooltip placement
   * @default "top"
   */
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  /**
   * Button size
   * @default "small"
   */
  size?: "small" | "medium" | "large";
  /**
   * Callback when copy succeeds
   */
  onCopySuccess?: () => void;
  /**
   * Callback when copy fails
   */
  onCopyError?: (error: Error) => void;
  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: SxProps<Theme>;
  /**
   * Only show in Electron (hides button in browser if true)
   * @default false
   */
  electronOnly?: boolean;
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

/**
 * Button for copying assets to clipboard with visual feedback.
 * Supports images, text, HTML, and provides compatibility info.
 */
export const CopyAssetButton = memo<CopyAssetButtonProps>(
  ({
    contentType,
    url,
    assetName,
    tooltip,
    showCompatibilityInfo = false,
    tooltipPlacement = "top",
    size = "small",
    onCopySuccess,
    onCopyError,
    disabled = false,
    className,
    sx,
    electronOnly = false,
    tabIndex = 0
  }) => {
    const theme = useTheme();
    const [state, setState] = useState<"idle" | "copied" | "error">("idle");
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(
      async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (disabled || !url) {
          return;
        }

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        try {
          // Use Electron API when available, otherwise use browser fallback
          if (isElectron) {
            await copyAssetToClipboard(contentType, url, assetName);
          } else {
            await copyAssetToClipboardBrowser(contentType, url, assetName);
          }
          setState("copied");
          onCopySuccess?.();
          timeoutRef.current = setTimeout(() => setState("idle"), FEEDBACK_TIMEOUT);
        } catch (error) {
          setState("error");
          onCopyError?.(error as Error);
          console.error("Failed to copy to clipboard:", error);
          timeoutRef.current = setTimeout(() => setState("idle"), FEEDBACK_TIMEOUT);
        }
      },
      [contentType, url, assetName, disabled, onCopySuccess, onCopyError]
    );

    // Don't render if electronOnly and not in Electron
    if (electronOnly && !isElectron) {
      return null;
    }

    // Don't render if content type is not supported (only check for Electron, browser can always copy URL)
    if (isElectron && !isClipboardSupported(contentType)) {
      return null;
    }

    // Generate tooltip based on content type
    const getDefaultTooltip = () => {
      if (isImageType(contentType)) {
        return "Copy image (paste into any image editor)";
      }
      if (isVideoType(contentType)) {
        return "Copy video info";
      }
      if (isAudioType(contentType)) {
        return "Copy audio info";
      }
      return "Copy to clipboard";
    };

    const tooltipText =
      state === "error"
        ? "Failed to copy"
        : state === "copied"
          ? "Copied!"
          : tooltip || getDefaultTooltip();

    const fullTooltip = showCompatibilityInfo && state === "idle" 
      ? `${tooltipText}\n${getClipboardSupportMessage(contentType)}`
      : tooltipText;

    const iconSize = size === "small" ? 14 : size === "medium" ? 18 : 22;

    return (
      <Tooltip title={fullTooltip} placement={tooltipPlacement}>
        <IconButton
          className={className}
          onClick={handleCopy}
          disabled={disabled}
          size={size}
          tabIndex={tabIndex}
          aria-label={tooltipText}
          sx={{
            width: 24,
            height: 24,
            padding: "4px",
            backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
            color: theme.vars.palette.common.white,
            borderRadius: "4px",
            "&:hover": {
              backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.85)`
            },
            "& svg": {
              fontSize: iconSize
            },
            ...sx
          }}
        >
          {state === "error" ? (
            <CloseIcon />
          ) : state === "copied" ? (
            <CheckIcon />
          ) : (
            <ContentCopyIcon />
          )}
        </IconButton>
      </Tooltip>
    );
  }
);

CopyAssetButton.displayName = "CopyAssetButton";
