/** @jsxImportSource @emotion/react */
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import TimelineEditor from "../timeline/TimelineEditor";

interface TimelineSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * Workspace surface for a timeline tab. `refId` is the sequenceId.
 *
 * The timeline document, playback clock, and UI state live in per-instance
 * Zustand stores provided by `TimelineProvider` (wired inside TimelineEditor),
 * so multiple timeline tabs can be edited in parallel. There is no
 * self-contained read-only preview that loads its own sequence, so we render
 * the full TimelineEditor for both view and edit modes for now. The editor
 * shows its own LoadingSpinner in the preview region while the sequence loads.
 */
const TimelineSurface = ({ refId, active }: TimelineSurfaceProps) => {
  return <TimelineEditor sequenceId={refId} active={active} />;
};

export default TimelineSurface;
