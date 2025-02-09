/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Button } from "@mui/material";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const BackToEditorButton: React.FC = () => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const navigate = useNavigate();

  return (
    <Button
      className="nav-button back-to-editor"
      onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.1)"
        },
        borderRadius: "4px",
        padding: "6px 12px"
      }}
    >
      <KeyboardBackspaceIcon sx={{ fontSize: "20px" }} />
      <span>Back to Editor</span>
    </Button>
  );
};

export default memo(BackToEditorButton);
