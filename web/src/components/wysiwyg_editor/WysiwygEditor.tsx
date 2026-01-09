/**
 * WYSIWYG Editor
 *
 * Main editor component that provides a visual interface for building
 * MUI-based UI layouts. Integrates the component tree, canvas, and
 * properties panel into a three-pane layout.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Box } from "@mui/material";
import type { UISchema, UISchemaNode } from "./types";
import { ComponentTree } from "./components/ComponentTree";
import { ComponentPalette } from "./components/ComponentPalette";
import { Canvas } from "./components/Canvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { useWysiwygEditorStore } from "./hooks/useWysiwygEditorStore";
import { cloneNode, addChildNode } from "./utils/schemaUtils";

/**
 * Props for the WysiwygEditor component
 */
export interface WysiwygEditorProps {
  /**
   * The UI schema value (controlled)
   */
  value?: UISchema;

  /**
   * Callback when the schema changes
   */
  onChange?: (schema: UISchema) => void;

  /**
   * Initial value (uncontrolled mode)
   */
  defaultValue?: UISchema;

  /**
   * Whether the editor is in read-only mode
   */
  readOnly?: boolean;

  /**
   * Width of the left panel (component tree)
   */
  leftPanelWidth?: number;

  /**
   * Width of the right panel (properties)
   */
  rightPanelWidth?: number;
}

/**
 * Main WYSIWYG Editor Component
 *
 * This editor allows users to visually compose UI layouts using MUI components.
 * It produces a clean JSON schema that can be rendered or transformed.
 *
 * @example
 * ```tsx
 * <WysiwygEditor
 *   value={schema}
 *   onChange={setSchema}
 * />
 * ```
 */
export const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  value,
  onChange,
  defaultValue,
  readOnly = false,
  leftPanelWidth = 240,
  rightPanelWidth = 300,
}) => {
  const { schema, setSchema, deleteNode, duplicateNode, selectedNodeId, getSelectedNode } = useWysiwygEditorStore();
  const clipboardRef = useRef<UISchemaNode | null>(null);

  // Initialize with value or defaultValue
  useEffect(() => {
    if (value) {
      setSchema(value);
    } else if (defaultValue) {
      setSchema(defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update store when controlled value changes
  useEffect(() => {
    if (value && JSON.stringify(value) !== JSON.stringify(schema)) {
      setSchema(value);
    }
  }, [value, setSchema, schema]);

  // Notify parent of changes
  useEffect(() => {
    if (onChange && !readOnly) {
      onChange(schema);
    }
  }, [schema, onChange, readOnly]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readOnly) {
        return;
      }

      // Check if we're in an input element
      const isInInput = 
        document.activeElement?.tagName === "INPUT" || 
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true";

      // Delete selected node (Delete/Backspace)
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && !isInInput) {
        e.preventDefault();
        deleteNode(selectedNodeId);
        return;
      }

      // Copy: Ctrl/Cmd + C
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isInInput && selectedNodeId) {
        e.preventDefault();
        const selectedNode = getSelectedNode();
        if (selectedNode && selectedNode.id !== schema.root.id) {
          clipboardRef.current = cloneNode(selectedNode);
        }
        return;
      }

      // Paste: Ctrl/Cmd + V
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isInInput && clipboardRef.current) {
        e.preventDefault();
        const parentId = selectedNodeId || schema.root.id;
        const pastedNode = cloneNode(clipboardRef.current);
        
        // Add the cloned node to the selected parent or root
        const currentRoot = useWysiwygEditorStore.getState().schema.root;
        const newRoot = addChildNode(currentRoot, parentId, pastedNode);
        if (newRoot !== currentRoot) {
          setSchema({ ...schema, root: newRoot });
          useWysiwygEditorStore.getState().selectNode(pastedNode.id);
        }
        return;
      }

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && !isInInput && selectedNodeId) {
        e.preventDefault();
        duplicateNode(selectedNodeId);
        return;
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useWysiwygEditorStore.temporal.getState().undo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === "z") || e.key === "y")) {
        e.preventDefault();
        useWysiwygEditorStore.temporal.getState().redo();
        return;
      }
    },
    [selectedNodeId, deleteNode, duplicateNode, getSelectedNode, readOnly, schema, setSchema]
  );

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* Left Panel - Component Tree + Palette */}
      <Box
        sx={{
          width: leftPanelWidth,
          flexShrink: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        {/* Component Tree - Top half */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ComponentTree />
        </Box>
        
        {/* Component Palette - Bottom half */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ComponentPalette />
        </Box>
      </Box>

      {/* Center - Canvas */}
      <Box
        sx={{
          flex: 1,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Canvas />
      </Box>

      {/* Right Panel - Properties */}
      {!readOnly && (
        <Box
          sx={{
            width: rightPanelWidth,
            flexShrink: 0,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <PropertiesPanel />
        </Box>
      )}
    </Box>
  );
};

export default WysiwygEditor;
