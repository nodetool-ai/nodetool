/** @jsxImportSource @emotion/react */
import CloseIcon from "@mui/icons-material/Close";
import { isEqual } from "lodash";
import { DragEvent, memo } from "react";
import { WorkflowAttributes } from "../../stores/ApiTypes";

interface TabHeaderProps {
  workflow: WorkflowAttributes;
  isActive: boolean;
  isEditing: boolean;
  dropTarget: { id: string; position: "left" | "right" } | null;
  onNavigate: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onClose: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, id: string) => void;
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
  return (
    <div
      className={`tab ${isActive ? "active" : ""} ${
        dropTarget?.id === workflow.id
          ? dropTarget.position === "left"
            ? "drop-target"
            : "drop-target-right"
          : ""
      }`}
      onClick={() => onNavigate(workflow.id)}
      onDoubleClick={() => onDoubleClick(workflow.id)}
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, workflow.id)}
      onDragOver={(e) => onDragOver(e, workflow.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, workflow.id)}
    >
      {isEditing ? (
        <input
          type="text"
          defaultValue={workflow.name}
          autoFocus
          onBlur={(e) => onNameChange(workflow.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, workflow.id, e.currentTarget.value)}
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
        <span>{workflow.name}</span>
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
