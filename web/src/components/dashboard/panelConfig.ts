export const PANEL_CONFIG = {
  templates: { title: "Templates" },
  workflows: { title: "Recent Workflows" },
  "recent-chats": { title: "Recent Chats" },
  chat: { title: "Chat" },
  welcome: { title: "Welcome" },
  setup: { title: "Setup" }
} as const;

export type PanelType = keyof typeof PANEL_CONFIG;

export interface PanelProps {
  [key: string]: any;
}
