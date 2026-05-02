/** @jsxImportSource @emotion/react */
import { memo, forwardRef, useCallback } from "react";
import { EditorButton } from "../editor_ui";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowList } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "../ui_primitives";

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
  const theme = useTheme();
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const navigate = useNavigate();

  const { data: workflowsData } = useQuery<WorkflowList>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return trpcClient.workflows.list.query({
        cursor: "",
        limit: 20
      }) as unknown as WorkflowList;
    },
    enabled: !title && !!currentWorkflowId
  });

  const workflowName = workflowsData?.workflows.find(
    (workflow) => workflow.id === currentWorkflowId
  )?.name;

  const handleNavigate = useCallback(() => {
    navigate(`/editor/${currentWorkflowId || ""}`);
  }, [navigate, currentWorkflowId]);

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
    <Tooltip title="Back to Editor" delay={TOOLTIP_ENTER_DELAY}>
      <EditorButton
        ref={ref}
        className="nav-button back-to-editor"
        onClick={handleNavigate}
        css={styles(theme)}
        {...props}
      >
        <KeyboardBackspaceIcon sx={{ fontSize: "20px", marginRight: "4px" }} />
        {buttonTitle}
      </EditorButton>
    </Tooltip>
  );
});

BackToEditorButton.displayName = "BackToEditorButton";

export default memo(BackToEditorButton);
