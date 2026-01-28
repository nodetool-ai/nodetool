import React from "react";
import MinimizeIcon from "@mui/icons-material/Minimize";
import { ToolbarIconButton } from "../../ui_primitives";
import { SxProps, Theme } from "@mui/material/styles";

interface MinimizeButtonProps {
  onClick: () => void;
  isMinimized: boolean;
  sx?: SxProps<Theme>;
}

export const MinimizeButton: React.FC<MinimizeButtonProps> = ({
  onClick,
  isMinimized,
  sx
}) => (
  <ToolbarIconButton
    icon={isMinimized ? <></> : <MinimizeIcon fontSize="small" />}
    tooltip={isMinimized ? "Expand" : "Minimize"}
    onClick={onClick}
    nodrag={false}
    sx={{
      color: "text.secondary",
      "&:hover": {
        backgroundColor: "action.hover"
      },
      ...sx
    }}
  />
);
