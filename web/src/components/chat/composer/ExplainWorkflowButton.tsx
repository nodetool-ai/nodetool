/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Tooltip,
  CircularProgress,
  Typography
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

const styles = (_theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center"
  });

interface ExplainWorkflowButtonProps {
  disabled?: boolean;
}

export const ExplainWorkflowButton: React.FC<ExplainWorkflowButtonProps> = ({
  disabled = false
}) => {
  const theme = useTheme();
  const sendMessage = useGlobalChatStore((state) => state.sendMessage);
  const status = useGlobalChatStore((state) => state.status);
  const isLoading = status === "loading" || status === "streaming";

  const handleExplainWorkflow = useCallback(async () => {
    if (isLoading || disabled) {return;}

    await sendMessage({
      type: "message",
      name: "workflow_explainer",
      role: "user",
      content: [
        {
          type: "text",
          text: "Please explain what the current workflow does. Use the ui_explain_workflow tool to analyze it and provide a detailed step-by-step explanation."
        }
      ],
      agent_mode: false,
      help_mode: false
    });
  }, [sendMessage, isLoading, disabled]);

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY}
      title={
        <div style={{ textAlign: "center" }}>
          <Typography variant="inherit">Explain Workflow</Typography>
          <Typography variant="inherit" sx={{ fontSize: "0.7rem", opacity: 0.7 }}>
            Get a step-by-step breakdown
          </Typography>
        </div>
      }
    >
      <span css={styles(theme)}>
        <IconButton
          onClick={handleExplainWorkflow}
          disabled={disabled || isLoading}
          size="small"
          sx={{
            color: theme.vars.palette.text.secondary,
            "&:hover": {
              color: theme.vars.palette.primary.light,
              background: `${theme.vars.palette.primary.main}15`
            }
          }}
        >
          {isLoading ? (
            <CircularProgress
              size={18}
              sx={{ color: theme.vars.palette.text.secondary }}
            />
          ) : (
            <AccountTreeIcon sx={{ fontSize: 20 }} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default ExplainWorkflowButton;
