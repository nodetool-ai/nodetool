/**
 * Timeline Editor Panel Configuration
 * Defines available panels for the Dockview-based timeline layout
 */

export const TIMELINE_PANEL_CONFIG = {
  tracks: { title: "Tracks" },
  timeline: { title: "Timeline" },
  "media-assets": { title: "Media Assets" },
  preview: { title: "Preview" }
} as const;

export type TimelinePanelType = keyof typeof TIMELINE_PANEL_CONFIG;

export interface TimelinePanelProps {
  [key: string]: unknown;
}

