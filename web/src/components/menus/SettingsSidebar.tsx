import { useCallback, memo } from "react";
import { useTranslation } from "react-i18next";

const CATEGORY_KEYS: Record<string, string> = {
  Workspace: "screens4_6.settings.sidebar.categories.workspace",
  Workflow: "screens4_6.settings.sidebar.categories.workflow",
  History: "screens4_6.settings.sidebar.categories.history",
  Configuration: "screens4_6.settings.sidebar.categories.configuration",
  Accounts: "screens4_6.settings.sidebar.categories.accounts",
  Servers: "screens4_6.settings.sidebar.categories.servers",
  Credentials: "screens4_6.settings.sidebar.categories.credentials",
  Privacy: "screens4_6.settings.sidebar.categories.privacy"
};

const ITEM_KEYS: Record<string, string> = {
  editor: "screens4_6.settings.sidebar.items.editor",
  updates: "screens4_6.settings.sidebar.items.updates",
  vaults: "screens4_6.settings.sidebar.items.vaults",
  appearance: "screens4_6.settings.sidebar.items.appearance",
  execution: "screens4_6.settings.sidebar.items.execution",
  "canvas-navigation": "screens4_6.settings.sidebar.items.canvasNavigation",
  "default-models": "screens4_6.settings.sidebar.items.defaultModels",
  autosave: "screens4_6.settings.sidebar.items.autosave",
  folders: "screens4_6.settings.sidebar.items.folders",
  "connected-accounts": "screens4_6.settings.sidebar.items.connectedAccounts",
  "mcp-integration": "screens4_6.settings.sidebar.items.mcpIntegration",
  "browser-extension": "screens4_6.settings.sidebar.items.browserExtension",
  "nodetool-api-token": "screens4_6.settings.sidebar.items.nodetoolApi",
  "search-provider": "screens4_6.searchProvider.title",
  "local-model-servers": "screens4_6.settings.sidebar.items.localModelServers"
};

interface SidebarItem {
  id: string;
  label: string;
}

export interface SidebarSection {
  category: string;
  items: SidebarItem[];
}

interface SettingsSidebarProps {
  activeSection: string;
  sections: SidebarSection[];
  onSectionClick: (sectionId: string) => void;
  footer?: React.ReactNode;
}

const SettingsSidebar = ({
  activeSection,
  sections,
  onSectionClick,
  footer
}: SettingsSidebarProps) => {
  const { t } = useTranslation();
  const handleItemClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const sectionId = event.currentTarget.dataset.sectionId;
      if (sectionId) {
        onSectionClick(sectionId);
      }
    },
    [onSectionClick]
  );

  return (
    <nav
      className="settings-sidebar"
      aria-label={t("screens4_6.settings.sidebar.ariaLabel")}
    >
      {sections.map((section) => (
        <div key={section.category || section.items[0]?.id} className="settings-sidebar-folder">
          {section.category ? (
            <p className="settings-sidebar-category">
              <span className="settings-sidebar-category-label">
                {CATEGORY_KEYS[section.category]
                  ? t(CATEGORY_KEYS[section.category], { defaultValue: section.category })
                  : section.category}
              </span>
            </p>
          ) : null}
          <div className="settings-sidebar-folder-items">
            {section.items.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-section-id={item.id}
                  className={`settings-sidebar-item${isActive ? " active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={handleItemClick}
                >
                  {ITEM_KEYS[item.id]
                    ? t(ITEM_KEYS[item.id], { defaultValue: item.label })
                    : item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {footer && <div className="settings-sidebar-footer">{footer}</div>}
    </nav>
  );
};

export default memo(SettingsSidebar);
