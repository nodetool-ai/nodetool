import { useCallback, memo } from "react";

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
    <nav className="settings-sidebar" aria-label="Settings sections">
      {sections.map((section) => (
        <div key={section.category || section.items[0]?.id} className="settings-sidebar-folder">
          {section.category ? (
            <p className="settings-sidebar-category">
              <span className="settings-sidebar-category-label">
                {section.category}
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
                  {item.label}
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
