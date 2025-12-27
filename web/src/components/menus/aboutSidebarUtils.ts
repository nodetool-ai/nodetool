interface SidebarSection {
  category: string;
  items: Array<{ id: string; label: string }>;
}

export const getAboutSidebarSections = (): SidebarSection[] => {
  return [
    {
      category: "About",
      items: [
        { id: "application", label: "Application" },
        { id: "operating-system", label: "Operating System" },
        { id: "installation-paths", label: "Installation Paths" },
        { id: "features", label: "Features & Versions" },
        { id: "links", label: "Links" }
      ]
    }
  ];
};
