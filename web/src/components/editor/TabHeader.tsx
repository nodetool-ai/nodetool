/** @jsxImportSource @emotion/react */
import CloseIcon from "@mui/icons-material/Close";
import { isEqual } from "lodash";
import {
  DragEvent,
  MouseEvent,
  memo,
  useCallback,
  useState,
  useEffect
} from "react";
import { Menu, MenuItem } from "@mui/material";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import type { NodeStoreState } from "../../stores/NodeStore";

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
        onClick={() => onNavigate(workflow.id)}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => onDoubleClick(workflow.id)}
        onMouseDown={(e) => {
          // Middle mouse button (button 1)
          if (e.button === 1) {
            e.preventDefault();
            onClose(workflow.id);
          }
        }}
        onAuxClick={handleAuxClick}
        draggable={!isEditing}
        onDragStart={(e) => onDragStart(e, workflow.id)}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, workflow.id)}
      >
        {isEditing ? (
          <input
            type="text"
            defaultValue={workflow.name}
            autoFocus
            onBlur={(e) => onNameChange(workflow.id, e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
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
          <span className="tab-name" style={{ marginRight: "4px" }}>
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
          onClick={(e) => {
            e.stopPropagation();
            onClose(workflow.id);
          }}
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
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onClose(workflow.id);
          }}
        >
          Close Tab
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onCloseOthers(workflow.id);
          }}
        >
          Close Other Tabs
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onCloseAll();
          }}
        >
          Close All Tabs
        </MenuItem>
      </Menu>
    </>
  );
};

export default memo(TabHeader, isEqual);
