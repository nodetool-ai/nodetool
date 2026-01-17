export const PANEL_CONFIG = {
  "getting-started": { title: "Getting Started" },
  templates: { title: "Templates" },
  activity: { title: "Activity" },
  workflows: { title: "Recent Workflows" },
  "recent-chats": { title: "Recent Chats" },
  chat: { title: "Chat" },
  welcome: { title: "Welcome" },
  setup: { title: "Setup" }, // Kept for backward compatibility
  providers: { title: "AI Providers" },
  "mini-app": { title: "Mini App" },
  profiler: { title: "Profiler" }
} as const;

export type PanelType = keyof typeof PANEL_CONFIG;

export interface PanelProps {
  [key: string]: any;
}
