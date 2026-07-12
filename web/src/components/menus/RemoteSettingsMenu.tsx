/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";

import { useMemo, useState, useCallback, useEffect, memo, Fragment } from "react";

import {
  TextInput,
  Text,
  EditorButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from "../ui_primitives";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import useRemoteSettingsStore, {
  type SettingWithValue
} from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  MODEL_QUERY_KEYS,
  PROVIDER_QUERY_KEYS
} from "../../stores/resourceChangeHandler";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./settingsMenuStyles";
import { formatSettingLabel } from "./settingsLabel";
import ExternalLink from "../common/ExternalLink";
import SearchProviderSection from "./SearchProviderSection";

/**
 * Groups surfaced elsewhere (General tab, Folders panel) or via
 * SearchProviderSection, so they are not echoed by the generic list.
 */
const HIDDEN_SETTING_GROUPS = new Set([
  "Folders",
  "Search",
  "Execution",
  "Autosave" // already surfaced on the General tab
]);
/** Search-provider settings rendered by SearchProviderSection, not the generic list. */
const SEARCH_RELATED_SETTINGS = new Set([
  "SERP_PROVIDER",
  "SERPAPI_API_KEY",
  "DATA_FOR_SEO_LOGIN",
  "DATA_FOR_SEO_PASSWORD",
  "BRAVE_API_KEY",
  "APIFY_API_KEY"
]);

/**
 * Ordered meta-sections shown on the Integrations tab. Each maps one or more
 * registry groups to a single, stable heading so the panel doesn't just echo
 * raw backend group names. `groups` also defines the preferred display order
 * within the section. The trailing "Other" section catches any future registry
 * group that isn't mapped, so nothing silently disappears.
 */
const META_SECTION_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  groups: ReadonlyArray<string>;
}> = [
  {
    key: "local-model-servers",
    label: "Local Model Servers",
    groups: ["vLLM", "Ollama", "LlamaCpp", "LMStudio", "TransformersJs"]
  },
  {
    key: "provider-options",
    label: "Provider Options",
    groups: ["ZAI", "KIE"]
  },
  {
    key: "observability",
    label: "Observability",
    groups: ["Observability", "Traceloop"]
  },
  {
    key: "data-and-storage",
    label: "Data & Storage",
    groups: ["NodeSupabase", "Supabase"]
  },
  { key: "other", label: "Other", groups: [] }
];

/** Inverted, lowercased lookup: registry group (lowercase) → meta-section key. */
const GROUP_SECTIONS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const section of META_SECTION_GROUPS) {
    for (const group of section.groups) {
      map[group.toLowerCase()] = section.key;
    }
  }
  return map;
})();

export interface MetaSectionEntry {
  group: string;
  settings: SettingWithValue[];
}

export interface MetaSection {
  key: string;
  label: string;
  entries: MetaSectionEntry[];
}

export interface DisplayedGroup {
  id: string;
  label: string;
}

/**
 * Partitions visible registry groups into the fixed meta-section order. Shared
 * by the panel (rendering) and getDisplayedSettingGroups (sidebar) so the two
 * stay in sync and never drift.
 */
const partitionByMetaSection = (
  visibleGroups: Map<string, SettingWithValue[]>
): MetaSection[] => {
  const sections: MetaSection[] = [];
  for (const section of META_SECTION_GROUPS) {
    const entries: MetaSectionEntry[] = [];
    if (section.key === "other") {
      // Unmapped (future) groups, in backend order.
      for (const [groupName, settings] of visibleGroups) {
        if (groupName.toLowerCase() in GROUP_SECTIONS) continue;
        entries.push({ group: groupName, settings });
      }
    } else {
      // Known groups, in the section's preferred display order.
      for (const preferred of section.groups) {
        for (const [groupName, settings] of visibleGroups) {
          if (groupName.toLowerCase() === preferred.toLowerCase()) {
            entries.push({ group: groupName, settings });
          }
        }
      }
    }
    if (entries.length > 0) {
      sections.push({ key: section.key, label: section.label, entries });
    }
  }
  return sections;
};

/**
 * Meta-sections the Integrations panel actually renders, in order — used to
 * build the sidebar so it mirrors the visible sections. The Web-search entry
 * (rendered by SearchProviderSection) is inserted right after Local Model
 * Servers, matching the panel layout.
 */
export const getDisplayedSettingGroups = (
  settings: SettingWithValue[]
): DisplayedGroup[] => {
  const visibleGroups = new Map<string, SettingWithValue[]>();
  for (const setting of settings) {
    if (
      HIDDEN_SETTING_GROUPS.has(setting.group) ||
      setting.is_secret ||
      SEARCH_RELATED_SETTINGS.has(setting.env_var)
    ) {
      continue;
    }
    if (!visibleGroups.has(setting.group)) {
      visibleGroups.set(setting.group, []);
    }
    visibleGroups.get(setting.group)!.push(setting);
  }
  if (visibleGroups.size === 0) {
    return [];
  }
  const presentKeys = new Set(
    partitionByMetaSection(visibleGroups).map((s) => s.key)
  );
  const result: DisplayedGroup[] = [];
  for (const section of META_SECTION_GROUPS) {
    if (presentKeys.has(section.key)) {
      result.push({ id: section.key, label: section.label });
    }
    // SearchProviderSection always renders alongside the registry list, so
    // the sidebar always lists it at this slot (after Local Model Servers).
    if (section.key === "local-model-servers") {
      result.push({ id: "search-provider", label: "Search Provider" });
    }
  }
  return result;
};

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
  BRAVE_API_KEY: "https://api-dashboard.search.brave.com/",
  APIFY_API_KEY: "https://console.apify.com/account/integrations",
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
  BRAVE_API_KEY: "Get Brave API Key",
  APIFY_API_KEY: "Get Apify API Key",
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
  BRAVE_API_KEY: "Go to Brave Search API dashboard",
  APIFY_API_KEY: "Go to Apify console integrations page",
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
            {formatSettingLabel(setting.env_var)}
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
          label={formatSettingLabel(setting.env_var)}
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

  const settingsByGroup = useMemo<Map<string, SettingWithValue[]>>(() => {
    if (storeSettingsByGroup && storeSettingsByGroup.size > 0) {
      return storeSettingsByGroup;
    }
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

  // Bucket visible registry groups into the fixed meta-sections (Local Model
  // Servers, Provider Options, …) so the panel renders stable headings instead
  // of echoing raw backend group names. partitionByMetaSection is shared with
  // getDisplayedSettingGroups so the sidebar mirrors this exactly.
  const sectionsMap = useMemo<Map<string, MetaSection>>(() => {
    const visibleGroups = new Map<string, SettingWithValue[]>();
    if (settingsByGroup && settingsByGroup.size > 0) {
      settingsByGroup.forEach((groupSettings, groupName) => {
        if (HIDDEN_SETTING_GROUPS.has(groupName)) {
          return;
        }
        const allowedSettings = groupSettings.filter(
          (setting) =>
            !setting.is_secret && !SEARCH_RELATED_SETTINGS.has(setting.env_var)
        );
        if (allowedSettings.length > 0) {
          visibleGroups.set(groupName, allowedSettings);
        }
      });
    }
    return new Map(
      partitionByMetaSection(visibleGroups).map((section) => [
        section.key,
        section
      ])
    );
  }, [settingsByGroup]);

  const hasVisibleSettings = sectionsMap.size > 0;

  // The sticky save bar only appears when the user has unsaved edits.
  const isDirty = useMemo(() => {
    if (!data) return false;
    for (const setting of data) {
      const current = settingValues[setting.env_var];
      if (current === undefined) continue;
      const original = setting.value != null ? String(setting.value) : "";
      if (current !== original) return true;
    }
    return false;
  }, [data, settingValues]);

  const updateSettingsMutation = useMutation({
    mutationFn: (args: { settings: Record<string, string>; secrets: Record<string, string> }) =>
      updateSettings(args.settings, args.secrets),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      // Saving secrets through the remote-settings panel must propagate the
      // same way SecretsMenu does — provider availability and per-modality
      // model lists derive from configured secrets.
      if (args.secrets && Object.keys(args.secrets).length > 0) {
        queryClient.invalidateQueries({ queryKey: ["secrets"] });
        for (const key of PROVIDER_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        for (const key of MODEL_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
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
        <Text sx={{ textAlign: "center", padding: "2em" }}>
          Loading settings…
        </Text>
      )}
      {isSuccess && hasVisibleSettings && (
        <div
          className="remote-settings-content"
          css={getSharedSettingsStyles(theme)}
        >
          <div className="settings-main-content">
            {/* Render meta-sections in the fixed order; the Web-search picker
                (SearchProviderSection) sits right after Local Model Servers. */}
            {META_SECTION_GROUPS.map((section) => {
              const sec = sectionsMap.get(section.key);
              return (
                <Fragment key={section.key}>
                  {sec && (
                    <div className="settings-section">
                      <Text
                        size="big"
                        id={sec.key}
                        className="settings-heading"
                      >
                        {sec.label}
                      </Text>
                      {sec.entries.flatMap(({ settings }) =>
                        settings.map((setting) => (
                          <SettingItem
                            key={setting.env_var}
                            setting={setting}
                            value={settingValues[setting.env_var] || ""}
                            onChange={handleChange}
                          />
                        ))
                      )}
                    </div>
                  )}
                  {section.key === "local-model-servers" && data && (
                    <SearchProviderSection
                      allSettings={data}
                      settingValues={settingValues}
                      onChange={handleChange}
                    />
                  )}
                </Fragment>
              );
            })}

            {isDirty && (
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
            )}
          </div>
        </div>
      )}
      {isSuccess && !hasVisibleSettings && (
        <Text sx={{ textAlign: "center", padding: "2em" }}>
          No settings available
        </Text>
      )}
    </>
  );
};

export default memo(RemoteSettings);
