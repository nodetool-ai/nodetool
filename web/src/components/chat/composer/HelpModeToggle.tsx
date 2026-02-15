import React, { memo, useCallback, useMemo } from "react";
import HelpIcon from "@mui/icons-material/Help";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface HelpModeToggleProps {
  helpMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const HelpModeToggle: React.FC<HelpModeToggleProps> = memo(function HelpModeToggle({
  helpMode,
  onToggle,
  disabled = false
}) {
  // Memoize tooltip content to avoid recreation on every render
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

  // Stable click handler
  const handleClick = useCallback(() => {
    onToggle(!helpMode);
  }, [helpMode, onToggle]);

  return (
    <StateIconButton
      icon={<HelpIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={handleClick}
      disabled={disabled}
      size="small"
      isActive={helpMode}
      color={helpMode ? "primary" : "default"}
      className={`help-toggle ${helpMode ? "active" : ""}`}
    />
  );
}, isEqual);
