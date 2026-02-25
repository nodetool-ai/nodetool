/** @jsxImportSource @emotion/react */
import CloseIcon from "@mui/icons-material/Close";
import isEqual from "lodash/isEqual";
import {
  DragEvent,
  MouseEvent,
  memo,
  useCallback,
  useState,
  useEffect
} from "react";
import { Menu, MenuItem, CircularProgress } from "@mui/material";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import { useIsWorkflowRunning } from "../../hooks/useWorkflowRunnerState";

const useWorkflowDirty = (workflowId: string): boolean => {
  const nodeStore = useWorkflowManager((state) => state.nodeStores[workflowId]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!nodeStore) {
      setIsDirty(false);
      return;
    }

    // Initialize from current store state
    setIsDirty(nodeStore.getState().workflowIsDirty);

    // Subscribe to just the dirty flag changes
    const unsubscribe = nodeStore.subscribe(
      (state: NodeStoreState, prev: NodeStoreState) => {
        if (state.workflowIsDirty !== prev.workflowIsDirty) {
          setIsDirty(state.workflowIsDirty);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [nodeStore]);

  return isDirty;
};

interface TabHeaderProps {
  workflow: WorkflowAttributes;
  isActive: boolean;
  isEditing: boolean;
  dropTarget: { id: string; position: "left" | "right" } | null;
  onNavigate: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (
    e: DragEvent<HTMLDivElement>,
    id: string,
    position: "left" | "right"
  ) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onNameChange: (id: string, newName: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string, newName: string) => void;
}

const TabHeader = ({
  workflow,
  isActive,
  isEditing,
  dropTarget,
  onNavigate,
  onDoubleClick,
  onClose,
  onCloseOthers,
  onCloseAll,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onNameChange,
  onKeyDown
}: TabHeaderProps) => {
  // Use the simple hook to get reactive dirty state
  const isWorkflowDirty = useWorkflowDirty(workflow.id);
  // Check if workflow is running
  const isRunning = useIsWorkflowRunning(workflow.id);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenuPosition({ mouseX: event.clientX, mouseY: event.clientY });
  }, []);

  // Memoize click handler to prevent re-renders of child elements
  const handleClick = useCallback(() => {
    onNavigate(workflow.id);
  }, [onNavigate, workflow.id]);

  // Memoize double-click handler to prevent re-renders of child elements
  const handleDoubleClick = useCallback(() => {
    onDoubleClick(workflow.id);
  }, [onDoubleClick, workflow.id]);

  // Memoize close handler to prevent re-renders of child elements
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(workflow.id);
  }, [onClose, workflow.id]);

  const handleAuxClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        onClose(workflow.id);
      }
    },
    [onClose, workflow.id]
  );

  // Memoize mouse down handler to prevent re-renders of child elements
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Middle mouse button (button 1)
    if (e.button === 1) {
      e.preventDefault();
      onClose(workflow.id);
    }
  }, [onClose, workflow.id]);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const boundingRect = (e.target as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX;
      const position =
        mouseX < boundingRect.left + boundingRect.width / 2 ? "left" : "right";
      onDragOver(e, workflow.id, position);
    },
    [onDragOver, workflow.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        onNameChange(workflow.id, e.currentTarget.value);
      } else if (e.key === "Escape") {
        onKeyDown(e, workflow.id, e.currentTarget.value);
      }
    },
    [onKeyDown, onNameChange, workflow.id]
  );

  // Memoize drag start handler to prevent re-renders of child elements
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>) => {
    onDragStart(e, workflow.id);
  }, [onDragStart, workflow.id]);

  // Memoize drop handler to prevent re-renders of child elements
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    onDrop(e, workflow.id);
  }, [onDrop, workflow.id]);

  // Memoize context menu item handlers to prevent re-renders
  const handleCloseTab = useCallback(() => {
    closeContextMenu();
    onClose(workflow.id);
  }, [closeContextMenu, onClose, workflow.id]);

  const handleCloseOthersTab = useCallback(() => {
    closeContextMenu();
    onCloseOthers(workflow.id);
  }, [closeContextMenu, onCloseOthers, workflow.id]);

  const handleCloseAllTabs = useCallback(() => {
    closeContextMenu();
    onCloseAll();
  }, [closeContextMenu, onCloseAll]);

  // Memoize name change handlers to prevent re-renders
  const handleInputBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    onNameChange(workflow.id, e.target.value);
  }, [onNameChange, workflow.id]);

  const handleInputClick = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  }, []);

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  return (
    <>
      <div
        className={`tab ${isActive ? "active" : ""} ${
          dropTarget?.id === workflow.id
            ? dropTarget?.position === "left"
              ? "drop-target"
              : "drop-target-right"
            : ""
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onAuxClick={handleAuxClick}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
      >
        {isEditing ? (
          <input
            type="text"
            defaultValue={workflow.name}
            autoFocus
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            onClick={handleInputClick}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              padding: 0,
              fontSize: "inherit",
              width: "100%",
              outline: "none"
            }}
          />
        ) : (
          <span className="tab-name" style={{ marginRight: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
            {isRunning && (
              <CircularProgress
                size={12}
                thickness={4}
                sx={{
                  color: "var(--palette-primary-main)",
                  flexShrink: 0
                }}
              />
            )}
            {workflow.name}
            {isWorkflowDirty && (
              <span
                className="dirty-indicator"
                style={{
                  color: "var(--palette-warning-main)",
                  fontWeight: "bold",
                  marginLeft: "2px"
                }}
              >
                *
              </span>
            )}
          </span>
        )}
        <CloseIcon
          className="close-icon"
          sx={{ fontSize: 16 }}
          onClick={handleClose}
        />
      </div>
      <Menu
        open={contextMenuPosition !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuPosition
            ? {
                top: contextMenuPosition.mouseY,
                left: contextMenuPosition.mouseX
              }
            : undefined
        }
        onContextMenu={(event) => event.preventDefault()}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px"
            }
          }
        }}
      >
        <MenuItem onClick={handleCloseTab}>
          Close Tab
        </MenuItem>
        <MenuItem onClick={handleCloseOthersTab}>
          Close Other Tabs
        </MenuItem>
        <MenuItem onClick={handleCloseAllTabs}>
          Close All Tabs
        </MenuItem>
      </Menu>
    </>
  );
};

export default memo(TabHeader, isEqual);
