/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Button, css } from "@mui/material";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: any) =>
  css({
    width: "100%",
    backgroundColor: theme.palette.c_gray0,
    "&:hover": {
      color: theme.palette.c_white,
      boxShadow: `0 0 30px ${theme.palette.c_hl1}80`
    }
  });

const BackToEditorButton: React.FC = () => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const navigate = useNavigate();

  return (
    <Button
      className="nav-button back-to-editor"
      onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
      css={styles}
    >
      <KeyboardBackspaceIcon sx={{ fontSize: "20px", marginRight: "4px" }} />
      <span>Back to Editor</span>
    </Button>
  );
};

export default memo(BackToEditorButton);
