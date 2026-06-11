import React, { forwardRef } from "react";
import StopIcon from "@mui/icons-material/Stop";
import { ToolbarIconButton, MOTION } from "../../ui_primitives";

interface StopGenerationButtonProps {
  onClick: () => void;
}

export const StopGenerationButton = forwardRef<
  HTMLButtonElement,
  StopGenerationButtonProps
>(({ onClick }, ref) => {
  return (
    <ToolbarIconButton
      ref={ref}
      icon={<StopIcon fontSize="small" />}
      tooltip="Stop generation"
      onClick={onClick}
      nodrag={false}
      sx={(theme) => ({
        width: 36,
        height: 36,
        padding: 0,
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.text.primary,
        transition: `${MOTION.background}, ${MOTION.transform}`,
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
    />
  );
});

StopGenerationButton.displayName = "StopGenerationButton";
