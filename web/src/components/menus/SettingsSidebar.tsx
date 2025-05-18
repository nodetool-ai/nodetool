/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Typography } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";

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

const sidebarStyles = (theme: any) => css`
  width: 220px;
  min-width: 220px;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 1.5em 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;

  .settings-sidebar-item {
    padding: 0.75em 1.5em;
    cursor: pointer;
    font-size: ${theme.fontSizeSmall};
    color: ${theme.palette.c_white};
    opacity: 0.7;
    transition: all 0.2s ease;
    border-left: 3px solid transparent;

    &:hover {
      opacity: 1;
      background-color: rgba(255, 255, 255, 0.05);
    }

    &.active {
      opacity: 1;
      border-left-color: ${theme.palette.c_hl1};
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  .settings-sidebar-category {
    padding: 1em 1.5em 0.5em;
    color: ${theme.palette.c_hl1};
    font-size: ${theme.fontSizeSmaller};
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.8;
  }
`;

const SettingsSidebar = ({
  activeSection,
  sections,
  onSectionClick
}: SettingsSidebarProps) => {
  return (
    <div className="settings-sidebar" css={sidebarStyles(ThemeNodetool)}>
      {sections.map((section, index) => (
        <div key={`section-${index}`}>
          <div className="settings-sidebar-category">{section.category}</div>
          {section.items.map((item) => (
            <div
              key={item.id}
              className={`settings-sidebar-item ${
                activeSection === item.id ? "active" : ""
              }`}
              onClick={() => onSectionClick(item.id)}
            >
              {item.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default SettingsSidebar;
