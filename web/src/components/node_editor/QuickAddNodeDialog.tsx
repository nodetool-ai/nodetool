/** @jsxImportSource @emotion/react */
/**
 * QuickAddNodeDialog - A fast, keyboard-accessible dialog for adding nodes to workflows.
 *
 * This component provides a VS Code Command Palette-like experience specifically for
 * finding and adding nodes. Users can search by node name, type, category, or tags,
 * and filter by input/output data types.
 *
 * Features:
 * - Fuzzy search across node names, types, and namespaces
 * - Keyboard navigation (arrow keys, Enter to select, Esc to close)
 * - Shows node namespace in results
 * - Opens with keyboard shortcut (Ctrl+Shift+A / Cmd+Shift+A)
 *
 * @example
 * ```tsx
 * <QuickAddNodeDialog
 *   open={open}
 *   setOpen={setOpen}
 *   reactFlowWrapper={reactFlowWrapperRef}
 * />
 * ```
 */

import { memo, useCallback, useEffect, useRef } from "react";
import { Command, CommandInput } from "cmdk";
import { Dialog } from "../ui_primitives";
import { Caption, Text, Chip } from "../ui_primitives";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import useQuickAddNodeStore from "../../stores/QuickAddNodeStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import isEqual from "fast-deep-equal";
import { useStoreWithEqualityFn } from "zustand/traditional";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "700px",
      width: "50vw",
      maxHeight: "70vh",
      background: "transparent",
      boxShadow: "none"
    },
    ".command-menu": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "var(--rounded-xl)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows[8],
      overflow: "hidden"
    },
    ".command-input": {
      padding: "16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".command-list": {
      maxHeight: "400px",
      overflowY: "auto",
      padding: "8px"
    },
    ".command-item": {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "var(--rounded-lg)",
      cursor: "pointer",
      transition: "background-color 0.15s ease",
      "&:hover, &[data-selected=true]": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&[aria-selected=true]": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".node-icon": {
      width: "32px",
      height: "32px",
      borderRadius: "var(--rounded-md)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.vars.palette.action.disabledBackground,
      color: theme.vars.palette.text.primary,
      fontSize: "14px",
      fontWeight: 600
    },
    ".node-info": {
      flex: 1,
      minWidth: 0
    },
    ".node-title": {
      fontWeight: 500,
      fontSize: "14px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".node-type": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".node-meta": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".namespace-chip": {
      fontSize: "10px",
      height: "20px"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      color: theme.vars.palette.text.secondary
    },
    ".footer-hints": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "11px",
      color: theme.vars.palette.text.secondary
    }
  });

interface QuickAddNodeDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
}

const QuickAddNodeDialog: React.FC<QuickAddNodeDialogProps> = ({
  open,
  setOpen,
  reactFlowWrapper
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const { getViewport } = useReactFlow();
  const addNode = useNodes((state) => state.addNode);
  const createNode = useNodes((state) => state.createNode);

  // Subscribe to store with selective properties using shallow equality
  const searchTerm = useStoreWithEqualityFn(
    useQuickAddNodeStore,
    (state) => state.searchTerm,
    Object.is
  );
  const searchResults = useStoreWithEqualityFn(
    useQuickAddNodeStore,
    (state) => state.searchResults,
    (a, b) => a === b || a.length === b.length
  );
  const selectedIndex = useStoreWithEqualityFn(
    useQuickAddNodeStore,
    (state) => state.selectedIndex,
    Object.is
  );

  // Get actions via selectors to avoid re-renders when unrelated state changes
  // Note: While actions are stable references in Zustand, using selectors here
  // prevents subscription to the entire store and follows the same pattern as
  // state subscriptions above for consistency.
  const setSearchTerm = useQuickAddNodeStore((state) => state.setSearchTerm);
  const setSelectedIndex = useQuickAddNodeStore((state) => state.setSelectedIndex);
  const moveSelectionUp = useQuickAddNodeStore((state) => state.moveSelectionUp);
  const moveSelectionDown = useQuickAddNodeStore((state) => state.moveSelectionDown);
  const getSelectedNode = useQuickAddNodeStore((state) => state.getSelectedNode);
  const closeDialog = useQuickAddNodeStore((state) => state.closeDialog);
  const resetFilters = useQuickAddNodeStore((state) => state.resetFilters);

  // Define callbacks before useEffect to satisfy dependency requirements
  const handleClose = useCallback(() => {
    setOpen(false);
    closeDialog();
    resetFilters();
  }, [setOpen, closeDialog, resetFilters]);

  const getNodeInitial = useCallback((title: string): string => {
    // Extract first letter or first meaningful character
    const match = title.match(/[A-Za-z0-9]/);
    return match ? match[0].toUpperCase() : "#";
  }, []);

  const handleSelectNode = useCallback(() => {
    const selectedNode = getSelectedNode();
    if (!selectedNode) {
      return;
    }

    // Calculate position - center of viewport
    const viewport = getViewport();
    const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect();
    
    let x = 0;
    let y = 0;

    if (wrapperBounds) {
      // Center in viewport
      x = (viewport.x + wrapperBounds.width / 2) / viewport.zoom - 100;
      y = (viewport.y + wrapperBounds.height / 2) / viewport.zoom - 50;
    }

    // Create and add the node
    const newNode = createNode(selectedNode, { x, y });
    addNode(newNode);

    handleClose();
  }, [getSelectedNode, getViewport, reactFlowWrapper, createNode, addNode, handleClose]);

  const handleValueChange = useCallback((value: string) => {
    setSearchTerm(value);
    // Reset selection when search changes
    setSelectedIndex(-1);
  }, [setSearchTerm, setSelectedIndex]);

  // Stable handler for mouse enter on search results using data attributes
  // to prevent creating new function references on every render
  const handleResultMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      const index = Number((e.currentTarget as HTMLElement).dataset.index);
      setSelectedIndex(index);
    },
    [setSelectedIndex]
  );

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      const focusInput = () => {
        inputRef.current?.focus();
      };
      // Small delay to ensure dialog is rendered
      const timeoutId = setTimeout(focusInput, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveSelectionDown();
          break;
        case "ArrowUp":
          e.preventDefault();
          moveSelectionUp();
          break;
        case "Enter":
          e.preventDefault();
          handleSelectNode();
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, moveSelectionUp, moveSelectionDown, handleSelectNode, handleClose]);

  return (
    <Dialog open={open} onClose={handleClose} className="quick-add-node-dialog">
      <div css={styles(theme)}>
        <Command label="Quick Add Node" className="command-menu">
          <div className="command-input">
            <CommandInput
              ref={inputRef}
              value={searchTerm}
              onValueChange={handleValueChange}
              placeholder="Search nodes by name, type, or namespace..."
            />
          </div>

          <Command.List className="command-list">
            <Command.Empty className="empty-state">
              <Text size="small">
                {searchTerm ? "No matching nodes found" : "Type to search for nodes..."}
              </Text>
            </Command.Empty>

            {searchResults.map((node, index) => {
              const title = node.title || node.node_type;
              const namespace = node.namespace || "default";

              return (
                <Command.Item
                  key={node.node_type}
                  value={node.node_type}
                  onSelect={handleSelectNode}
                  data-selected={index === selectedIndex}
                  data-index={index}
                  className="command-item"
                  onMouseEnter={handleResultMouseEnter}
                >
                  <div className="node-icon">{getNodeInitial(title)}</div>
                  <div className="node-info">
                    <Text className="node-title">{title}</Text>
                    <Text className="node-type" size="small">
                      {node.node_type}
                    </Text>
                  </div>
                  <div className="node-meta">
                    {namespace && namespace !== "default" && (
                      <Chip label={namespace} size="small" className="namespace-chip" />
                    )}
                  </div>
                </Command.Item>
              );
            })}
          </Command.List>

          {/* Footer with keyboard hints */}
          <div className="footer-hints">
            <Caption>
              {searchResults.length} {searchResults.length === 1 ? "node" : "nodes"}
            </Caption>
            <Caption>
              <span style={{ marginRight: "12px" }}>
                <kbd>↑↓</kbd> Navigate
              </span>
              <kbd>Enter</kbd> Select
              <span style={{ marginLeft: "12px" }}>
                <kbd>Esc</kbd> Close
              </span>
            </Caption>
          </div>
        </Command>
      </div>
    </Dialog>
  );
};

export default memo(QuickAddNodeDialog, isEqual);
