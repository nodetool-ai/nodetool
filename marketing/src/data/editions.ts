export const EDITIONS = {
  studio: {
    name: "NodeTool Studio",
    eyebrow: "NodeTool Studio · Desktop edition",
    primaryAction: "Download Studio",
    route: "/studio",
    recommendation: "Recommended for real projects.",
  },
  cloud: {
    name: "NodeTool Cloud",
    navLabel: "Cloud (alpha)",
    eyebrow: "NodeTool Cloud · Alpha preview",
    primaryAction: "Try Cloud (alpha)",
    route: "/cloud",
    appUrl: "https://app.nodetool.ai",
    recommendation: "For trying NodeTool while it is in alpha.",
  },
} as const;
