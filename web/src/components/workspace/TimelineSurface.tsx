/** @jsxImportSource @emotion/react */
import { useState } from "react";

import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import TimelineEditor from "../timeline/TimelineEditor";
import TimelinePlayer from "../timeline/TimelinePlayer";
import VideoSetupHost from "../setup/video/VideoSetupHost";
import DocumentLoadStatus from "./DocumentLoadStatus";

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
 *
 * A sequence still in guided setup renders the flow in place of the editor —
 * the same rule the Studio timeline page follows. The stage is read off the
 * loaded sequence (a sequence with no `setup` reads `done`), so the flow the
 * `+ New` menu started is what a refresh or a reopened tab lands on. The
 * host brings its own instance, so setup writes persist while the flow is up.
 */
const TimelineSurface = ({ refId, mode, active }: TimelineSurfaceProps) => {
  const [finished, setFinished] = useState(false);
  // Read before the mode branch: view tabs of a mid-flow sequence stay the
  // viewer, and the query warms the cache the editor will read on switch.
  const query = trpc.timeline.get.useQuery({ id: refId });

  if (mode === "view") {
    return <TimelinePlayer sequenceId={refId} active={active} />;
  }

  if (query.isPending) {
    return <DocumentLoadStatus state="loading" label="video" />;
  }
  if (query.isError) {
    return <DocumentLoadStatus state="error" label="video" />;
  }

  // The flow's last step writes stage `done` to the store, and autosave
  // carries it to the server; the flag switches to the editor without waiting
  // for either.
  const stage = query.data?.setup?.stage ?? "done";
  if (!finished && stage !== "done") {
    return (
      <VideoSetupHost
        sequenceId={refId}
        onFinish={() => setFinished(true)}
      />
    );
  }

  return <TimelineEditor sequenceId={refId} active={active} />;
};

export default TimelineSurface;
