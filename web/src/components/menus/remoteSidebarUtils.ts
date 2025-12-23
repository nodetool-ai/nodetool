import useRemoteSettingsStore from "../../stores/RemoteSettingStore";



export const getRemoteSidebarSections = () => {
  const store = useRemoteSettingsStore.getState();
  const settings = store.settings;

  const initialGroupedSettings = settings
    .filter((setting) => !setting.is_secret)
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
