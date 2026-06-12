import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useFileHandlers } from "./dropHandlerUtils";
import useAuth from "../../stores/useAuth";
import { useAddNodeFromAsset } from "./addNodeFromAsset";
import { FileHandlerResult } from "./dropHandlerUtils";
import { useNodes } from "../../contexts/NodeContext";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../lib/dragdrop";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { shallow } from "zustand/shallow";
import { instantiatePaletteNode } from "../../utils/instantiatePaletteNode";
import useMetadataStore from "../../stores/MetadataStore";
import type { SketchDragPayload, TimelineDragPayload } from "../../lib/dragdrop";

/** Horizontal spacing between nodes when dropping multiple assets */
const MULTI_NODE_HORIZONTAL_SPACING = 250;
/** Vertical spacing between nodes when dropping multiple assets */
const MULTI_NODE_VERTICAL_SPACING = 250;
/** Number of nodes per row when laying out multiple dropped assets */
const NODES_PER_ROW = 2;
const CONSTANT_SKETCH_NODE_TYPE = "nodetool.constant.Sketch";
const CONSTANT_TIMELINE_NODE_TYPE = "nodetool.constant.Timeline";

/**
 * Detects the file type based on MIME type.
 * 
 * @param file - The file to analyze
 * @returns Detected type: "png", "json", "csv", "document", or "unknown"
 */
function detectFileType(file: File): string {
  const fileName = file.name.toLowerCase();

  switch (file.type) {
    case "image/png":
      return "png";
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    case "application/pdf":
      return "document";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "document";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "document";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "document";
    default:
      if (fileName.endsWith(".png")) {
        return "png";
      }
      if (fileName.endsWith(".json")) {
        return "json";
      }
      if (fileName.endsWith(".csv")) {
        return "csv";
      }
      if (
        fileName.endsWith(".pdf") ||
        fileName.endsWith(".docx") ||
        fileName.endsWith(".xlsx") ||
        fileName.endsWith(".pptx")
      ) {
        return "document";
      }
      return "unknown";
  }
}

const isAssetResult = (value: unknown): value is Asset => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.content_type === "string"
  );
};

/**
 * Hook for handling drop events on the ReactFlow canvas.
 * 
 * This hook manages dropping various content onto the workflow canvas:
 * - External files (images, JSON, CSV, documents)
 * - Assets from the asset browser
 * - Nodes from the node menu
 * 
 * It handles file processing, node creation, and error notifications.
 * 
 * @returns Object containing onDrop and onDragOver handlers for the canvas
 * 
 * @example
 * ```typescript
 * const { onDrop, onDragOver } = useDropHandler();
 * 
 * return (
 *   <ReactFlow
 *     onDrop={onDrop}
 *     onDragOver={onDragOver}
 *   />
 * );
 * ```
 */
export interface UseDropHandlerResult {
  onDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const useDropHandler = (): UseDropHandlerResult => {
  const { handlePngFile, handleJsonFile, handleCsvFile, handleGenericFile } =
    useFileHandlers();
  const reactFlow = useReactFlow();
  const { addNode, createNode, updateNodeData } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode,
    updateNodeData: state.updateNodeData
  }), shallow);
  const getAsset = useAssetStore((state) => state.get);
  const { user } = useAuth();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const addNodeFromAsset = useAddNodeFromAsset();
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const targetIsPane = target.classList.contains("react-flow__pane");
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      // Use unified deserialization
      const dragData = deserializeDragData(event.dataTransfer);

      // Handle create-node drop
      if (dragData?.type === "create-node") {
        const nodeMeta = dragData.payload as NodeMetadata;
        const { node: newNode, afterAdd } = instantiatePaletteNode(
          nodeMeta,
          position,
          createNode
        );
        addNode(newNode);
        if (afterAdd) {
          updateNodeData(newNode.id, afterAdd);
        }
        // Track this node as recently used
        addRecentNode(nodeMeta.node_type);
        return;
      }

      // Handle asset/sketch/timeline drops on pane
      if (targetIsPane && dragData) {
        if (dragData.type === "sketch") {
          const sketch = dragData.payload as SketchDragPayload;
          const metadata = getMetadata(CONSTANT_SKETCH_NODE_TYPE);
          if (!metadata) {
            addNotification({
              type: "error",
              content: "Could not create sketch node: metadata is missing.",
              alert: true
            });
            return;
          }
          const newNode = createNode(metadata, position);
          newNode.data.properties.value = {
            type: "sketch",
            id: sketch.id
          };
          newNode.data.title = sketch.name || "Untitled sketch";
          addNode(newNode);
          addRecentNode(CONSTANT_SKETCH_NODE_TYPE);
          return;
        }

        if (dragData.type === "timeline") {
          const timeline = dragData.payload as TimelineDragPayload;
          const metadata = getMetadata(CONSTANT_TIMELINE_NODE_TYPE);
          if (!metadata) {
            addNotification({
              type: "error",
              content: "Could not create timeline node: metadata is missing.",
              alert: true
            });
            return;
          }
          const newNode = createNode(metadata, position);
          newNode.data.properties.value = {
            type: "timeline",
            id: timeline.id
          };
          newNode.data.title = timeline.name || "Untitled video";
          addNode(newNode);
          addRecentNode(CONSTANT_TIMELINE_NODE_TYPE);
          return;
        }

        if (dragData.type === "assets-multiple") {
          const selectedAssetIds = dragData.payload as string[];
          // If multiple assets are selected, create nodes for all of them
          if (selectedAssetIds.length > 1) {
            const results = await Promise.all(
              selectedAssetIds.map(async (assetId, index) => {
                // Offset each node to avoid overlap
                const offsetX =
                  (index % NODES_PER_ROW) * MULTI_NODE_HORIZONTAL_SPACING;
                const offsetY =
                  Math.floor(index / NODES_PER_ROW) *
                  MULTI_NODE_VERTICAL_SPACING;
                const nodePosition = {
                  x: position.x + offsetX,
                  y: position.y + offsetY
                };

                try {
                  const asset = await getAsset(assetId);
                  addNodeFromAsset(asset, nodePosition);
                  return { success: true };
                } catch (error) {
                  return { success: false, assetId, error };
                }
              })
            );

            const failures = results.filter((r) => !r.success);
            if (failures.length > 0) {
              console.error(
                `[drop] Failed to load ${failures.length} assets`,
                failures
              );
              addNotification({
                type: "error",
                content: `Failed to load ${failures.length} asset${failures.length > 1 ? "s" : ""}. Check console for details.`,
                alert: true
              });
            }
            return;
          } else if (selectedAssetIds.length === 1) {
            // Single asset from multiple selection
            try {
              const asset = await getAsset(selectedAssetIds[0]);
              addNodeFromAsset(asset, position);
            } catch (error) {
              console.error(
                `[drop] Failed to load asset ${selectedAssetIds[0]}`,
                error
              );
              addNotification({
                type: "error",
                content: `Failed to load asset: ${error instanceof Error ? error.message : "Unknown error"}`,
                alert: true
              });
            }
            return;
          }
        } else if (dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          try {
            const fetchedAsset = await getAsset(asset.id);
            addNodeFromAsset(fetchedAsset, position);
          } catch (error) {
            console.error(`[drop] Failed to load asset ${asset.id}`, error);
            addNotification({
              type: "error",
              content: `Failed to load asset: ${error instanceof Error ? error.message : "Unknown error"}`,
              alert: true
            });
          }
          return;
        }
      }

      // Handle external file drops
      if (hasExternalFiles(event.dataTransfer) && user) {
        const files = extractFiles(event.dataTransfer);
        console.info("[drop] External files detected", {
          count: files.length,
          names: files.map((file) => file.name)
        });
        for (const file of files) {
          const fileType = detectFileType(file);
          console.info("[drop] Processing file", {
            name: file.name,
            mime: file.type || "(empty)",
            detectedType: fileType
          });
          let result: FileHandlerResult;

          switch (fileType) {
            case "png":
              result = await handlePngFile(file, position);
              break;
            case "json":
              result = await handleJsonFile(file, position);
              break;
            case "csv":
              result = await handleCsvFile(file, position);
              break;
            default:
              result = await handleGenericFile(file, position);
          }

          if (result.success) {
            if (isAssetResult(result.data)) {
              addNodeFromAsset(result.data, position);
            }
          } else {
              addNotification({
                type: "error",
                content: `Failed to process file: ${result.error}`,
                alert: true
              });
              console.error("[drop] File processing failed", {
                name: file.name,
                error: result.error
              });
            }
          }
      } else if (hasExternalFiles(event.dataTransfer) && !user) {
        console.warn("[drop] Ignoring external file drop: no authenticated user");
      }
    },
    [
      reactFlow,
      user,
      createNode,
      addNode,
      updateNodeData,
      getAsset,
      addNodeFromAsset,
      addRecentNode,
      handlePngFile,
      handleJsonFile,
      handleCsvFile,
      handleGenericFile,
      addNotification,
      getMetadata
    ]
  );

  /* DRAG OVER */
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Use "copy" for external file drops since source apps (like Eagle)
    // may only allow "copy", causing a forbidden cursor if we force "move"
    const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
    event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
  }, []);

  return { onDrop, onDragOver };
};

export default useDropHandler;
