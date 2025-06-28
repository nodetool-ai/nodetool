/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Tooltip, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import HelpIcon from "@mui/icons-material/Help";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface HelpModeToggleProps {
  helpMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const styles = (theme: any) =>
  css({
    ".help-toggle": {
      transition: "all 0.2s ease-in-out",
      border: "1px solid transparent"
    }
  });

export const HelpModeToggle: React.FC<HelpModeToggleProps> = ({
  helpMode,
  onToggle,
  disabled = false
}) => {
  const theme = useTheme();

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY}
      title={
        <div style={{ textAlign: "center" }}>
          <Typography variant="inherit">
            {helpMode ? "Help Mode ON" : "Help Mode OFF"}
          </Typography>
          <Typography variant="caption" display="block">
            {helpMode
              ? "Disable Nodetool help mode for chat."
              : "Include Nodetool help context for chat."}
          </Typography>
        </div>
      }
    >
      <IconButton
        className={`help-toggle ${helpMode ? "active" : ""}`}
        css={styles(theme)}
        onClick={() => onToggle(!helpMode)}
        disabled={disabled}
        size="small"
        color={helpMode ? "primary" : "default"}
      >
        <HelpIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};
