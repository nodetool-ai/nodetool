/**
 * Clipboard utility functions for handling different content types
 * with Electron IPC integration for compatibility with external applications
 * like Photoshop, Word, etc.
 */

import log from "loglevel";
import type {} from "../window.d";

/**
 * Determines the appropriate clipboard operation based on asset content type
 */
export function getClipboardType(
  contentType: string
): "image" | "text" | "html" | "unsupported" {
  if (!contentType) {
    return "unsupported";
  }

  const type = contentType.toLowerCase();

  if (type.startsWith("image/")) {
    return "image";
  }

  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("javascript") ||
    type.includes("typescript")
  ) {
    return "text";
  }

  if (type.includes("html")) {
    return "html";
  }

  // Video and audio types - we'll copy their URLs/metadata as text
  if (type.startsWith("video/") || type.startsWith("audio/")) {
    return "text";
  }

  return "unsupported";
}

/**
 * Copies an asset to the clipboard using the appropriate Electron IPC method
 * based on the asset's content type
 *
 * @param contentType - The MIME type of the asset
 * @param url - The URL or data URL of the asset
 * @param assetName - Optional name of the asset for text representation
 * @returns Promise that resolves when copy is complete
 */
export async function copyAssetToClipboard(
  contentType: string,
  url: string,
  assetName?: string
): Promise<void> {
  const clipboardType = getClipboardType(contentType);

  log.info(
    `Copying asset to clipboard: type=${clipboardType}, contentType=${contentType}`
  );

  if (!window.api) {
    throw new Error("Electron API not available");
  }

  switch (clipboardType) {
    case "image":
      await copyImageToClipboard(url);
      break;

    case "html":
      await copyHtmlToClipboard(url, assetName);
      break;

    case "text":
      await copyTextToClipboard(url, contentType, assetName);
      break;

    case "unsupported":
      throw new Error(`Unsupported content type for clipboard: ${contentType}`);
  }
}

/**
 * Copies an image to clipboard in a format compatible with external applications
 */
async function copyImageToClipboard(url: string): Promise<void> {
  try {
    let dataUrl = url;

    // Only fetch if it's not already a data URL
    if (!url.startsWith("data:")) {
      // Fetch the image as a blob to avoid CORS issues
      const response = await fetch(url);
      const blob = await response.blob();

      // Convert blob to data URL
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // Use Electron's clipboard API for better compatibility
    if (window.api.clipboard?.writeImage) {
      await window.api.clipboard.writeImage(dataUrl);
    } else {
      // Fallback to legacy API
      try {
        await window.api.clipboard?.writeImage(dataUrl);
      } catch (e) {
        // If the legacy API fails or isn't present, try writing as text (fallback for some formats)
        console.warn(
          "Clipboard writeImage failed, falling back to writing as text",
          e
        );
      }
    }

    log.info("Image copied to clipboard successfully");
  } catch (error) {
    log.error("Failed to copy image to clipboard:", error);
    throw error;
  }
}

/**
 * Copies HTML content to clipboard
 */
async function copyHtmlToClipboard(
  url: string,
  _assetName?: string
): Promise<void> {
  try {
    // Fetch the HTML content
    const response = await fetch(url);
    const htmlContent = await response.text();

    if (window.api.clipboard?.writeHTML) {
      await window.api.clipboard.writeHTML(htmlContent);
      log.info("HTML copied to clipboard successfully");
    } else {
      // Fallback to text if HTML clipboard not available
      await window.api.clipboard.writeText(htmlContent);
      log.info("HTML copied as text to clipboard (fallback)");
    }
  } catch (error) {
    log.error("Failed to copy HTML to clipboard:", error);
    throw error;
  }
}

/**
 * Copies text content to clipboard
 * For non-text URLs (like video/audio), copies the URL with metadata
 */
async function copyTextToClipboard(
  url: string,
  contentType: string,
  assetName?: string
): Promise<void> {
  try {
    let textContent: string;

    // For video/audio, copy the URL and metadata
    if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
      const mediaType = contentType.startsWith("video/") ? "Video" : "Audio";
      textContent = assetName ? `${mediaType}: ${assetName}\nURL: ${url}` : url;
    } else {
      // For text files, fetch and copy the content
      try {
        const response = await fetch(url);
        textContent = await response.text();
      } catch {
        // If fetch fails, just copy the URL
        textContent = url;
      }
    }

    if (window.api.clipboard?.writeText) {
      await window.api.clipboard.writeText(textContent);
    } else {
      // Fallback to legacy API
      await window.api.clipboard.writeText(textContent);
    }

    log.info("Text copied to clipboard successfully");
  } catch (error) {
    log.error("Failed to copy text to clipboard:", error);
    throw error;
  }
}

/**
 * Helper to check if clipboard operations are supported for a given content type
 */
export function isClipboardSupported(contentType: string): boolean {
  const type = getClipboardType(contentType);
  return type !== "unsupported";
}

/**
 * Gets a user-friendly message about clipboard support for a content type
 */
export function getClipboardSupportMessage(contentType: string): string {
  const type = getClipboardType(contentType);

  switch (type) {
    case "image":
      return "Image can be pasted into Photoshop, GIMP, and other image editors";
    case "html":
      return "HTML content can be pasted into editors and browsers";
    case "text":
      if (
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/")
      ) {
        return "Media URL and metadata will be copied as text";
      }
      return "Text content can be pasted anywhere";
    case "unsupported":
      return "This content type cannot be copied to clipboard";
    default:
      return "Unknown clipboard support";
  }
}
