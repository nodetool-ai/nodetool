/** @jsxImportSource @emotion/react */
import CloseIcon from "@mui/icons-material/Close";
import { isEqual } from "lodash";
import { DragEvent, memo, useCallback, useState, useEffect } from "react";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

// Simple hook to get dirty state for a specific workflow
const useWorkflowDirty = (workflowId: string): boolean => {
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const nodeStore = getNodeStore(workflowId);
    if (!nodeStore) {
      setIsDirty(false);
      return;
    }

    // Get initial state
    setIsDirty(nodeStore.getState().workflowIsDirty);

    // Subscribe to changes
    const unsubscribe = nodeStore.subscribe((state) => {
      setIsDirty(state.workflowIsDirty);
    });

    return unsubscribe;
  }, [getNodeStore, workflowId]);

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
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onNameChange,
  onKeyDown
}: TabHeaderProps) => {
  // Use the simple hook to get reactive dirty state
  const isWorkflowDirty = useWorkflowDirty(workflow.id);
  console.log(
    `TabHeader: workflow ${workflow.name}, isDirty: ${isWorkflowDirty}`
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
    <div
      className={`tab ${isActive ? "active" : ""} ${
        dropTarget?.id === workflow.id
          ? dropTarget?.position === "left"
            ? "drop-target"
            : "drop-target-right"
          : ""
      }`}
      onClick={() => onNavigate(workflow.id)}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onDoubleClick={() => onDoubleClick(workflow.id)}
      onMouseDown={(e) => {
        // Middle mouse button (button 1)
        if (e.button === 1) {
          e.preventDefault();
          onClose(workflow.id);
        }
      }}
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
                color: "var(--c_warning)",
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
  );
};

export default memo(TabHeader, isEqual);
