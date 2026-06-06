/** @jsxImportSource @emotion/react */
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import TimelineEditor from "../timeline/TimelineEditor";
import TimelinePlayer from "../timeline/TimelinePlayer";

interface TimelineSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * Workspace surface for a timeline tab. `refId` is the sequenceId.
 *
 * View mode renders the standalone {@link TimelinePlayer} (read-only viewer);
 * Edit mode renders the full {@link TimelineEditor}. Each wraps its own
 * `TimelineProvider`, so the document, playback clock, and UI state live in
 * per-instance Zustand stores and multiple timeline tabs stay isolated.
 */
const TimelineSurface = ({ refId, mode, active }: TimelineSurfaceProps) => {
  return mode === "view" ? (
    <TimelinePlayer sequenceId={refId} active={active} />
  ) : (
    <TimelineEditor sequenceId={refId} active={active} />
  );
};

export default TimelineSurface;
