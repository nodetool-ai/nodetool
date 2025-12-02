export const PANEL_CONFIG = {
  templates: { title: "Templates" },
  activity: { title: "Activity" },
  workflows: { title: "Recent Workflows" },
  "recent-chats": { title: "Recent Chats" },
  chat: { title: "Chat" },
  welcome: { title: "Welcome" },
  setup: { title: "Setup" } // Kept for backward compatibility
} as const;

export type PanelType = keyof typeof PANEL_CONFIG;

export interface PanelProps {
  [key: string]: any;
}
