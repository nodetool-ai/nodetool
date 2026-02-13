import React, { memo, useCallback, useMemo } from "react";
import HelpIcon from "@mui/icons-material/Help";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";

interface HelpModeToggleProps {
  helpMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const HelpModeToggle: React.FC<HelpModeToggleProps> = ({
  helpMode,
  onToggle,
  disabled = false
}) => {
  const handleToggle = useCallback(() => onToggle(!helpMode), [onToggle, helpMode]);

  const tooltipContent = useMemo(() => (
    <div style={{ textAlign: "center" }}>
      <Typography variant="inherit">
        {helpMode ? "Help Mode ON" : "Help Mode OFF"}
      </Typography>
      <Typography variant="caption" display="block">
        {helpMode
          ? "Disable Nodetool help mode for chat."
          : "Include Nodetool help context for chat."}
      </Typography>
    </div>
  ), [helpMode]);

  return (
    <StateIconButton
      icon={<HelpIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={handleToggle}
      disabled={disabled}
      size="small"
      isActive={helpMode}
      color={helpMode ? "primary" : "default"}
      className={`help-toggle ${helpMode ? "active" : ""}`}
    />
  );
};

export default memo(HelpModeToggle);
