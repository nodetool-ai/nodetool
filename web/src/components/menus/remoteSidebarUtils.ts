import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

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
