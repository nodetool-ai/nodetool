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
      sx={{
        width: 40,
        height: 40,
        padding: 0,
        borderRadius: "50%",
        backgroundColor: "#ffffff",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        transition: "background-color 0.2s",
        "&:hover": {
          backgroundColor: "var(--palette-primary-main)",
          "& .MuiSvgIcon-root": {
            color: "#ffffff"
          }
        }
      }}
    >
      <StopIcon
        fontSize="small"
        sx={{
          color: "var(--palette-grey-800)"
        }}
      />
    </IconButton>
  );
});

StopGenerationButton.displayName = "StopGenerationButton";
