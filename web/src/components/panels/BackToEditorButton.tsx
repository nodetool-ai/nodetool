/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef } from "react";
import { Button } from "@mui/material";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowList } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";

const styles = (theme: Theme) =>
  css({
    width: "fit-content",
    padding: "0.2em 0.5em",
    backgroundColor: theme.vars.palette.grey[900],

    "&:hover, &:hover .back-to-editor-title": {
      color: theme.vars.palette.grey[0],
      boxShadow: `0 0 5px ${"var(--palette-primary-main)"}20`
    },
    ".back-to-editor": {
      width: "fit-content"
    },
    ".back-to-editor-title": {
      color: theme.vars.palette.grey[100],
      marginLeft: "0.5em",
      fontSize: "var(--fontSizeSmaller)",
      transition: "color 0.25s"
    }
  });

interface BackToEditorButtonProps {
  title?: string;
}

const BackToEditorButton = forwardRef<
  HTMLButtonElement,
  BackToEditorButtonProps
>(({ title, ...props }, ref) => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const navigate = useNavigate();

  const loadWorkflows = async () => {
    const { data, error } = await client.GET("/api/workflows/", {
      params: {
        query: {
          cursor: "",
          limit: 20,
          columns: "name,id,updated_at,description,thumbnail_url"
        }
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load workflows");
    }
    return data;
  };

  const { data: workflowsData } = useQuery<WorkflowList>({
    queryKey: ["workflows"],
    queryFn: loadWorkflows,
    enabled: !title && !!currentWorkflowId
  });

  const workflowName = workflowsData?.workflows.find(
    (workflow) => workflow.id === currentWorkflowId
  )?.name;

  const buttonTitle =
    title ||
    (workflowName ? (
      <span>
        <span>Editor</span>{" "}
        <span className="back-to-editor-title">{workflowName}</span>
      </span>
    ) : (
      "Back to Editor"
    ));

  return (
    <Button
      ref={ref}
      className="nav-button back-to-editor"
      onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
      css={styles}
      {...props}
    >
      <KeyboardBackspaceIcon sx={{ fontSize: "20px", marginRight: "4px" }} />
      {buttonTitle}
    </Button>
  );
});

BackToEditorButton.displayName = "BackToEditorButton";

export default memo(BackToEditorButton);
