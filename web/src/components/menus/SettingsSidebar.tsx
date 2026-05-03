import { useCallback, memo, useState, useEffect } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface SidebarItem {
  id: string;
  label: string;
}

export interface SidebarSection {
  category: string;
  items: SidebarItem[];
  /** Whether this folder should be collapsed by default */
  defaultCollapsed?: boolean;
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
    (event: React.MouseEvent) => {
      const target = event.currentTarget as HTMLElement;
      const sectionId = target.dataset.sectionId;
      if (sectionId) {
        onSectionClick(sectionId);
      }
    },
    [onSectionClick]
  );

  // Track open/closed state per folder category
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() =>
    sections.reduce<Record<string, boolean>>((acc, section) => {
      acc[section.category] = !section.defaultCollapsed;
      return acc;
    }, {})
  );

  // When sections change (e.g. tab switch), initialise any new folders as open
  useEffect(() => {
    setOpenFolders((prev) => {
      const next = { ...prev };
      let changed = false;
      sections.forEach((section) => {
        if (!(section.category in next)) {
          next[section.category] = !section.defaultCollapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sections]);

  // Auto-expand the folder that contains the active section
  useEffect(() => {
    if (!activeSection) return;
    const owner = sections.find((s) =>
      s.items.some((item) => item.id === activeSection)
    );
    if (owner && openFolders[owner.category] === false) {
      setOpenFolders((prev) => ({ ...prev, [owner.category]: true }));
    }
  }, [activeSection, sections, openFolders]);

  const toggleFolder = useCallback((category: string) => {
    setOpenFolders((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const handleFolderKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const category = event.currentTarget.dataset.category;
        if (category) {
          toggleFolder(category);
        }
      }
    },
    [toggleFolder]
  );

  const handleFolderClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const category = event.currentTarget.dataset.category;
      if (category) {
        toggleFolder(category);
      }
    },
    [toggleFolder]
  );

  return (
    <div className="settings-sidebar">
      {sections.map((section, index) => {
        const isOpen = openFolders[section.category] !== false;
        return (
          <div key={`section-${index}`} className="settings-sidebar-folder">
            <div
              className={`settings-sidebar-category${isOpen ? " open" : ""}`}
              data-category={section.category}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-controls={`settings-folder-${index}`}
              onClick={handleFolderClick}
              onKeyDown={handleFolderKeyDown}
            >
              <ExpandMoreIcon
                className="settings-sidebar-chevron"
                fontSize="small"
              />
              {isOpen ? (
                <FolderOpenIcon
                  className="settings-sidebar-folder-icon"
                  fontSize="small"
                />
              ) : (
                <FolderIcon
                  className="settings-sidebar-folder-icon"
                  fontSize="small"
                />
              )}
              <span className="settings-sidebar-category-label">
                {section.category}
              </span>
            </div>
            {isOpen && (
              <div
                id={`settings-folder-${index}`}
                className="settings-sidebar-folder-items"
              >
                {section.items.map((item, itemIndex) => (
                  <div
                    key={`${item.id}-${itemIndex}`}
                    data-section-id={item.id}
                    className={`settings-sidebar-item ${
                      activeSection === item.id ? "active" : ""
                    }`}
                    onClick={handleItemClick}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {footer && <div className="settings-sidebar-footer">{footer}</div>}
    </div>
  );
};

export default memo(SettingsSidebar);
