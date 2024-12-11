import React from "react";
import { Button } from "@mui/material";
import { ClearIcon } from "@mui/x-date-pickers/icons";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  sx?: any;
}

export const ResetButton: React.FC<ResetButtonProps> = ({
  onClick,
  disabled = false,
  sx
}) => (
  <Button
    className="reset-chat-button"
    variant="text"
    startIcon={<ClearIcon />}
    onClick={onClick}
    disabled={disabled}
    sx={{
      color: "text.secondary",
      "&:hover": {
        backgroundColor: "action.hover"
      },
      ...sx
    }}
  >
    Reset Chat
  </Button>
);
