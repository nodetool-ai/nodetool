import React from "react";
import { Button, Tooltip } from "@mui/material";

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
      <Button
        className="reset-chat-button"
        variant="text"
        onClick={(e) => !disabled && onClick()}
        sx={{
          p: 3,
          color: "text.secondary",
          fontSize: "0.8em",
          opacity: !disabled ? 1 : 0.5,
          "&:hover": {
            backgroundColor: !disabled ? "action.hover" : "transparent"
          },
          ...sx
        }}
      >
        Reset
      </Button>
    </span>
  </Tooltip>
);
