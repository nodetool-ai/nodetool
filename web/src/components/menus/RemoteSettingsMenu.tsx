/** @jsxImportSource @emotion/react */
import SaveIcon from "@mui/icons-material/Save";
import { useTranslation } from "react-i18next";

import type React from "react";
import { useMemo, useState, useCallback, useEffect, memo, Fragment } from "react";

import {
  TextInput,
  Text,
  EditorButton,
  SelectField,
  getSpacingPx,
  SPACING,
  EmptyState,
  LoadingSpinner
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
import { matchesSearch } from "./settingsSearch";

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
  "APIFY_API_TOKEN"
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
    label: "Local model servers",
    groups: [
      "vLLM",
      "Ollama",
      "LlamaCpp",
      "NodeLlamaCpp",
      "LMStudio",
      "WhisperCpp",
      "WhisperCppServer",
      "TransformersJs",
      "PythonNodes",
      "Wan2GP"
    ]
  },
  {
    key: "provider-options",
    label: "Provider options",
    groups: ["ClaudeAgent", "ZAI", "KIE"]
  },
  {
    key: "observability",
    label: "Observability",
    groups: ["Observability", "Traceloop"]
  },
  {
    key: "data-and-storage",
    label: "Data & storage",
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

interface MetaSectionEntry {
  group: string;
  settings: SettingWithValue[];
}

interface MetaSection {
  key: string;
  label: string;
  entries: MetaSectionEntry[];
}

interface DisplayedGroup {
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
      result.push({ id: "search-provider", label: "Search provider" });
    }
  }
  return result;
};

const SETTING_LINKS: Record<string, string> = {
  OPENAI_API_KEY: "https://platform.openai.com/api-keys",
  ANTHROPIC_API_KEY: "https://console.anthropic.com/",
  GEMINI_API_KEY: "https://aistudio.google.com/app/apikey",
  OPENROUTER_API_KEY: "https://openrouter.ai/keys",
  REQUESTY_API_KEY: "https://app.requesty.ai/api-keys",
  OPPER_API_KEY: "https://platform.opper.ai",
  CHEAPER_INFERENCE_API_KEY: "https://cheaperinference.com/signup",
  API_ROUTE_API_KEY: "https://www.api-route.com/api-keys",
  HF_TOKEN: "https://huggingface.co/settings/tokens",
  REPLICATE_API_TOKEN: "https://replicate.com/account/api-tokens",
  GOOGLE_APP_PASSWORD: "https://myaccount.google.com/apppasswords",
  ELEVENLABS_API_KEY: "https://elevenlabs.io/subscription",
  FAL_API_KEY: "https://fal.ai/dashboard/keys",
  SERPAPI_API_KEY: "https://serpapi.com/manage-api-key",
  DATA_FOR_SEO_LOGIN: "https://app.dataforseo.com/api-dashboard",
  BRAVE_API_KEY: "https://api-dashboard.search.brave.com/",
  APIFY_API_TOKEN: "https://console.apify.com/account/integrations",
  KIMI_API_KEY: "https://platform.moonshot.ai/console/api-keys",
  DASHSCOPE_API_KEY:
    "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
  AKI_API_KEY: "https://aki.io"
};

const SETTING_CREDENTIAL_KEYS: Record<string, string> = {
  OPENAI_API_KEY: "OPENAI_API_KEY",
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  GEMINI_API_KEY: "GEMINI_API_KEY",
  OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
  REQUESTY_API_KEY: "REQUESTY_API_KEY",
  OPPER_API_KEY: "OPPER_API_KEY",
  CHEAPER_INFERENCE_API_KEY: "CHEAPER_INFERENCE_API_KEY",
  API_ROUTE_API_KEY: "API_ROUTE_API_KEY",
  HF_TOKEN: "HF_TOKEN",
  REPLICATE_API_TOKEN: "REPLICATE_API_TOKEN",
  GOOGLE_APP_PASSWORD: "GOOGLE_APP_PASSWORD",
  ELEVENLABS_API_KEY: "ELEVENLABS_API_KEY",
  FAL_API_KEY: "FAL_API_KEY",
  SERPAPI_API_KEY: "SERPAPI_API_KEY",
  DATA_FOR_SEO_LOGIN: "DATA_FOR_SEO_LOGIN",
  BRAVE_API_KEY: "BRAVE_API_KEY",
  APIFY_API_TOKEN: "APIFY_API_TOKEN",
  KIMI_API_KEY: "KIMI_API_KEY",
  DASHSCOPE_API_KEY: "DASHSCOPE_API_KEY",
  AKI_API_KEY: "AKI_API_KEY"
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
  const { t } = useTranslation();
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(setting.env_var, e.target.value);
    },
    [setting.env_var, onChange]
  );

  const handleSelectChange = useCallback(
    (next: string) => {
      onChange(setting.env_var, next);
    },
    [setting.env_var, onChange]
  );

  const selectOptions = useMemo(
    () =>
      (setting.enum ?? []).map((option: string) => ({
        value: option,
        label: option
      })),
    [setting.enum]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="settings-item large">
      {setting.enum && setting.enum.length > 0 ? (
        <div onKeyDown={handleKeyDown}>
          <SelectField
            id={`${setting.env_var.toLowerCase()}-select`}
            label={formatSettingLabel(setting.env_var)}
            value={value || ""}
            onChange={handleSelectChange}
            options={selectOptions}
            description={setting.description || undefined}
          />
        </div>
      ) : (
        <TextInput
          type={setting.is_secret ? "password" : "text"}
          autoComplete="off"
          id={`${setting.env_var.toLowerCase()}-input`}
          label={formatSettingLabel(setting.env_var)}
          helperText={setting.description || undefined}
          value={value || ""}
          onChange={handleChange}
          size="small"
          onKeyDown={handleKeyDown}
        />
      )}
      {SETTING_LINKS[setting.env_var] && (
        <div style={{ marginTop: getSpacingPx(SPACING.md) }}>
          <ExternalLink
            href={SETTING_LINKS[setting.env_var]}
            tooltipText={SETTING_CREDENTIAL_KEYS[setting.env_var]
              ? t(`screens4_5.remoteSettings.credentials.${SETTING_CREDENTIAL_KEYS[setting.env_var]}.tooltip`)
              : ""}
          >
            {SETTING_CREDENTIAL_KEYS[setting.env_var]
              ? t(`screens4_5.remoteSettings.credentials.${SETTING_CREDENTIAL_KEYS[setting.env_var]}.button`)
              : t("screens4_5.remoteSettings.credentials.genericButton")}
          </ExternalLink>
        </div>
      )}
    </div>
  );
});

SettingItem.displayName = "SettingItem";

interface RemoteSettingsProps {
  search?: string;
}

const settingMatches = (setting: SettingWithValue, search: string): boolean =>
  matchesSearch(
    `${formatSettingLabel(setting.env_var)} ${setting.env_var} ${setting.description ?? ""}`,
    search
  );

const RemoteSettings = ({ search = "" }: RemoteSettingsProps) => {
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
      const savedSecrets = Object.keys(args.secrets).length > 0;
      if (savedSecrets) {
        queryClient.invalidateQueries({ queryKey: ["secrets"] });
      }
      // Providers resolve their configuration from secrets and plain settings
      // alike (LLAMA_CPP_URL is a setting), and the server drops its provider
      // cache on either save. Model lists are cached for minutes, so refetch
      // them here too or the picker keeps showing the old server's models.
      if (savedSecrets || Object.keys(args.settings).length > 0) {
        for (const key of PROVIDER_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        for (const key of MODEL_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    },
    onError: (error: Error) => {
      addNotification({
        content: t("screens4_5.remoteSettings.saveError", { error: error.message }),
        type: "error",
        alert: true
      });
    }
  });

  const handleChange = useCallback((envVar: string, value: string) => {
    setSettingValues((prev) => ({ ...prev, [envVar]: value }));
  }, []);

  // Restore every edited field to its saved value.
  const handleDiscard = useCallback(() => {
    if (!data) return;
    setSettingValues((prev) => {
      const next = { ...prev };
      for (const setting of data) {
        if (setting.env_var in next) {
          next[setting.env_var] =
            setting.value != null ? String(setting.value) : "";
        }
      }
      return next;
    });
  }, [data]);

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
            content: t("screens4_5.remoteSettings.saved"),
            type: "success",
            alert: true
          });
        }
      }
    );
  }, [addNotification, settingValues, updateSettingsMutation, data, t]);

  const theme = useTheme();

  return (
    <>
      {isLoading && (
        <LoadingSpinner text={t("screens4_5.remoteSettings.loading")} />
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
              const heading = t(
                `screens4_5.remoteSettings.sections.${section.key}`
              );
              const headingMatches = sec
                ? matchesSearch(heading, search)
                : false;
              const visibleSettings = sec
                ? sec.entries.flatMap(({ settings }) =>
                    headingMatches
                      ? settings
                      : settings.filter((setting) =>
                          settingMatches(setting, search)
                        )
                  )
                : [];
              return (
                <Fragment key={section.key}>
                  {sec && visibleSettings.length > 0 && (
                    <div className="settings-section">
                      <Text
                        size="big"
                        id={sec.key}
                        className="settings-heading"
                      >
                        {heading}
                      </Text>
                      {visibleSettings.map((setting) => (
                        <SettingItem
                          key={setting.env_var}
                          setting={setting}
                          value={settingValues[setting.env_var] || ""}
                          onChange={handleChange}
                        />
                      ))}
                    </div>
                  )}
                  {section.key === "local-model-servers" && data && (
                    <SearchProviderSection
                      settingValues={settingValues}
                      onChange={handleChange}
                      search={search}
                    />
                  )}
                </Fragment>
              );
            })}

            {isDirty && (
              <div className="save-button-container">
                <Text className="save-bar-message">{t("screens4_5.remoteSettings.unsavedChanges")}</Text>
                <EditorButton
                  variant="text"
                  onClick={handleDiscard}
                  disabled={updateSettingsMutation.isPending}
                >
                  {t("screens4_5.remoteSettings.discard")}
                </EditorButton>
                <EditorButton
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                  className="save-button"
                  startIcon={<SaveIcon />}
                  disabled={updateSettingsMutation.isPending}
                >
                  {updateSettingsMutation.isPending ? t("screens4_5.remoteSettings.saving") : t("screens4_5.remoteSettings.saveChanges")}
                </EditorButton>
              </div>
            )}
          </div>
        </div>
      )}
      {isSuccess && !hasVisibleSettings && (
        <EmptyState variant="no-data" size="small" title={t("screens4_5.remoteSettings.empty")} />
      )}
    </>
  );
};

export default memo(RemoteSettings);
