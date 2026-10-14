import React, { useCallback } from "react";
import SettingsIcon from "@mui/icons-material/Settings";

import { openSettingsTab } from "../workspace/openPageTab";
import { ToolbarIconButton } from "../ui_primitives";
import { getShortcutTooltip } from "../../config/shortcuts";

/**
 * Header shortcut to Settings, next to the notifications bell. Opens the
 * Settings page tab the same way Cmd/Ctrl+, does.
 */
const SettingsHeaderButton: React.FC = React.memo(() => {
  const handleClick = useCallback(() => {
    openSettingsTab();
  }, []);

  return (
    <ToolbarIconButton
      className="settings-header-button command-button command-icon"
      icon={<SettingsIcon className="settings-icon" />}
      tooltip={getShortcutTooltip("openSettings")}
      ariaLabel="Settings"
      onClick={handleClick}
    />
  );
});

SettingsHeaderButton.displayName = "SettingsHeaderButton";

export default SettingsHeaderButton;
