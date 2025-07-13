/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
import { useMemo, useState, useCallback } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";

const ExternalLinkButton = ({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <Button
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    sx={{
      padding: ".1em 1em !important",
      textDecoration: "none",
      fontSize: "var(--fontSizeSmall) !important",
      color: "var(--palette-grey-1000) !important",
      backgroundColor: "var(--palette-primary-main) !important",

      "&:hover": {
        color: "primary.light",
        textDecoration: "underline",
        filter: "brightness(1.15)"
      }
    }}
  >
    &rarr; {children}
  </Button>
);

const FoldersSettings = () => {
  const queryClient = useQueryClient();
  const {
    updateSettings,
    fetchSettings,
    settingsByGroup: storeSettingsByGroup,
    settings
  } = useRemoteSettingsStore();
  const { addNotification } = useNotificationStore();
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
      settingsToUse.forEach((setting: any) => {
        if (setting.value !== null && setting.value !== undefined) {
          values[setting.env_var] = String(setting.value);
        }
      });
      setSettingValues(values);
    }
  }, [data, settings]);

  const settingsByGroup = useMemo(() => {
    let baseSettingsByGroup = storeSettingsByGroup;
    if (!baseSettingsByGroup || baseSettingsByGroup.size === 0) {
      if (!data || !Array.isArray(data)) return new Map<string, any[]>();
      const groups = new Map<string, any[]>();
      data.forEach((setting: any) => {
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
    mutationFn: ({ settings, secrets }: { settings: any; secrets: any }) =>
      updateSettings(settings, secrets),
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

  return (
    <>
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading folder settings...
        </Typography>
      )}
      {isSuccess && settingsByGroup && settingsByGroup.size > 0 && (
        <div className="remote-settings-content" css={getSharedSettingsStyles}>
          <div className="settings-main-content">
            <Typography variant="h1">Folder Settings</Typography>

            {/* Secrets warning can be removed if no secret folder settings exist, or kept if applicable */}
            {/* <div className="secrets">
              <WarningIcon sx={{ color: "#ff9800" }} />
              <Typography>
                Keep your keys and tokens secure and do not share them publicly
              </Typography>
            </div> */}

            {Array.from(settingsByGroup.entries()).map(
              ([groupName, groupSettings]) => (
                <div key={groupName} className="settings-section">
                  <Typography
                    variant="h2"
                    id={groupName.toLowerCase().replace(/\s+/g, "-")}
                  >
                    {groupName}
                  </Typography>
                  {groupSettings.map((setting) => (
                    <div key={setting.env_var} className="settings-item large">
                      <TextField
                        type={setting.is_secret ? "text" : "text"}
                        autoComplete="off"
                        id={`${setting.env_var.toLowerCase()}-input`}
                        label={setting.env_var.replace(/_/g, " ")}
                        value={settingValues[setting.env_var] || ""}
                        onChange={(e) =>
                          handleChange(setting.env_var, e.target.value)
                        }
                        variant="standard"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      {setting.description && (
                        <Typography className="description">
                          {setting.description}
                        </Typography>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            <div className="save-button-container">
              <Button
                variant="contained"
                color="primary"
                onClick={handleSave}
                className="save-button"
                startIcon={<SaveIcon />}
              >
                SAVE FOLDER SETTINGS
              </Button>
            </div>
          </div>
        </div>
      )}
      {isSuccess && (!settingsByGroup || settingsByGroup.size === 0) && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          No folder settings available or defined in the &apos;Folders&apos;
          group.
        </Typography>
      )}
    </>
  );
};

export const getFoldersSidebarSections = () => {
  const store = useRemoteSettingsStore.getState();
  const settings = store.settings;

  const allGroupedSettings = settings.reduce((acc, setting) => {
    const groupKey = setting.group || "UnknownGroup";
    acc[groupKey] = acc[groupKey] || [];
    acc[groupKey].push(setting);
    return acc;
  }, {} as Record<string, any[]>);

  const folderGroupSettings = allGroupedSettings["Folders"] || [];

  if (folderGroupSettings.length === 0) {
    return [
      {
        category: "Folders",
        items: [{ id: "no-folder-settings", label: "No Folder Settings" }]
      }
    ];
  }

  const desiredLabels = ["Font Path", "Comfy Folder", "Chroma Path"];
  const sectionId = "folders-settings"; // Static ID for the "Folders" section group

  const items = folderGroupSettings
    .map((setting) => ({
      originalSetting: setting,
      label: setting.env_var
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char: string) => char.toUpperCase())
    }))
    .filter((settingInfo) => {
      const passesFilter = desiredLabels.includes(settingInfo.label);
      return passesFilter;
    })
    .map((settingInfo) => ({
      id: sectionId, // All items in this group point to the same section
      label: settingInfo.label
    }));

  if (items.length === 0) {
    return [
      {
        category: "Folders",
        items: [
          { id: "no-matching-folder-settings", label: "No Matching Settings" }
        ]
      }
    ];
  }

  return [
    {
      category: "Folders",
      items: items
    }
  ];
};

export default FoldersSettings;
