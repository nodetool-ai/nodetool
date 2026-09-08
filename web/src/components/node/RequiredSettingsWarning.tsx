import React, { useCallback, useMemo } from "react";
import { Text, EditorButton, FlexColumn, SPACING } from "../ui_primitives";
import { openSettingsTab } from "../workspace/openPageTab";
import { useRequiredSettings } from "../../hooks/useRequiredSettings";

interface RequiredSettingsWarningProps {
  nodeType: string;
}

const RequiredSettingsWarning: React.FC<RequiredSettingsWarningProps> = React.memo(
  ({ nodeType }) => {
    const missingSettings = useRequiredSettings(nodeType);

    const handleOpenSettings = useCallback(() => {
      openSettingsTab("providers");
    }, []);

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
        <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.md, py: SPACING.xs }}>
          <Text
            className="node-status required-settings-warning"
            size="smaller"
            sx={{
              width: "100%",
              textAlign: "left",
              textTransform: "none",
              color: "warning.main",
              overflowWrap: "anywhere",
              marginBottom: 0
            }}
          >
            {message}
          </Text>
          <EditorButton
            className="required-settings-button"
            variant="text"
            color="warning"
            size="small"
            onClick={handleOpenSettings}
            sx={{
              alignSelf: "flex-start",
              minHeight: 24
            }}
          >
            Configure in Settings
          </EditorButton>
        </FlexColumn>
      );
    }, [missingSettings, handleOpenSettings]);

    return content;
  }
);

RequiredSettingsWarning.displayName = "RequiredSettingsWarning";

export default RequiredSettingsWarning;
