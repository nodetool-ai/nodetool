import type { SettingWithValue } from "../../stores/ApiTypes";

export const getRemoteSidebarSections = (settings: SettingWithValue[]) => {
  const initialGroupedSettings = settings
    .filter((setting) => !setting.is_secret)
    .reduce((acc, setting) => {
      const groupKey = setting.group || "UnknownGroup";
      acc[groupKey] = acc[groupKey] || [];
      acc[groupKey].push(setting);
      return acc;
    }, {} as Record<string, SettingWithValue[]>);

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

  return (Object.entries(finalGroupedSettings) as [string, SettingWithValue[]][]).map(
    ([groupName, settingsArray]: [string, SettingWithValue[]]) => {
      const sectionId = groupName.toLowerCase().replace(/\s+/g, "-");
      const items = settingsArray.reduce<{ id: string; label: string }[]>(
        (acc, setting) => {
          // Transform label once per setting
          const label = setting.env_var
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char: string) => char.toUpperCase());

          // Exclude specific labels
          const isExcludedLabel =
            label === "Font Path" || label === "Comfy Folder";

          if (!isExcludedLabel) {
            acc.push({ id: sectionId, label });
          }

          return acc;
        },
        []
      );

      return {
        category: groupName,
        items: items
      };
    }
  );
};
