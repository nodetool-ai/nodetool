/**
 * Timeline Panel Components Mapping
 * Maps panel IDs to their React components for Dockview
 */
import React from "react";
import { IDockviewPanelProps } from "dockview";
import { TimelinePanelProps } from "./timelinePanelConfig";
import TimelineTracksPanel from "./panels/TimelineTracksPanel";
import TimelineContentPanel from "./panels/TimelineContentPanel";
import TimelineMediaPanel from "./panels/TimelineMediaPanel";
import TimelinePreviewPanel from "./panels/TimelinePreviewPanel";

export const createTimelinePanelComponents = () => ({
  tracks: (props: IDockviewPanelProps<TimelinePanelProps>) => (
    <TimelineTracksPanel {...props} />
  ),
  timeline: (props: IDockviewPanelProps<TimelinePanelProps>) => (
    <TimelineContentPanel {...props} />
  ),
  "media-assets": (props: IDockviewPanelProps<TimelinePanelProps>) => (
    <TimelineMediaPanel {...props} />
  ),
  preview: (props: IDockviewPanelProps<TimelinePanelProps>) => (
    <TimelinePreviewPanel {...props} />
  )
});

