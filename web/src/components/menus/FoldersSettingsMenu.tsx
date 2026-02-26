/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { useMemo, useState, useCallback } from "react";
import { Typography, Box } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import {
  isFileExplorerAvailable,
  isSystemDirectoryAvailable,
  openHuggingfacePath,
  openOllamaPath,
  openInstallationPath,
  openLogsPath,
  openInExplorer
} from "../../utils/fileExplorer";
import { isElectron } from "../../utils/browser";
import { isLocalhost } from "../../stores/ApiClient";
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
      padding: "0.5em 1.5em",
      textTransform: "none",
      justifyContent: "flex-start",
      minWidth: "200px"
    }}
  />
);

const FoldersSettings = () => {
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
    }
  });

  const handleChange = useCallback((envVar: string, value: string) => {
    setSettingValues((prev) => ({ ...prev, [envVar]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const settingsToSave: Record<string, string> = {};
    const secretsToSave: Record<string, string> = {};

    if (data) {
      // Iterate over all fetched settings to find those belonging to the "Folders" group
      // and are present in the current settingValues state.
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
            content: "Folder settings have been saved successfully",
            type: "success",
            alert: true
          });
        }
      }
    );
  }, [addNotification, settingValues, updateSettingsMutation, data]);

  const theme = useTheme();

  // Check if we can show folder opening buttons
  const canOpenFolders = isElectron && isLocalhost && isFileExplorerAvailable();
  const canOpenSystemFolders = isElectron && isLocalhost && isSystemDirectoryAvailable();

  // Helper to create open button for a folder setting
  const renderOpenButton = (settingValue: string | undefined) => {
    if (!canOpenFolders || !settingValue) {
      return null;
    }
    return (
      <ToolbarIconButton
        icon={<FolderOutlinedIcon fontSize="small" />}
        tooltip="Open folder in file explorer"
        onClick={() => openInExplorer(settingValue)}
        sx={{ ml: 1 }}
      />
    );
  };

  return (
    <>
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading folder settings...
        </Typography>
      )}
      <div
        className="remote-settings-content"
        css={getSharedSettingsStyles(theme)}
      >
        <div className="settings-main-content">
          <Typography variant="h1">Folder Settings</Typography>

          {/* System Folders Section - Always show when in Electron */}
          {canOpenSystemFolders && (
            <div className="settings-section">
              <Typography
                variant="h2"
                id="system-folders"
              >
                System Folders
              </Typography>
              <Typography className="description" sx={{ mb: 2 }}>
                Open important Nodetool directories in your file explorer.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <FolderButton
                  label="Nodetool Installation"
                  onClick={openInstallationPath}
                />
                <FolderButton
                  label="Nodetool Logs"
                  onClick={openLogsPath}
                />
              </Box>
            </div>
          )}

          {/* Model Folders Section */}
          {canOpenFolders && (
            <div className="settings-section">
              <Typography
                variant="h2"
                id="model-folders"
              >
                Model Folders
              </Typography>
              <Typography className="description" sx={{ mb: 2 }}>
                Open model cache directories in your file explorer.
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <FolderButton
                  label="HuggingFace Models"
                  onClick={openHuggingfacePath}
                />
                <FolderButton
                  label="Ollama Models"
                  onClick={openOllamaPath}
                />
              </Box>
            </div>
          )}

          {/* Dynamic folder settings from backend */}
          {isSuccess && settingsByGroup && settingsByGroup.size > 0 && (
            <>
              {Array.from(settingsByGroup.entries()).map(
                ([groupName, groupSettings]) => {
                  // Only add "Custom" prefix if system or model folders are visible, to differentiate
                  const showCustomPrefix = canOpenFolders || canOpenSystemFolders;
                  const sectionTitle = showCustomPrefix ? `Custom ${groupName}` : groupName;
                  
                  return (
                    <div key={groupName} className="settings-section">
                      <Typography
                        variant="h2"
                        id={groupName.toLowerCase().replace(/\s+/g, "-")}
                      >
                        {sectionTitle}
                      </Typography>
                      {groupSettings.map((setting) => (
                        <div key={setting.env_var} className="settings-item large">
                          <Box sx={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
                            <NodeTextField
                              type={setting.is_secret ? "text" : "text"}
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
                            {renderOpenButton(settingValues[setting.env_var])}
                          </Box>
                          {setting.description && (
                            <Typography className="description">
                              {setting.description}
                            </Typography>
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
                  label="SAVE FOLDER SETTINGS"
                  onClick={handleSave}
                  color="primary"
                  className="save-button"
                />
              </div>
            </>
          )}
          
          {/* Show message if no settings available and no folder buttons */}
          {(() => {
            const hasNoSettings = isSuccess && (!settingsByGroup || settingsByGroup.size === 0);
            const hasNoFolderButtons = !canOpenFolders && !canOpenSystemFolders;
            const showNoSettingsMessage = hasNoSettings && hasNoFolderButtons;
            
            return showNoSettingsMessage ? (
              <Typography sx={{ textAlign: "center", padding: "2em" }}>
                No folder settings available or defined in the &apos;Folders&apos;
                group.
              </Typography>
            ) : null;
          })()}
        </div>
      </div>
    </>
  );
};

export default FoldersSettings;
