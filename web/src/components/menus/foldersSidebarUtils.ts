import type { SettingWithValue } from "../../stores/ApiTypes";

export const getFoldersSidebarSections = (settings: SettingWithValue[]) => {
  const allGroupedSettings = settings.reduce((acc, setting) => {
    const groupKey = setting.group || "UnknownGroup";
    acc[groupKey] = acc[groupKey] || [];
    acc[groupKey].push(setting);
    return acc;
  }, {} as Record<string, SettingWithValue[]>);

  const folderGroupSettings = allGroupedSettings["Folders"] || [];

  if (folderGroupSettings.length === 0) {
    return [
      {
        category: "Folders",
        items: [{ id: "no-folder-settings", label: "No Folder Settings" }]
      }
    ];
  }

  const desiredLabels = ["Font Path", "Comfy Folder", "Vector DB Path"];
  const sectionId = "folders-settings"; // Static ID for the "Folders" section group

  const items = folderGroupSettings
    .map((setting: SettingWithValue) => ({
      originalSetting: setting,
      label: setting.env_var
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char: string) => char.toUpperCase())
    }))
    .filter((settingInfo: { originalSetting: SettingWithValue; label: string }) => {
      const passesFilter = desiredLabels.includes(settingInfo.label);
      return passesFilter;
    })
    .map((settingInfo: { originalSetting: SettingWithValue; label: string }) => ({
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
