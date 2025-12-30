import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
  sx?: any;
}

export const ResetButton: React.FC<ResetButtonProps> = ({
  onClick,
  disabled,
  tooltip = "Reset chat history",
  sx
}) => (
  <Tooltip title={tooltip}>
    <span>
      <IconButton
        className="reset-chat-button"
        onClick={() => !disabled && onClick()}
        sx={{
          p: 2,
          mt: 2,
          color: "text.secondary",
          opacity: !disabled ? 1 : 0.5,
          "&:hover": {
            backgroundColor: !disabled ? "action.hover" : "transparent"
          },
          ...sx
        }}
      >
        <RestartAltIcon fontSize="small" />
      </IconButton>
    </span>
  </Tooltip>
);
