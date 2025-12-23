import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

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
