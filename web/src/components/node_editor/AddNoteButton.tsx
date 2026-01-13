/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { Tooltip, Fab } from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import { COMMENT_NODE_METADATA } from "../../utils/nodeUtils";
import { getShortcutTooltip } from "../../config/shortcuts";

interface AddNoteButtonProps {
  size?: "small" | "medium" | "large";
}

const AddNoteButton: React.FC<AddNoteButtonProps> = ({ size = "medium" }) => {
  const reactFlowInstance = useReactFlow();
  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }));

  const handleAddNote = useCallback(() => {
    const position = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });

    const metadata = COMMENT_NODE_METADATA;
    const newNode = createNode(metadata, position);
    newNode.width = 150;
    newNode.height = 100;
    newNode.style = { width: 150, height: 100 };
    addNode(newNode);
  }, [createNode, addNode, reactFlowInstance]);

  const iconSize = size === "small" ? 20 : size === "large" ? 28 : 24;
  const fabSize = size === "small" ? "small" : size === "large" ? "large" : "medium";

  return (
    <Tooltip
      title={
        <div className="tooltip-span">
          <div className="tooltip-title">Add Note</div>
          <div className="tooltip-key">{getShortcutTooltip("addNote")}</div>
          <div className="tooltip-description">Add a sticky note to the canvas</div>
        </div>
      }
      arrow
      placement="left"
    >
      <Fab
        color="secondary"
        size={fabSize}
        onClick={handleAddNote}
        aria-label="Add note"
        sx={{
          borderRadius: 0,
          position: "fixed",
          top: "80px",
          right: "0px",
          width: "48px !important",
          height: "32px !important",
          zIndex: 100,
          minHeight: "unset",
          padding: size === "small" ? 0.5 : 1,
          boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
          background: "linear-gradient(90deg, #FF9800 0%, #FFC107 100%)",
          color: "white",
          "&:hover": {
            background: "linear-gradient(90deg, #F57C00 0%, #FFB300 100%)",
            boxShadow: "0 6px 20px rgba(255, 152, 0, 0.4)",
            transform: "scale(1.05)"
          },
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      >
        <AddCommentIcon sx={{ fontSize: iconSize }} />
      </Fab>
    </Tooltip>
  );
};

export default AddNoteButton;
