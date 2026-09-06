/**
 * The video flow for a host that is not already a timeline editor — the New
 * Project tab, which swaps itself for the flow once the entry card creates the
 * sequence (PRD § 6.1).
 *
 * A timeline tab and the Studio page already run the sequence's load, autosave
 * and agent bridge, so they render `SetupFlow` themselves against their own
 * instance. This host brings its own instance and those three hooks, so setup
 * writes persist and the `ui_timeline_*` tools reach the sequence while the
 * flow is up (PRD § 6.5).
 */

import { useCallback } from "react";

import { trpc } from "../../../trpc/client";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useLoadTimelineIntoStore } from "../../../hooks/timeline/useLoadTimelineIntoStore";
import { useTimelineAutosave } from "../../../hooks/timeline/useTimelineAutosave";
import { useTimelineAgentBridge } from "../../../hooks/timeline/useTimelineAgentBridge";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import { SetupFlow } from "../SetupFlow";
import { useVideoSetupFlow } from "./useVideoSetupFlow";

export interface VideoSetupHostProps {
  sequenceId: string;
  /** Runs when the flow's last step finishes — the host opens the timeline. */
  onFinish: () => void;
  /** Hands the brief to the script flow (E3). */
  onStartFromScript?: (brief: string) => void;
  /**
   * Takes the creator back to the entry surface to pick a different card. The
   * shell shows it on step 1 only, and only when a host supplies it; what
   * happens to the draft sequence is the host's to decide (F31).
   *
   * The brief handed over is the one in the store: autosave is debounced, so
   * the server copy can be a keystroke or a failed save behind.
   */
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

const VideoSetupBody = ({
  sequenceId,
  onFinish,
  onStartFromScript,
  onChangeFlow
}: VideoSetupHostProps) => {
  const query = trpc.timeline.get.useQuery({ id: sequenceId });
  useLoadTimelineIntoStore(query.data);
  useTimelineAutosave();
  useTimelineAgentBridge(sequenceId);
  const config = useVideoSetupFlow({ onFinish, onStartFromScript });
  // The store starts empty and an empty store's stage reads `done`, so the flow
  // is only rendered once the server copy has landed in it.
  const loaded = useTimelineStore((state) => state.sequenceId === sequenceId);
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");

  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(brief),
    [brief, onChangeFlow]
  );

  if (query.isError) {
    return <DocumentLoadStatus state="error" label="video" />;
  }
  if (!loaded) {
    return <DocumentLoadStatus state="loading" label="video" />;
  }
  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

const VideoSetupHost = (props: VideoSetupHostProps) => (
  <TimelineProvider>
    <VideoSetupBody {...props} />
  </TimelineProvider>
);

export default VideoSetupHost;
