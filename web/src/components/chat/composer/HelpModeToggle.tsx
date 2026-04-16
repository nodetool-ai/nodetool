import React, { useCallback } from "react";
import HelpIcon from "@mui/icons-material/Help";
import { StateIconButton, Text, Caption } from "../../ui_primitives";

interface HelpModeToggleProps {
  helpMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const HelpModeToggle: React.FC<HelpModeToggleProps> = ({
  helpMode,
  onToggle,
  disabled = false
}) => {
  const handleClick = useCallback(() => {
    onToggle(!helpMode);
  }, [helpMode, onToggle]);

  const tooltipContent = (
    <div style={{ textAlign: "center" }}>
      <Text>
        {helpMode ? "Help Mode ON" : "Help Mode OFF"}
      </Text>
      <Caption sx={{ display: "block" }}>
        {helpMode
          ? "Disable Nodetool help mode for chat."
          : "Include Nodetool help context for chat."}
      </Caption>
    </div>
  );

  return (
    <StateIconButton
      icon={<HelpIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      ariaLabel={helpMode ? "Disable help mode" : "Enable help mode"}
      onClick={handleClick}
      disabled={disabled}
      size="small"
      isActive={helpMode}
      color={helpMode ? "primary" : "default"}
      className={`help-toggle ${helpMode ? "active" : ""}`}
    />
  );
};
