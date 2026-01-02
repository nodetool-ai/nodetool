/**
 * Timeline Editor Components
 *
 * A multi-track timeline editor for composing audio, video, and image sequences.
 * Uses Dockview for flexible panel layout.
 */

// Main editor
export { default as TimelineEditor } from "./TimelineEditor";
export { default as TimelineToolbar } from "./TimelineToolbar";

// Track components
export { default as TrackList } from "./TrackList";
export { default as TrackHeader } from "./TrackHeader";
export { default as TrackLane } from "./TrackLane";

// Ruler and playhead
export { default as TimeRuler } from "./TimeRuler";
export { default as Playhead } from "./Playhead";

// Clip components
export { default as Clip } from "./Clip";
export { default as AudioClip } from "./AudioClip";
export { default as VideoClip } from "./VideoClip";
export { default as ImageClip } from "./ImageClip";
export { default as TransitionHandle } from "./TransitionHandle";

// Media browser and preview
export { default as TimelineAssetBrowser } from "./TimelineAssetBrowser";
export { default as PreviewWindow } from "./PreviewWindow";

// Panel components (for Dockview)
export * from "./panels";

// Configuration and layout
export { TIMELINE_PANEL_CONFIG } from "./timelinePanelConfig";
export { timelineDefaultLayout } from "./timelineDefaultLayout";
export { createTimelinePanelComponents } from "./timelinePanelComponents";

// Types
export type { ClipProps } from "./Clip";
export type {
  TimelinePanelType,
  TimelinePanelProps
} from "./timelinePanelConfig";
export type { TrackHeaderProps } from "./TrackHeader";
