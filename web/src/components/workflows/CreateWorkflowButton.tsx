/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, memo } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: Theme) =>
  css({
    width: "26px",
    height: "26px",
    minWidth: "26px",
    padding: 0,
    borderRadius: "6px",
    border: "none",
    backgroundColor: theme.vars.palette.primary.main,
    transition: "background-color 140ms ease-out",
    "& svg": {
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.primary.contrastText
    },
    "&:hover": {
      backgroundColor: theme.vars.palette.primary.dark
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "2px"
    }
  });

const CreateWorkflowButton = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);

  const handleCreate = useCallback(async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow, queryClient]);

  return (
    <Tooltip title="Create new workflow" placement="left">
      <ToolbarIconButton
        icon={<AddIcon />}
        ariaLabel="Create new workflow"
        onClick={handleCreate}
        css={styles(theme)}
        nodrag={false}
      />
    </Tooltip>
  );
};

export default memo(CreateWorkflowButton);
