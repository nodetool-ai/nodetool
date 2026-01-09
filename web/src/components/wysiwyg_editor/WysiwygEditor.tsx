/**
 * WYSIWYG Editor
 *
 * Main editor component that provides a visual interface for building
 * MUI-based UI layouts. Integrates the component tree, canvas, and
 * properties panel into a three-pane layout.
 */

import React, { useCallback, useEffect } from "react";
import { Box } from "@mui/material";
import type { UISchema } from "./types";
import { ComponentTree } from "./components/ComponentTree";
import { Canvas } from "./components/Canvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { useWysiwygEditorStore } from "./hooks/useWysiwygEditorStore";

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
  rightPanelWidth = 280,
}) => {
  const { schema, setSchema, deleteNode, selectedNodeId } = useWysiwygEditorStore();

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

      // Delete selected node
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        // Don't delete if editing text
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
          return;
        }
        // Don't delete if contentEditable
        if (document.activeElement?.getAttribute("contenteditable") === "true") {
          return;
        }
        e.preventDefault();
        deleteNode(selectedNodeId);
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useWysiwygEditorStore.temporal.getState().undo();
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === "z" || e.key === "y")) {
        e.preventDefault();
        useWysiwygEditorStore.temporal.getState().redo();
      }
    },
    [selectedNodeId, deleteNode, readOnly]
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
      {/* Left Panel - Component Tree */}
      <Box
        sx={{
          width: leftPanelWidth,
          flexShrink: 0,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <ComponentTree />
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
