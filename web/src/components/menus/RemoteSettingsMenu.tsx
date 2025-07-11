/** @jsxImportSource @emotion/react */
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

const RemoteSettings = () => {
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

  // Initialize setting values from fetched data or store settings
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

  // Use settingsByGroup from store or compute from data
  const settingsByGroup = useMemo(() => {
    // First try to use the store's grouped settings
    if (storeSettingsByGroup && storeSettingsByGroup.size > 0) {
      return storeSettingsByGroup;
    }

    // Otherwise compute from data
    if (!data || !Array.isArray(data)) return new Map<string, any[]>();

    const groups = new Map<string, any[]>();
    data.forEach((setting: any) => {
      const group = setting.group || "General";
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(setting);
    });

    return groups;
  }, [data, storeSettingsByGroup]);

  const displayedSettingsByGroup = useMemo(() => {
    if (!settingsByGroup) return new Map<string, any[]>();

    const filteredEntries = Array.from(settingsByGroup.entries()).filter(
      ([groupName]) => groupName !== "Folders" // Always exclude "Folders"
    );
    return new Map(filteredEntries);
  }, [settingsByGroup]);

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
    // Separate settings and secrets based on is_secret flag
    const settings: Record<string, string> = {};
    const secrets: Record<string, string> = {};

    if (data) {
      data.forEach((setting) => {
        const value = settingValues[setting.env_var];
        if (value !== undefined) {
          if (setting.is_secret) {
            secrets[setting.env_var] = value;
          } else {
            settings[setting.env_var] = value;
          }
        }
      });
    }

    updateSettingsMutation.mutate(
      { settings, secrets },
      {
        onSuccess: () => {
          addNotification({
            content: "Your settings have been saved successfully",
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
          Loading settings...
        </Typography>
      )}
      {isSuccess &&
        displayedSettingsByGroup &&
        displayedSettingsByGroup.size > 0 && (
          <div
            className="remote-settings-content"
            css={getSharedSettingsStyles}
          >
            <div className="settings-main-content">
              <Typography variant="h1">Settings</Typography>

              <div className="secrets">
                <WarningIcon sx={{ color: "#ff9800" }} />
                <Typography>
                  Keep your keys and tokens secure and do not share them
                  publicly
                </Typography>
              </div>

              {/* Render settings grouped by their group field */}
              {Array.from(displayedSettingsByGroup.entries()).map(
                ([groupName, groupSettings]) => (
                  <div key={groupName} className="settings-section">
                    <Typography
                      variant="h2"
                      id={groupName.toLowerCase().replace(/\s+/g, "-")}
                    >
                      {groupName}
                    </Typography>
                    {groupSettings.map((setting) => (
                      <div
                        key={setting.env_var}
                        className="settings-item large"
                      >
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
                  SAVE SETTINGS
                </Button>
              </div>
            </div>
          </div>
        )}
      {isSuccess &&
        (!displayedSettingsByGroup || displayedSettingsByGroup.size === 0) && (
          <Typography sx={{ textAlign: "center", padding: "2em" }}>
            No settings available
          </Typography>
        )}
    </>
  );
};

export const getRemoteSidebarSections = () => {
  const store = useRemoteSettingsStore.getState();
  const settings = store.settings;

  const initialGroupedSettings = settings.reduce((acc, setting) => {
    const groupKey = setting.group || "UnknownGroup";
    acc[groupKey] = acc[groupKey] || [];
    acc[groupKey].push(setting);
    return acc;
  }, {} as Record<string, any[]>);

  const filteredGroupEntries = Object.entries(initialGroupedSettings).filter(
    ([group]) => {
      const isFoldersGroup = group === "Folders";
      return !isFoldersGroup;
    }
  );

  const finalGroupedSettings = Object.fromEntries(filteredGroupEntries);

  if (Object.keys(finalGroupedSettings).length === 0) {
    return [
      {
        category: "API Services", // Fallback category
        items: [{ id: "no-api-settings", label: "No API Settings" }]
      }
    ];
  }

  return Object.entries(finalGroupedSettings).map(
    ([groupName, settingsArray]: [string, any[]]) => {
      const sectionId = groupName.toLowerCase().replace(/\s+/g, "-");
      const items = settingsArray
        .filter((setting) => {
          const label = setting.env_var
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char: string) => char.toUpperCase());
          const isExcludedLabel =
            label === "Font Path" || label === "Comfy Folder";
          return !isExcludedLabel;
        })
        .map((setting) => ({
          id: sectionId,
          label: setting.env_var
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char: string) => char.toUpperCase())
        }));

      return {
        category: groupName,
        items: items
      };
    }
  );
};

export default RemoteSettings;
