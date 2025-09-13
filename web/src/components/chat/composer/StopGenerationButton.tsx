import React, { forwardRef } from "react";
import StopIcon from "@mui/icons-material/Stop";
import { IconButton } from "@mui/material";

interface StopGenerationButtonProps {
  onClick: () => void;
}

export const StopGenerationButton = forwardRef<
  HTMLButtonElement,
  StopGenerationButtonProps
>(({ onClick }, ref) => {
  return (
    <IconButton
      ref={ref}
      onClick={onClick}
      size="small"
      sx={(theme) => ({
        width: 36,
        height: 36,
        padding: 0,
        backgroundColor: theme.vars.palette.grey[600],
        transition: "background-color 0.15s ease, transform 0.1s ease",
        boxShadow: "none",
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[600]
        },
        "&:active": {
          transform: "translateY(1px)"
        },
        "&:disabled": {
          opacity: 0.5
        }
      })}
    >
      <StopIcon
        fontSize="small"
        sx={(theme) => ({
          color: theme.palette.text.primary
        })}
      />
    </IconButton>
  );
});

StopGenerationButton.displayName = "StopGenerationButton";
