import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, EditorButton, FlexColumn, SPACING } from "../ui_primitives";
import { openSettingsTab } from "../workspace/openPageTab";
import { useRequiredSettings } from "../../hooks/useRequiredSettings";

interface RequiredSettingsWarningProps {
  nodeType: string;
}

const RequiredSettingsWarning: React.FC<RequiredSettingsWarningProps> = React.memo(
  ({ nodeType }) => {
    const { t } = useTranslation();
    const missingSettings = useRequiredSettings(nodeType);

    const handleOpenSettings = useCallback(() => {
      openSettingsTab("providers");
    }, []);

    const content = useMemo(() => {
      if (missingSettings.length === 0) {
        return null;
      }

      const settingsList = missingSettings.join(", ");
      const message = t("i18n-next61.requiredSettingsWarning.required", {
        count: missingSettings.length,
        settings: settingsList
      });

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
            onClick={handleOpenSettings}
            sx={{ alignSelf: "flex-start" }}
          >
            {t("i18n-next61.requiredSettingsWarning.configure")}
          </EditorButton>
        </FlexColumn>
      );
    }, [missingSettings, handleOpenSettings, t]);

    return content;
  }
);

RequiredSettingsWarning.displayName = "RequiredSettingsWarning";

export default RequiredSettingsWarning;
