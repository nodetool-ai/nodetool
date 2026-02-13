/**
 * useSaveSnippetDialog
 *
 * Custom hook for managing the save snippet dialog state.
 * Handles opening the dialog with selected nodes and saving them as a snippet.
 */

import { useCallback, useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { useNodeSnippets } from "./useNodeSnippets";

interface SaveSnippetDialogState {
  open: boolean;
  nodeCount: number;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface UseSaveSnippetDialogReturn {
  /** Current dialog state */
  dialogState: SaveSnippetDialogState;
  /** Open the dialog with selected nodes */
  openDialog: (nodes: Node<NodeData>[], edges: Edge[]) => void;
  /** Close the dialog */
  closeDialog: () => void;
  /** Handle save confirmation */
  handleSave: (name: string, description: string) => void;
}

/**
 * Hook for managing the save snippet dialog
 */
export const useSaveSnippetDialog = (): UseSaveSnippetDialogReturn => {
  const { saveAsSnippet } = useNodeSnippets();
  const [dialogState, setDialogState] = useState<SaveSnippetDialogState>({
    open: false,
    nodeCount: 0,
    nodes: [],
    edges: []
  });

  const openDialog = useCallback(
    (nodes: Node<NodeData>[], edges: Edge[]) => {
      setDialogState({
        open: true,
        nodeCount: nodes.length,
        nodes,
        edges
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSave = useCallback(
    (name: string, description: string) => {
      try {
        saveAsSnippet(name, description, dialogState.nodes, dialogState.edges);
        closeDialog();
      } catch (error) {
        console.error("Failed to save snippet:", error);
      }
    },
    [dialogState.nodes, dialogState.edges, saveAsSnippet, closeDialog]
  );

  return {
    dialogState,
    openDialog,
    closeDialog,
    handleSave
  };
};

export default useSaveSnippetDialog;
