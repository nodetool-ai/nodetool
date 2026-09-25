export const EDITIONS = {
  studio: {
    name: "NodeTool Studio",
    eyebrow: "NodeTool Studio · Desktop edition",
    primaryAction: "Download Studio",
    route: "/studio",
    recommendation: "Recommended for production work.",
  },
  cloud: {
    name: "NodeTool Cloud",
    navLabel: "Cloud (alpha)",
    eyebrow: "NodeTool Cloud · Alpha preview",
    primaryAction: "Try Cloud (alpha)",
    route: "/cloud",
    appUrl: "https://app.nodetool.ai",
    recommendation: "For evaluation and lightweight access while in alpha.",
  },
} as const;
