/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { useMemo, useState, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";

import { Text, FlexColumn, FlexRow, getSpacingPx, SPACING, LoadingSpinner } from "../ui_primitives";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./settingsMenuStyles";
import {
  isFileExplorerAvailable,
  isSystemDirectoryAvailable,
  openHuggingfacePath,
  openOllamaPath,
  openInstallationPath,
  openLogsPath,
  openAssetsPath,
  openInExplorer
} from "../../utils/fileExplorer";
import { isElectron } from "../../utils/browser";
import { isLocalhost } from "../../lib/env";
import { NavButton, NodeTextField, ToolbarIconButton } from "../ui_primitives";
import { SettingWithValue } from "../../stores/RemoteSettingStore";

interface FolderButtonProps {
  label: string;
  onClick: () => void;
}

const FolderButton = ({ label, onClick }: FolderButtonProps) => (
  <NavButton
    icon={<FolderOutlinedIcon />}
    label={label}
    onClick={onClick}
    sx={{
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xxl)}`,
      textTransform: "none",
      justifyContent: "flex-start",
      minWidth: "200px"
    }}
  />
);

interface OpenFolderButtonProps {
  settingValue: string | undefined;
}

const OpenFolderButton = memo(({ settingValue }: OpenFolderButtonProps) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => {
    if (settingValue) {
      openInExplorer(settingValue);
    }
  }, [settingValue]);

  if (!settingValue) {
    return null;
  }

  return (
    <ToolbarIconButton
      icon={<FolderOutlinedIcon fontSize="small" />}
      tooltip={t("screens4_3.folders.openInExplorer")}
      onClick={handleClick}
      sx={{ ml: 1 }}
    />
  );
});

OpenFolderButton.displayName = "OpenFolderButton";

const FoldersSettings = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateSettings = useRemoteSettingsStore((state) => state.updateSettings);
  const fetchSettings = useRemoteSettingsStore((state) => state.fetchSettings);
  const storeSettingsByGroup = useRemoteSettingsStore((state) => state.settingsByGroup);
  const settings = useRemoteSettingsStore((state) => state.settings);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });

  const [settingValues, setSettingValues] = useState<Record<string, string>>(
    {}
  );

  useMemo(() => {
    const settingsToUse = data || settings;
    if (settingsToUse && settingsToUse.length > 0) {
      const values: Record<string, string> = {};
      settingsToUse.forEach((setting: SettingWithValue) => {
        if (setting.value != null) {
          values[setting.env_var] = String(setting.value);
        }
      });
      setSettingValues(values);
    }
  }, [data, settings]);

  const settingsByGroup = useMemo(() => {
    let baseSettingsByGroup = storeSettingsByGroup;
    if (!baseSettingsByGroup || baseSettingsByGroup.size === 0) {
      if (!data || !Array.isArray(data)) {return new Map<string, SettingWithValue[]>();}
      const groups = new Map<string, SettingWithValue[]>();
      data.forEach((setting: SettingWithValue) => {
        const group = setting.group || "General";
        if (!groups.has(group)) {
          groups.set(group, []);
        }
        groups.get(group)!.push(setting);
      });
      baseSettingsByGroup = groups;
    }

    const filteredEntries = Array.from(baseSettingsByGroup.entries()).filter(
      ([groupName]) => groupName === "Folders"
    );
    return new Map(filteredEntries);
  }, [data, storeSettingsByGroup]);

  const updateSettingsMutation = useMutation({
    mutationFn: ({
      settings,
      secrets
    }: {
      settings: Record<string, string>;
      secrets: Record<string, string>;
    }) => updateSettings(settings, secrets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => {
      addNotification({
        content: t("screens4_3.folders.saveError", { error: error.message }),
        type: "error",
        alert: true
      });
    }
  });

  const handleChange = useCallback((envVar: string, value: string) => {
    setSettingValues((prev) => ({ ...prev, [envVar]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const settingsToSave: Record<string, string> = {};
    const secretsToSave: Record<string, string> = {};

    if (data) {
      data.forEach((setting) => {
        if (setting.group === "Folders") {
          const value = settingValues[setting.env_var];
          if (value !== undefined) {
            if (setting.is_secret) {
              secretsToSave[setting.env_var] = value;
            } else {
              settingsToSave[setting.env_var] = value;
            }
          }
        }
      });
    }

    updateSettingsMutation.mutate(
      { settings: settingsToSave, secrets: secretsToSave },
      {
        onSuccess: () => {
          addNotification({
            content: t("screens4_3.folders.saved"),
            type: "success",
            alert: true
          });
        }
      }
    );
  }, [addNotification, settingValues, updateSettingsMutation, data]);

  const theme = useTheme();

  const canOpenFolders = isElectron && isLocalhost && isFileExplorerAvailable();
  const canOpenSystemFolders = isElectron && isLocalhost && isSystemDirectoryAvailable();

  return (
    <>
      {isLoading && (
        <LoadingSpinner text={t("screens4_3.folders.loading")} />
      )}
      <div
        className="remote-settings-content"
        css={getSharedSettingsStyles(theme)}
      >
        <div className="settings-main-content">
          <Text size="giant">{t("screens4_3.folders.heading")}</Text>

          {canOpenSystemFolders && (
            <div className="settings-section">
              <Text size="big" id="system-folders">
                {t("screens4_3.folders.systemFolders")}
              </Text>
              <Text className="description" sx={{ mb: 2 }}>
                {t("screens4_3.folders.systemFoldersDescription")}
              </Text>
              <FlexColumn gap={1.5}>
                <FolderButton
                  label={t("screens4_3.folders.installation")}
                  onClick={openInstallationPath}
                />
                <FolderButton
                  label={t("screens4_3.folders.logs")}
                  onClick={openLogsPath}
                />
                <FolderButton
                  label={t("screens4_3.folders.assets")}
                  onClick={openAssetsPath}
                />
              </FlexColumn>
            </div>
          )}

          {canOpenFolders && (
            <div className="settings-section">
              <Text size="big" id="model-folders">
                {t("screens4_3.folders.modelFolders")}
              </Text>
              <Text className="description" sx={{ mb: 2 }}>
                {t("screens4_3.folders.modelFoldersDescription")}
              </Text>
              <FlexColumn gap={1.5}>
                <FolderButton
                  label={t("screens4_3.folders.huggingFaceModels")}
                  onClick={openHuggingfacePath}
                />
                <FolderButton
                  label={t("screens4_3.folders.ollamaModels")}
                  onClick={openOllamaPath}
                />
              </FlexColumn>
            </div>
          )}

          {isSuccess && settingsByGroup && settingsByGroup.size > 0 && (
            <>
              {Array.from(settingsByGroup.entries()).map(
                ([groupName, groupSettings]) => {
                  // "Custom" prefix disambiguates from the system/model folder sections above.
                  const showCustomPrefix = canOpenFolders || canOpenSystemFolders;
                  const sectionTitle = showCustomPrefix ? t("screens4_3.folders.customGroup", { groupName }) : groupName;
                  
                  return (
                    <div key={groupName} className="settings-section">
                      <Text size="big" id={groupName.toLowerCase().replace(/\s+/g, "-")}>{sectionTitle}</Text>
                      {groupSettings.map((setting) => (
                        <div key={setting.env_var} className="settings-item large">
                          <FlexRow align="flex-end" fullWidth>
                            <NodeTextField
                              type="text"
                              autoComplete="off"
                              id={`${setting.env_var.toLowerCase()}-input`}
                              label={setting.env_var.replace(/_/g, " ")}
                              value={settingValues[setting.env_var] || ""}
                              onChange={(e) =>
                                handleChange(setting.env_var, e.target.value)
                              }
                              onKeyDown={(e) => e.stopPropagation()}
                              sx={{ flex: 1 }}
                            />
                            <OpenFolderButton settingValue={settingValues[setting.env_var]} />
                          </FlexRow>
                          {setting.description && (
                            <Text className="description">
                              {setting.description}
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
              )}

              <div className="save-button-container">
                <NavButton
                  icon={<SaveIcon />}
                  label={t("screens4_3.folders.saveButton")}
                  onClick={handleSave}
                  color="primary"
                  className="save-button"
                  disabled={updateSettingsMutation.isPending}
                />
              </div>
            </>
          )}
          
          {(() => {
            const hasNoSettings = isSuccess && (!settingsByGroup || settingsByGroup.size === 0);
            const hasNoFolderButtons = !canOpenFolders && !canOpenSystemFolders;
            const showNoSettingsMessage = hasNoSettings && hasNoFolderButtons;
            
            return showNoSettingsMessage ? (
              <Text sx={{ textAlign: "center", padding: getSpacingPx(SPACING.xxxl) }}>
                {t("screens4_3.folders.empty")}
              </Text>
            ) : null;
          })()}
        </div>
      </div>
    </>
  );
};

export default FoldersSettings;
