import React, { useCallback, useMemo } from "react";
import { Text, EditorButton } from "../ui_primitives";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useRequiredSettings } from "../../hooks/useRequiredSettings";

interface RequiredSettingsWarningProps {
  nodeType: string;
}

const RequiredSettingsWarning: React.FC<RequiredSettingsWarningProps> = React.memo(
  ({ nodeType }) => {
    const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);
    const missingSettings = useRequiredSettings(nodeType);

    const handleOpenSettings = useCallback(() => {
      const searchKey = missingSettings.length > 0 ? missingSettings[0] : undefined;
      setMenuOpen(true, 1, searchKey);
    }, [setMenuOpen, missingSettings]);

    const content = useMemo(() => {
      if (missingSettings.length === 0) {
        return null;
      }

      const settingsList = missingSettings.join(", ");
      const message =
        missingSettings.length === 1
          ? `Required setting ${settingsList} is not configured!`
          : `Required settings ${settingsList} are not configured!`;

      return (
        <>
          <Text
            className="node-status required-settings-warning"
            size="tiny"
            sx={{
              width: "100%",
              textAlign: "center",
              textTransform: "uppercase",
              padding: ".5em !important",
              marginBottom: "0"
            }}
          >
            {message}
          </Text>
          <EditorButton
            className="required-settings-button"
            variant="contained"
            color="warning"
            size="small"
            onClick={handleOpenSettings}
            sx={{
              margin: "0 1em",
              padding: ".2em 0 0",
              height: "1.8em",
              lineHeight: "1.2em",
              color: "var(--palette-grey-1000)",
              backgroundColor: "var(--palette-warning-main)",
              fontSize: "var(--fontSizeSmaller)",
              borderRadius: ".1em"
            }}
          >
            Configure in Settings
          </EditorButton>
        </>
      );
    }, [missingSettings, handleOpenSettings]);

    return content;
  }
);

RequiredSettingsWarning.displayName = "RequiredSettingsWarning";

export default RequiredSettingsWarning;
