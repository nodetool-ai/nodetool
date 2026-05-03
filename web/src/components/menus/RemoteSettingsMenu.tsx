/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";

import LoginIcon from "@mui/icons-material/Login";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useMemo, useState, useCallback, useEffect, memo } from "react";
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from "@mui/material";
import { TextInput, Text, EditorButton } from "../ui_primitives";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore, {
  type SettingWithValue
} from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import ExternalLink from "../common/ExternalLink";
import { isElectron } from "../../lib/env";
import { restFetch } from "../../lib/rest-fetch";

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
  DATA_FOR_SEO_LOGIN: "https://app.dataforseo.com/api-dashboard",
  KIMI_API_KEY: "https://platform.moonshot.ai/console/api-keys",
  AKI_API_KEY: "https://aki.io"
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
  DATA_FOR_SEO_LOGIN: "Get DataForSEO Credentials",
  KIMI_API_KEY: "Get Moonshot API Key",
  AKI_API_KEY: "Get AKI.IO API Key"
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
  DATA_FOR_SEO_LOGIN: "Go to DataForSEO dashboard",
  KIMI_API_KEY: "Go to Moonshot (Kimi) platform API keys page",
  AKI_API_KEY: "Go to AKI.IO to sign up and get your API key"
};

interface SettingItemProps {
  setting: SettingWithValue;
  value: string;
  onChange: (envVar: string, value: string) => void;
}

const SettingItem = memo(function SettingItem({
  setting,
  value,
  onChange
}: SettingItemProps) {
  const handleChange = useCallback((e: unknown) => {
    const target = e as { target: { value: string } };
    onChange(setting.env_var, target.target.value);
  }, [setting.env_var, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="settings-item large">
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
            value={value || ""}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          >
            {setting.enum.map((option: string) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <TextInput
          type={setting.is_secret ? "password" : "text"}
          autoComplete="off"
          id={`${setting.env_var.toLowerCase()}-input`}
          label={setting.env_var.replace(/_/g, " ")}
          value={value || ""}
          onChange={handleChange}
          variant="standard"
          size="small"
          onKeyDown={handleKeyDown}
        />
      )}
      {setting.description && (
        <Text className="description">
          {setting.description}
        </Text>
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
  );
});

SettingItem.displayName = "SettingItem";

const RemoteSettings = () => {
  const queryClient = useQueryClient();
  const updateSettings = useRemoteSettingsStore((state) => state.updateSettings);
  const fetchSettings = useRemoteSettingsStore((state) => state.fetchSettings);
  const storeSettingsByGroup = useRemoteSettingsStore((state) => state.settingsByGroup);
  const settings = useRemoteSettingsStore((state) => state.settings);
  const addNotification = useNotificationStore((state) => state.addNotification);

  // HuggingFace OAuth state
  const [hfOAuthLoading, setHfOAuthLoading] = useState(false);

  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });

  // Poll for HuggingFace OAuth completion
  interface HfTokenResponse {
    tokens: string[];
  }

  const { data: hfTokenData, isError: isHfTokenError } = useQuery({
    queryKey: ["hf-oauth-token"],
    queryFn: async () => {
      const response = await restFetch("/api/oauth/hf/tokens");
      if (!response.ok) {
        throw new Error("Failed to fetch HuggingFace token");
      }
      return (await response.json()) as HfTokenResponse;
    },
    refetchInterval: (query) => {
      // Handle both v4 (data) and v5 (Query object)
      const queryState = (query as unknown as { state?: { data?: unknown } }).state;
      const data = (queryState?.data ?? query) as HfTokenResponse | undefined;
      // Poll if we are loading and don't have a token yet
      if (hfOAuthLoading && !(data?.tokens && data.tokens.length > 0)) {
        return 2000;
      }
      return false;
    },
    retry: true
  });

  const isConnected = !!(hfTokenData && hfTokenData.tokens && hfTokenData.tokens.length > 0);

  // Handle OAuth completion side effects
  useEffect(() => {
    if (hfOAuthLoading) {
      if (isConnected) {
        setHfOAuthLoading(false);
        addNotification({
          content: "Successfully connected to HuggingFace",
          type: "success",
          alert: true
        });
      } else if (isHfTokenError) {
        setHfOAuthLoading(false);
        addNotification({
          content: "Failed to check HuggingFace connection",
          type: "error",
          alert: true
        });
      }
    }
  }, [hfOAuthLoading, isConnected, isHfTokenError, addNotification]);

  const [settingValues, setSettingValues] = useState<Record<string, string>>(
    {}
  );

  // Initialize setting values from fetched data or store settings (non-secrets only)
  useEffect(() => {
    const settingsToUse: SettingWithValue[] | undefined = data || settings;
    if (settingsToUse && settingsToUse.length > 0) {
      setSettingValues((prev) => {
        const newValues = { ...prev };
        let hasChanges = false;
        settingsToUse.forEach((setting) => {
          if ((!setting.is_secret) && setting.value != null) {
            const value = String(setting.value);
            // Only initialize if the key doesn't exist yet
            if (!(setting.env_var in prev) || prev[setting.env_var] !== value) {
              if (!(setting.env_var in prev)) {
                newValues[setting.env_var] = value;
                hasChanges = true;
              }
            }
          }
        });
        return hasChanges ? newValues : prev;
      });
    }
  }, [data, settings]);

  // Use settingsByGroup from store or compute from data
  const settingsByGroup = useMemo<Map<string, SettingWithValue[]>>(() => {
    // First try to use the store's grouped settings
    if (storeSettingsByGroup && storeSettingsByGroup.size > 0) {
      return storeSettingsByGroup;
    }

    // Otherwise compute from data
    if (!data || !Array.isArray(data)) { return new Map<string, SettingWithValue[]>(); }

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
        (setting) => !setting.is_secret
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

  const handleHuggingFaceOAuth = useCallback(async () => {
    setHfOAuthLoading(true);

    try {
      const response = await restFetch("/api/oauth/hf/start");
      const data = (await response.json().catch(() => null)) as
        | { auth_url?: string }
        | null;

      if (!response.ok || !data?.auth_url) {
        throw new Error("Failed to start OAuth flow");
      }

      const authUrl = data.auth_url;

      if (isElectron && window.api?.shell?.openExternal) {
        // Electron environment via IPC
        await window.api.shell.openExternal(authUrl);
      } else {
        // Web environment - open in new window/tab with security attributes
        window.open(authUrl, "_blank", "noopener,noreferrer,width=600,height=700");
      }
    } catch (error) {
      console.error("OAuth initiation failed:", error);
      setHfOAuthLoading(false);
      addNotification({
        content: "Failed to initiate HuggingFace login",
        type: "error",
        alert: true
      });
    }
  }, [addNotification]);

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
        <Text sx={{ textAlign: "center", padding: "2em" }}>
          Loading settings...
        </Text>
      )}
      {isSuccess &&
        displayedSettingsByGroup &&
        displayedSettingsByGroup.size > 0 && (
          <div
            className="remote-settings-content"
            css={getSharedSettingsStyles(theme)}
          >
            <div className="settings-main-content">
              <Text size="giant">Settings</Text>

              {/* HuggingFace OAuth Section */}
              <div className="settings-section">
                <Text
                  size="bigger"
                  id="huggingface-oauth"
                >
                  HuggingFace Authentication
                </Text>
                <div className="settings-item large">
                  <Text className="description">
                    Connect your HuggingFace account to access premium models and features
                  </Text>
                  <EditorButton
                    variant="contained"
                    color="primary"
                    onClick={handleHuggingFaceOAuth}
                    disabled={hfOAuthLoading}
                    startIcon={
                      isConnected ? (
                        <CheckCircleIcon />
                      ) : hfOAuthLoading ? null : (
                        <LoginIcon />
                      )
                    }
                    sx={{ marginTop: "1em" }}
                  >
                    {isConnected
                      ? "Connected to HuggingFace"
                      : hfOAuthLoading
                        ? "Connecting..."
                        : "Connect with HuggingFace"}
                  </EditorButton>
                </div>
              </div>

              {/* Render settings grouped by their group field */}
              {Array.from(displayedSettingsByGroup.entries()).map(
                ([groupName, groupSettings]) => (
                  <div key={groupName} className="settings-section">
                    <Text
                      size="bigger"
                      id={groupName.toLowerCase().replace(/\s+/g, "-")}
                    >
                      {groupName}
                    </Text>
                    {groupSettings
                      .filter((setting) => !setting.is_secret)
                      .map((setting) => (
                        <SettingItem
                          key={setting.env_var}
                          setting={setting}
                          value={settingValues[setting.env_var] || ""}
                          onChange={handleChange}
                        />
                      ))}
                  </div>
                )
              )}

              <div className="save-button-container">
                <EditorButton
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                  className="save-button"
                  startIcon={<SaveIcon />}
                >
                  SAVE SETTINGS
                </EditorButton>
              </div>
            </div>
          </div>
        )}
      {isSuccess &&
        (!displayedSettingsByGroup || displayedSettingsByGroup.size === 0) && (
          <Text sx={{ textAlign: "center", padding: "2em" }}>
            No settings available
          </Text>
        )}
    </>
  );
};

export default memo(RemoteSettings);
