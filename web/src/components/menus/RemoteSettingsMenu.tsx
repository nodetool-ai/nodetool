/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";
import WarningIcon from "@mui/icons-material/Warning";
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Button,
  TextField,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from "@mui/material";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore, {
  type SettingWithValue
} from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import ExternalLink from "../common/ExternalLink";

const SETTING_LINKS: Record<string, string> = {
  OPENAI_API_KEY: "https://platform.openai.com/api-keys",
  ANTHROPIC_API_KEY: "https://console.anthropic.com/",
  GEMINI_API_KEY: "https://aistudio.google.com/app/apikey",
  OPENROUTER_API_KEY: "https://openrouter.ai/keys",
  HF_TOKEN: "https://huggingface.co/settings/tokens",
  REPLICATE_API_TOKEN: "https://replicate.com/account/api-tokens",
  AIME_API_KEY: "https://www.aime.info",
  GOOGLE_APP_PASSWORD: "https://myaccount.google.com/apppasswords",
  ELEVENLABS_API_KEY: "https://elevenlabs.io/subscription",
  FAL_API_KEY: "https://fal.ai/dashboard/keys",
  SERPAPI_API_KEY: "https://serpapi.com/manage-api-key",
  DATA_FOR_SEO_LOGIN: "https://app.dataforseo.com/api-dashboard"
};

const SETTING_BUTTON_TITLES: Record<string, string> = {
  OPENAI_API_KEY: "Get OpenAI API Key",
  ANTHROPIC_API_KEY: "Get Anthropic API Key",
  GEMINI_API_KEY: "Get Gemini API Key",
  OPENROUTER_API_KEY: "Get OpenRouter API Key",
  HF_TOKEN: "Get Hugging Face Token",
  REPLICATE_API_TOKEN: "Get Replicate API Token",
  AIME_API_KEY: "Learn more",
  GOOGLE_APP_PASSWORD: "Get Google App Password",
  ELEVENLABS_API_KEY: "Get ElevenLabs API Key",
  FAL_API_KEY: "Get Fal API Key",
  SERPAPI_API_KEY: "Get SerpAPI API Key",
  DATA_FOR_SEO_LOGIN: "Get DataForSEO Credentials"
};

const SETTING_TOOLTIPS: Record<string, string> = {
  OPENAI_API_KEY: "Go to OpenAI API key page",
  ANTHROPIC_API_KEY: "Go to Anthropic console",
  GEMINI_API_KEY: "Go to Google AI Studio to get your API key",
  OPENROUTER_API_KEY: "Go to OpenRouter keys page",
  HF_TOKEN: "Go to Hugging Face tokens page",
  REPLICATE_API_TOKEN: "Go to Replicate API tokens page",
  AIME_API_KEY: "Go to Aime info page",
  GOOGLE_APP_PASSWORD: "Go to Google account app passwords page",
  ELEVENLABS_API_KEY: "Go to ElevenLabs subscription page",
  FAL_API_KEY: "Go to Fal.ai dashboard",
  SERPAPI_API_KEY: "Go to SerpAPI key management page",
  DATA_FOR_SEO_LOGIN: "Go to DataForSEO dashboard"
};

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

  // Initialize setting values from fetched data or store settings (non-secrets only)
  useEffect(() => {
    const settingsToUse: SettingWithValue[] | undefined = data || settings;
    if (settingsToUse && settingsToUse.length > 0) {
      const values: Record<string, string> = {};
      settingsToUse.forEach((setting) => {
        if ((!setting.is_secret || SETTING_LINKS[setting.env_var]) && setting.value !== null && setting.value !== undefined) {
          values[setting.env_var] = String(setting.value);
        }
      });
      setSettingValues(values);
    }
  }, [data, settings]);

  // Use settingsByGroup from store or compute from data
  const settingsByGroup = useMemo<Map<string, SettingWithValue[]>>(() => {
    // First try to use the store's grouped settings
    if (storeSettingsByGroup && storeSettingsByGroup.size > 0) {
      return storeSettingsByGroup;
    }

    // Otherwise compute from data
    if (!data || !Array.isArray(data)) {return new Map<string, SettingWithValue[]>();}

    const groups = new Map<string, SettingWithValue[]>();
    data.forEach((setting: SettingWithValue) => {
      const group = setting.group || "General";
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(setting);
    });

    return groups;
  }, [data, storeSettingsByGroup]);

  const displayedSettingsByGroup = useMemo(() => {
    if (!settingsByGroup || settingsByGroup.size === 0) {
      return new Map<string, SettingWithValue[]>();
    }

    const filteredEntries: [string, SettingWithValue[]][] = [];

    settingsByGroup.forEach((groupSettings, groupName) => {
      if (groupName === "Folders") {
        return;
      }

      const allowedSettings = groupSettings.filter(
        (setting) => !setting.is_secret || SETTING_LINKS[setting.env_var]
      );

      if (allowedSettings.length > 0) {
        filteredEntries.push([groupName, allowedSettings]);
      }
    });

    return new Map<string, SettingWithValue[]>(filteredEntries);
  }, [settingsByGroup]);

  const updateSettingsMutation = useMutation({
    mutationFn: (args: { settings: Record<string, string>; secrets: Record<string, string> }) =>
      updateSettings(args.settings, args.secrets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
  });

  const handleChange = useCallback((envVar: string, value: string) => {
    setSettingValues((prev) => ({ ...prev, [envVar]: value }));
  }, []);

  const handleSave = useCallback(() => {
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
            css={getSharedSettingsStyles(theme)}
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
                    {groupSettings
                      .filter((setting) => !setting.is_secret || SETTING_LINKS[setting.env_var])
                      .map((setting) => (
                      <div
                        key={setting.env_var}
                        className="settings-item large"
                      >
                        {setting.enum && setting.enum.length > 0 ? (
                          <FormControl variant="standard" fullWidth>
                            <InputLabel
                              id={`${setting.env_var.toLowerCase()}-label`}
                            >
                              {setting.env_var.replace(/_/g, " ")}
                            </InputLabel>
                            <Select
                              labelId={`${setting.env_var.toLowerCase()}-label`}
                              id={`${setting.env_var.toLowerCase()}-select`}
                              value={settingValues[setting.env_var] || ""}
                              onChange={(e) =>
                                handleChange(setting.env_var, e.target.value)
                              }
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {setting.enum.map((option: string) => (
                                <MenuItem key={option} value={option}>
                                  {option}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : (
                          <TextField
                            type={setting.is_secret ? "password" : "text"}
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
                        )}
                        {setting.description && (
                          <Typography className="description">
                            {setting.description}
                          </Typography>
                        )}
                        {SETTING_LINKS[setting.env_var] && (
                          <div style={{ marginTop: "0.5em" }}>
                            <ExternalLink
                              href={SETTING_LINKS[setting.env_var]}
                              tooltipText={
                                SETTING_TOOLTIPS[setting.env_var] || ""
                              }
                            >
                              {SETTING_BUTTON_TITLES[setting.env_var] ||
                                "GET YOUR API KEY"}
                            </ExternalLink>
                          </div>
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

  const initialGroupedSettings = settings
    .filter((setting) => !setting.is_secret || SETTING_LINKS[setting.env_var])
    .reduce((acc, setting) => {
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
