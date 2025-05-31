import React from "react";
import { IconButton } from "@mui/material";
import MinimizeIcon from "@mui/icons-material/Minimize";

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
    {isMinimized ? <></> : <MinimizeIcon fontSize="small" />}
  </IconButton>
);
