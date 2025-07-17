import React, { forwardRef } from "react";
import StopIcon from "@mui/icons-material/Stop";
import { IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
interface StopGenerationButtonProps {
  onClick: () => void;
}

export const StopGenerationButton = forwardRef<
  HTMLButtonElement,
  StopGenerationButtonProps
>(({ onClick }, ref) => {
  const theme = useTheme();
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
        animation: "pulse 3s ease-in-out infinite",
        "@keyframes pulse": {
          "0%, 100%": {
            backgroundColor: "#ffffff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.1)"
          },
          "50%": {
            backgroundColor: theme.palette.grey[400],
            boxShadow: "0 0 0 1px rgba(0,0,0,0.15)"
          }
        },
        "&:hover": {
          backgroundColor: "var(--palette-primary-main)",
          animation: "none", // Disable pulse on hover
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
