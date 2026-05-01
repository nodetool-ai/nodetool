import { isProduction } from "../../lib/env";

interface SidebarSection {
  category: string;
  items: Array<{ id: string; label: string }>;
  defaultCollapsed?: boolean;
}

export const getAboutSidebarSections = (): SidebarSection[] => {
  return [
    {
      category: "Application",
      items: [
        { id: "application", label: "Application" },
        { id: "operating-system", label: "Operating System" },
        { id: "features", label: "Features & Versions" }
      ]
    },
    {
      category: "Resources",
      items: [
        ...(!isProduction
          ? [{ id: "installation-paths", label: "Installation Paths" }]
          : []),
        { id: "links", label: "Links" }
      ]
    }
  ];
};
