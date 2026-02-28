import { useCallback, memo } from "react";

interface SidebarItem {
  id: string;
  label: string;
}

interface SidebarSection {
  category: string;
  items: SidebarItem[];
}

interface SettingsSidebarProps {
  activeSection: string;
  sections: SidebarSection[];
  onSectionClick: (sectionId: string) => void;
}

const SettingsSidebar = ({
  activeSection,
  sections,
  onSectionClick
}: SettingsSidebarProps) => {
  const handleItemClick = useCallback(
    (sectionId: string) => () => {
      onSectionClick(sectionId);
    },
    [onSectionClick]
  );

  return (
    <div className="settings-sidebar">
      {sections.map((section, index) => (
        <div key={`section-${index}`}>
          <div className="settings-sidebar-category">{section.category}</div>
          {section.items.map((item, itemIndex) => (
            <div
              key={`${item.id}-${itemIndex}`}
              className={`settings-sidebar-item ${
                activeSection === item.id ? "active" : ""
              }`}
              onClick={handleItemClick(item.id)}
            >
              {item.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default memo(SettingsSidebar);
