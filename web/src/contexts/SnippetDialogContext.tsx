/**
 * SnippetDialogContext
 *
 * React Context for managing the save snippet dialog state.
 * Allows any component to trigger the save snippet dialog.
 */

import React, { createContext, useContext, useCallback, useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import SaveSnippetDialog from "../components/snippets/SaveSnippetDialog";
import { useNodeSnippets } from "../hooks/useNodeSnippets";

interface SnippetDialogContextValue {
  openSaveSnippetDialog: (nodes: Node<NodeData>[], edges: Edge[]) => void;
}

const SnippetDialogContext = createContext<SnippetDialogContextValue | undefined>(
  undefined
);

interface DialogState {
  open: boolean;
  nodeCount: number;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export const SnippetDialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { saveAsSnippet } = useNodeSnippets();
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    nodeCount: 0,
    nodes: [],
    edges: []
  });

  const openSaveSnippetDialog = useCallback(
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

  const handleCloseDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSave = useCallback(
    (name: string, description: string) => {
      try {
        saveAsSnippet(name, description, dialogState.nodes, dialogState.edges);
        handleCloseDialog();
      } catch (error) {
        console.error("Failed to save snippet:", error);
      }
    },
    [dialogState.nodes, dialogState.edges, saveAsSnippet, handleCloseDialog]
  );

  return (
    <SnippetDialogContext.Provider value={{ openSaveSnippetDialog }}>
      {children}
      <SaveSnippetDialog
        open={dialogState.open}
        nodeCount={dialogState.nodeCount}
        onConfirm={handleSave}
        onCancel={handleCloseDialog}
      />
    </SnippetDialogContext.Provider>
  );
};

export const useSnippetDialog = (): SnippetDialogContextValue => {
  const context = useContext(SnippetDialogContext);
  if (!context) {
    throw new Error("useSnippetDialog must be used within SnippetDialogProvider");
  }
  return context;
};

export default SnippetDialogProvider;
