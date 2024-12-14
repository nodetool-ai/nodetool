import React from "react";
import { IconButton } from "@mui/material";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";

interface MinimizeButtonProps {
  onClick: () => void;
  isMinimized: boolean;
  sx?: any;
}

export const MinimizeButton: React.FC<MinimizeButtonProps> = ({
  onClick,
  isMinimized,
  sx
}) => (
  <IconButton
    onClick={onClick}
    size="small"
    sx={{
      color: "text.secondary",
      "&:hover": {
        backgroundColor: "action.hover"
      },
      ...sx
    }}
  >
    {isMinimized ? <></> : <UnfoldLessIcon fontSize="small" />}
  </IconButton>
);
