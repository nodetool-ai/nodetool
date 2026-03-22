/**
 * useComfyUINodes
 * 
 * Hook for loading and registering ComfyUI nodes dynamically.
 */

import { useEffect, useCallback } from "react";
import { useComfyUIStore } from "../../stores/ComfyUIStore";
import useMetadataStore from "../../stores/MetadataStore";
import { comfyObjectInfoToMetadataMap } from "../../utils/comfySchemaConverter";
import log from "loglevel";

/**
 * Hook to load ComfyUI node definitions and register them
 */
export function useComfyUINodes() {
  // Use selective Zustand selectors to prevent unnecessary re-renders
  const isConnected = useComfyUIStore((state) => state.isConnected);
  const objectInfo = useComfyUIStore((state) => state.objectInfo);
  const fetchObjectInfo = useComfyUIStore((state) => state.fetchObjectInfo);
  const setMetadata = useMetadataStore((state) => state.setMetadata);
  const metadata = useMetadataStore((state) => state.metadata);
  const addNodeType = useMetadataStore((state) => state.addNodeType);

  /**
   * Register a generic ComfyUI node component
   * All ComfyUI nodes use the same generic component
   */
  const registerComfyUINodeComponent = useCallback(() => {
    // Check if already registered
    if (metadata["comfy.generic"]) {
      return;
    }

    // Import and register the generic ComfyUI node component
    // For now, we'll use PlaceholderNode until we create a dedicated ComfyUI node component
    import("../../components/node_types/PlaceholderNode").then((module) => {
      addNodeType("comfy.generic", module.default);
      log.info("Registered generic ComfyUI node component");
    }).catch((error) => {
      log.error("Failed to register ComfyUI node component:", error);
    });
  }, [addNodeType, metadata]);

  /**
   * Load and register ComfyUI node metadata
   */
  const loadComfyUINodes = useCallback(async () => {
    if (!isConnected) {
      return;
    }

    try {
      // Fetch object info if not already loaded
      if (!objectInfo) {
        await fetchObjectInfo();
        return; // Will trigger again when objectInfo is set
      }

      // Convert ComfyUI schemas to NodeTool metadata
      const comfyMetadata = comfyObjectInfoToMetadataMap(objectInfo);

      // Merge with existing metadata
      setMetadata({
        ...metadata,
        ...comfyMetadata
      });

      // Register the generic node component
      registerComfyUINodeComponent();

      log.info(`Registered ${Object.keys(comfyMetadata).length} ComfyUI nodes`);
    } catch (error) {
      log.error("Failed to load ComfyUI nodes:", error);
    }
  }, [isConnected, objectInfo, fetchObjectInfo, metadata, setMetadata, registerComfyUINodeComponent]);

  /**
   * Load nodes when connected and objectInfo is available
   */
  useEffect(() => {
    if (isConnected && objectInfo) {
      loadComfyUINodes();
    }
  }, [isConnected, objectInfo, loadComfyUINodes]);

  return {
    loadComfyUINodes,
    isLoaded: isConnected && objectInfo !== null
  };
}
