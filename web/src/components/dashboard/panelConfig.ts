export const PANEL_CONFIG = {
  examples: { title: "Examples" },
  workflows: { title: "Recent Workflows" },
  "recent-chats": { title: "Recent Chats" },
  chat: { title: "Chat" }
} as const;

export type PanelType = keyof typeof PANEL_CONFIG;

export interface PanelProps {
  [key: string]: any;
}
