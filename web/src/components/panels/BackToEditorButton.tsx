/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef } from "react";
import { Button, css } from "@mui/material";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: any) =>
  css({
    width: "fit-content",
    backgroundColor: theme.palette.c_gray0,
    "&:hover": {
      color: theme.palette.c_white,
      boxShadow: `0 0 5px ${theme.palette.c_hl1}20`
    },
    ".back-to-editor": {
      width: "fit-content"
    }
  });

const BackToEditorButton = forwardRef<HTMLButtonElement>((props, ref) => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const navigate = useNavigate();

  return (
    <Button
      ref={ref}
      className="nav-button back-to-editor"
      onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
      css={styles}
      {...props}
    >
      <KeyboardBackspaceIcon sx={{ fontSize: "20px", marginRight: "4px" }} />
      <span>Back to Editor</span>
    </Button>
  );
});

BackToEditorButton.displayName = "BackToEditorButton";

export default memo(BackToEditorButton);
