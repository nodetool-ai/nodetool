/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
import { useMemo, useState, useCallback } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import ThemeNodetool from "../themes/ThemeNodetool";

const remoteSettingsStyles = (theme: any): SerializedStyles => {
  return css`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-top: 1em;

    .save-button-container {
      position: absolute;
      top: 49px;
      right: 10px;
      z-index: 100;
      margin: 0;
      padding: 0.75em 0;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .save-button {
      position: absolute;
      bottom: 10px;
      right: 10px;
      padding: 0.6em 2.5em;
      font-family: ${theme.fontFamily2};
      word-spacing: -0.2em;
      color: ${theme.palette.primary.contrastText};
      background-color: ${theme.palette.c_hl1};
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
      border-radius: 0.3em;
      text-transform: none;
      font-size: ${theme.fontSizeNormal};
      transition: all 0.2s ease;
      font-weight: 500;
      letter-spacing: 0.02em;
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
    }

    .show-hide-button {
      color: red;
      min-width: 18em;
      margin-top: 0.5em;
      padding: 0.5em;
    }

    h1 {
      font-size: ${theme.fontSizeGiant};
      margin: 1.5em 0 0.5em 0;
      padding: 0;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: ${theme.palette.c_white};
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 0.2em;
    }

    h2 {
      font-size: ${theme.fontSizeBigger};
      margin: 1.5em 0 0.5em 0;
      padding: 0;
      font-weight: 500;
      color: ${theme.palette.c_hl1};
      position: relative;
      display: inline-block;
    }

    .secrets {
      display: flex;
      align-items: center;
      gap: 0.8em;
      background-color: rgba(255, 152, 0, 0.1);
      padding: 0.8em 1.2em;
      border-radius: 6px;
      margin: 1em 0 2em;
      border-left: 3px solid #ff9800;
    }

    .description {
      margin-top: 1em;
      opacity: 0.8;
      font-size: 0.9em;
      line-height: 1.5;
    }

    a {
      color: ${theme.palette.primary.main};
      text-decoration: none;
      transition: color 0.2s ease;

      &:hover {
        color: ${theme.palette.primary.light};
        text-decoration: underline;
      }
    }

    .settings-section {
      backgroundcolor: rgba(30, 30, 30, 0.4);
      backdropfilter: blur(5px);
      borderradius: 8px;
      padding: 1.2em;
      margin: 1.5em 0 1.5em 0;
      boxshadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      border: 1px solid ${theme.palette.c_gray2};
      width: 100%;
      display: flex;
      flexdirection: column;
      gap: 0.8em;
    }

    .settings-item {
      display: flex;
      flexdirection: column;
      gap: 0.8em;

      &.large {
        gap: 1em;
      }

      .MuiTextField-root {
        width: 100%;
      }
    }

    .settings-main-content {
      padding: 1em 2em;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }
  `;
};

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
      color: "var(--c_black) !important",
      backgroundColor: "var(--c_hl1) !important",

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
  console.log(settingValues);

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

  return (
    <>
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading settings...
        </Typography>
      )}
      {isSuccess && settingsByGroup && settingsByGroup.size > 0 && (
        <div
          className="remote-settings-content"
          css={remoteSettingsStyles(ThemeNodetool)}
        >
          <div className="settings-main-content">
            <Typography variant="h1">Settings</Typography>

            <div className="secrets">
              <WarningIcon sx={{ color: "#ff9800" }} />
              <Typography>
                Keep your keys and tokens secure and do not share them publicly
              </Typography>
            </div>

            {/* Render settings grouped by their group field */}
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
                SAVE SETTINGS
              </Button>
            </div>
          </div>
        </div>
      )}
      {isSuccess && (!settingsByGroup || settingsByGroup.size === 0) && (
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

  // Group settings by their group field
  const groupedSettings = settings.reduce((acc, setting) => {
    acc[setting.group] = acc[setting.group] || [];
    acc[setting.group].push(setting);
    return acc;
  }, {} as Record<string, any[]>);

  // If no settings loaded yet, return default structure
  if (Object.keys(groupedSettings).length === 0) {
    return [
      {
        category: "Settings",
        items: [{ id: "settings", label: "Settings" }]
      }
    ];
  }

  return [
    {
      category: "Settings",
      items: Object.keys(groupedSettings).map((group) => ({
        id: group.toLowerCase().replace(/\s+/g, "-"), // Match the ID format used in the rendered content
        label: group
      }))
    }
  ];
};

export default RemoteSettings;
