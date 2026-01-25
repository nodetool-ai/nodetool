import React from "react";
import { RefreshButton } from "../../ui_primitives";

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
  <RefreshButton
    onClick={onClick}
    disabled={disabled}
    tooltip={tooltip}
    iconVariant="reset"
    buttonSize="medium"
    nodrag={false}
    sx={{
      p: 2,
      mt: 2,
      ...sx
    }}
  />
);
