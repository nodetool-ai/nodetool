/**
 * Hook for handling clipboard content paste operations.
 * 
 * This hook interprets clipboard content and creates appropriate nodes:
 * - For images: Uploads as an image asset and creates a constant Image node
 * - For HTML, RTF, and text: Creates a constant String node with the content
 * 
 * This complements useCopyPaste which handles pasting of copied nodes.
 */

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { getMousePosition } from "../../utils/MousePosition";
import { useNodes } from "../../contexts/NodeContext";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAuth from "../../stores/useAuth";
import useMetadataStore from "../../stores/MetadataStore";
import { Asset } from "../../stores/ApiTypes";
import log from "loglevel";
import { isTextInputActive } from "../../utils/browser";

/**
 * Supported clipboard content types
 */
type ClipboardContentType = "image" | "html" | "rtf" | "text" | "unknown";

/**
 * Result of reading clipboard content
 */
interface ClipboardContent {
  type: ClipboardContentType;
  data: string | Blob | null;
  mimeType?: string;
}

/**
 * Custom hook for handling clipboard content paste operations.
 * Creates appropriate nodes based on clipboard content type.
 * 
 * @returns Object containing handleContentPaste function and a check for clipboard content availability
 */
export const useClipboardContentPaste = () => {
  const reactFlow = useReactFlow();
  const { createNode, addNode, workflow } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode,
    workflow: state.workflow
  }));
  const { uploadAsset } = useAssetUpload();
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { user } = useAuth((auth) => ({ user: auth.user }));
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  /**
   * Reads image data from the clipboard using the Clipboard API
   */
  const readClipboardImage = useCallback(async (): Promise<Blob | null> => {
    try {
      // Try to read from Electron's clipboard API first
      if (window.api?.clipboard?.readImage) {
        const dataUrl = await window.api.clipboard.readImage();
        if (dataUrl && dataUrl.startsWith("data:image")) {
          // Convert data URL to Blob
          const response = await fetch(dataUrl);
          return await response.blob();
        }
      }

      // Fallback to web Clipboard API
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              return blob;
            }
          }
        }
      }
    } catch (error) {
      log.debug("Failed to read image from clipboard:", error);
    }
    return null;
  }, []);

  /**
   * Reads HTML content from the clipboard
   */
  const readClipboardHTML = useCallback(async (): Promise<string | null> => {
    try {
      // Try Electron API first
      if (window.api?.clipboard?.readHTML) {
        const html = await window.api.clipboard.readHTML();
        if (html && html.trim()) {
          return html;
        }
      }

      // Fallback to web API
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            return await blob.text();
          }
        }
      }
    } catch (error) {
      log.debug("Failed to read HTML from clipboard:", error);
    }
    return null;
  }, []);

  /**
   * Reads RTF content from the clipboard
   */
  const readClipboardRTF = useCallback(async (): Promise<string | null> => {
    try {
      // RTF is only available through Electron API
      if (window.api?.clipboard?.readRTF) {
        const rtf = await window.api.clipboard.readRTF();
        if (rtf && rtf.trim()) {
          return rtf;
        }
      }
    } catch (error) {
      log.debug("Failed to read RTF from clipboard:", error);
    }
    return null;
  }, []);

  /**
   * Reads plain text from the clipboard
   */
  const readClipboardText = useCallback(async (): Promise<string | null> => {
    try {
      // Try Electron API first
      if (window.api?.clipboard?.readText) {
        const text = await window.api.clipboard.readText();
        if (text && text.trim()) {
          return text;
        }
      }

      // Legacy Electron API
      if (window.api?.clipboard?.readText) {
        const text = await window.api.clipboard.readText();
        if (text && text.trim()) {
          return text;
        }
      }

      // Fallback to web API
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          return text;
        }
      }
    } catch (error) {
      log.debug("Failed to read text from clipboard:", error);
    }
    return null;
  }, []);

  /**
   * Checks available clipboard formats
   */
  const getAvailableFormats = useCallback(async (): Promise<string[]> => {
    try {
      if (window.api?.clipboard?.availableFormats) {
        return await window.api.clipboard.availableFormats();
      }
    } catch (error) {
      log.debug("Failed to get clipboard formats:", error);
    }
    return [];
  }, []);

  /**
   * Reads the clipboard content and determines its type
   */
  const readClipboardContent = useCallback(async (): Promise<ClipboardContent> => {
    // Check available formats to determine priority
    const formats = await getAvailableFormats();
    log.debug("Available clipboard formats:", formats);

    // Priority order: image > html > rtf > text
    // Check for image first
    const imageBlob = await readClipboardImage();
    if (imageBlob) {
      return {
        type: "image",
        data: imageBlob,
        mimeType: imageBlob.type
      };
    }

    // Check for HTML
    const html = await readClipboardHTML();
    if (html) {
      return {
        type: "html",
        data: html,
        mimeType: "text/html"
      };
    }

    // Check for RTF
    const rtf = await readClipboardRTF();
    if (rtf) {
      return {
        type: "rtf",
        data: rtf,
        mimeType: "text/rtf"
      };
    }

    // Check for plain text
    const text = await readClipboardText();
    if (text) {
      return {
        type: "text",
        data: text,
        mimeType: "text/plain"
      };
    }

    return {
      type: "unknown",
      data: null
    };
  }, [getAvailableFormats, readClipboardImage, readClipboardHTML, readClipboardRTF, readClipboardText]);

  /**
   * Creates a constant String node with the given text content
   */
  const createStringNode = useCallback(
    (content: string, position: { x: number; y: number }) => {
      const metadata = getMetadata("nodetool.constant.String");
      if (!metadata) {
        log.error("Metadata for nodetool.constant.String not found");
        return null;
      }

      const newNode = createNode(metadata, position);
      newNode.data.properties.value = content;
      addNode(newNode);
      log.info("Created String node from clipboard content");
      return newNode;
    },
    [createNode, addNode, getMetadata]
  );

  /**
   * Creates a constant Image node with the uploaded asset
   */
  const createImageNode = useCallback(
    (asset: Asset, position: { x: number; y: number }) => {
      const metadata = getMetadata("nodetool.constant.Image");
      if (!metadata) {
        log.error("Metadata for nodetool.constant.Image not found");
        return null;
      }

      const newNode = createNode(metadata, position);
      newNode.data.properties.value = {
        type: "image",
        uri: asset.get_url,
        asset_id: asset.id,
        temp_id: null
      };
      addNode(newNode);
      log.info("Created Image node from clipboard content");
      return newNode;
    },
    [createNode, addNode, getMetadata]
  );

  /**
   * Handles the paste of clipboard content.
   * Returns true if content was handled, false if not (allowing fallback to node paste).
   */
  const handleContentPaste = useCallback(async (): Promise<boolean> => {
    // Skip if user is typing in a text field (should use native paste instead)
    if (isTextInputActive()) {
      return false;
    }

    const mousePosition = getMousePosition();
    if (!mousePosition) {
      log.warn("Mouse position not available for clipboard paste");
      return false;
    }

    const position = reactFlow.screenToFlowPosition({
      x: mousePosition.x,
      y: mousePosition.y
    });

    const content = await readClipboardContent();

    switch (content.type) {
      case "image":
        if (content.data instanceof Blob) {
          // Extract file extension from MIME type with validation
          let extension = "png"; // default
          if (content.mimeType && content.mimeType.includes("/")) {
            const parts = content.mimeType.split("/");
            if (parts.length === 2 && parts[1]) {
              // Handle special cases like "image/svg+xml"
              extension = parts[1].split("+")[0] || "png";
            }
          }
          const file = new File([content.data], `clipboard-image.${extension}`, {
            type: content.mimeType || "image/png"
          });

          // Upload the image as an asset
          uploadAsset({
            file,
            workflow_id: workflow.id,
            parent_id: currentFolderId || user?.id,
            onCompleted: (uploadedAsset: Asset) => {
              createImageNode(uploadedAsset, position);
            },
            onFailed: (error: string) => {
              log.error("Failed to upload clipboard image:", error);
            }
          });
          return true;
        }
        break;

      case "html":
      case "rtf":
      case "text":
        if (typeof content.data === "string") {
          createStringNode(content.data, position);
          return true;
        }
        break;

      case "unknown":
      default:
        return false;
    }

    return false;
  }, [
    reactFlow,
    readClipboardContent,
    uploadAsset,
    workflow.id,
    currentFolderId,
    user?.id,
    createImageNode,
    createStringNode
  ]);

  /**
   * Checks if there is pasteable content in the clipboard (non-node content)
   */
  const hasClipboardContent = useCallback(async (): Promise<boolean> => {
    const content = await readClipboardContent();
    return content.type !== "unknown" && content.data !== null;
  }, [readClipboardContent]);

  return {
    handleContentPaste,
    hasClipboardContent,
    readClipboardContent
  };
};

export default useClipboardContentPaste;
