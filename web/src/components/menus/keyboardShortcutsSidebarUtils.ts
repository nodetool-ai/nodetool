import { SidebarSection } from "./SettingsSidebar";

/**
 * Get sidebar sections for the Keyboard Shortcuts settings tab.
 * Organizes shortcuts by category.
 */
export const getKeyboardShortcutsSidebarSections = (): SidebarSection[] => {
  return [
    {
      category: "Categories",
      items: [
        { id: "all", label: "All Shortcuts" },
        { id: "editor", label: "Node Editor" },
        { id: "panel", label: "Panels" },
        { id: "workflow", label: "Workflows" },
        { id: "assets", label: "Asset Viewer" }
      ]
    }
  ];
};
