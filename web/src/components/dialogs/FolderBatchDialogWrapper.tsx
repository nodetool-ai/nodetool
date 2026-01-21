/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState } from "react";
import { useFolderBatchStore, BatchFile } from "../../stores/FolderBatchStore";
import { useNodes } from "../../contexts/NodeContext";
import FileBrowserDialog from "./FileBrowserDialog";
import FolderBatchDialog from "./FolderBatchDialog";
import { client } from "../../stores/ApiClient";
import { FileInfo } from "../../stores/ApiTypes";
import { contentTypeToNodeType } from "../../utils/NodeTypeMapping";
import { createErrorMessage } from "../../utils/errorHandling";
import { useNotificationStore } from "../../stores/NotificationStore";
import { findFileInputNodes, matchFileToInputNode } from "../../hooks/useFolderBatch";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";

/**
 * Get content type from file extension
 */
function getContentTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const extensionMap: Record<string, string> = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    tif: "image/tiff",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    // Audio
    mp3: "audio/mp3",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/x-m4a",
    webm: "audio/webm",
    // Video
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    html: "text/html",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  };
  return extensionMap[ext] || "application/octet-stream";
}

/**
 * Wrapper component that handles the folder selection and batch processing flow.
 * This component manages both the FileBrowserDialog and FolderBatchDialog.
 */
const FolderBatchDialogWrapper: React.FC = memo(function FolderBatchDialogWrapper() {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const { isDialogOpen, closeDialog, initializeBatch, start } = useFolderBatchStore();
  const { nodes, workflow } = useNodes((state) => ({
    nodes: state.nodes,
    workflow: state.workflow,
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);

  // When the main dialog opens, show the file browser first
  React.useEffect(() => {
    if (isDialogOpen && useFolderBatchStore.getState().state === "idle" && useFolderBatchStore.getState().files.length === 0) {
      setIsFileBrowserOpen(true);
    }
  }, [isDialogOpen]);

  const loadFolderFiles = useCallback(
    async (folderPath: string, inputNodes: Node<NodeData>[]): Promise<BatchFile[]> => {
      const { data, error } = await client.GET("/api/files/list", {
        params: { query: { path: folderPath } },
      });

      if (error) {
        throw createErrorMessage(error, "Failed to list folder contents");
      }

      const files: BatchFile[] = [];

      for (const fileInfo of data as FileInfo[]) {
        if (fileInfo.is_dir) {continue;} // Skip directories

        const contentType = getContentTypeFromExtension(fileInfo.name);
        const matchedNode = matchFileToInputNode(contentType, inputNodes);
        const matchedType = matchedNode
          ? contentTypeToNodeType(contentType)
          : null;

        files.push({
          path: fileInfo.path,
          name: fileInfo.name,
          contentType,
          matchedType,
          targetNodeId: matchedNode?.id || null,
          status: "pending",
        });
      }

      return files;
    },
    []
  );

  const handleFolderSelect = useCallback(
    async (folderPath: string) => {
      setIsFileBrowserOpen(false);

      // Find input nodes in the workflow
      const inputNodes = findFileInputNodes(nodes);

      if (inputNodes.length === 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: "No file input nodes found in the workflow. Add an Image, Audio, Video, or Document input node first.",
        });
        closeDialog();
        return;
      }

      try {
        const files = await loadFolderFiles(folderPath, inputNodes);

        if (files.length === 0) {
          addNotification({
            type: "warning",
            alert: true,
            content: "No files found in the selected folder.",
          });
          closeDialog();
          return;
        }

        const matchableFiles = files.filter((f) => f.targetNodeId !== null);
        if (matchableFiles.length === 0) {
          addNotification({
            type: "warning",
            alert: true,
            content: "No files in the folder match the workflow's input node types.",
          });
          closeDialog();
          return;
        }

        // Initialize and start batch
        initializeBatch(folderPath, files, workflow.id);
        start();
      } catch (error) {
        console.error("Failed to load folder:", error);
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to load folder contents. Please try again.",
        });
        closeDialog();
      }
    },
    [nodes, workflow.id, loadFolderFiles, initializeBatch, start, addNotification, closeDialog]
  );

  const handleFileBrowserClose = useCallback(() => {
    setIsFileBrowserOpen(false);
    // If no batch was started, close the main dialog too
    if (useFolderBatchStore.getState().files.length === 0) {
      closeDialog();
    }
  }, [closeDialog]);

  const handleBatchDialogClose = useCallback(() => {
    closeDialog();
  }, [closeDialog]);

  return (
    <>
      {/* File Browser for folder selection */}
      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={handleFileBrowserClose}
        onConfirm={handleFolderSelect}
        title="Select Folder for Batch Processing"
        selectionMode="directory"
        initialPath="~"
      />

      {/* Batch processing dialog */}
      <FolderBatchDialog
        open={isDialogOpen && !isFileBrowserOpen}
        onClose={handleBatchDialogClose}
      />
    </>
  );
});

export default FolderBatchDialogWrapper;
