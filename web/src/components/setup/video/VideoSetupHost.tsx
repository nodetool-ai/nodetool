/**
 * The video flow for a host that is not already a timeline editor — the New
 * guided flow tab opened when the entry card creates the sequence (PRD § 6.1).
 *
 * A timeline tab and the Studio page already run the sequence's load, autosave
 * and agent bridge, so they render `SetupFlow` themselves against their own
 * instance. This host brings its own instance and those three hooks, so setup
 * writes persist and the `ui_timeline_*` tools reach the sequence while the
 * flow is up (PRD § 6.5).
 */

import { useCallback } from "react";

import { trpc } from "../../../trpc/client";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import {
  useLoadTimelineIntoStore,
  type WireSequence
} from "../../../hooks/timeline/useLoadTimelineIntoStore";
import { useTimelineAutosave } from "../../../hooks/timeline/useTimelineAutosave";
import { useTimelineAgentBridge } from "../../../hooks/timeline/useTimelineAgentBridge";
import { buildTimelineDocumentPayload } from "../../../hooks/timeline/timelineDocumentPayload";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import { FlexColumn, PADDING, ThinkingIndicator } from "../../ui_primitives";
import { SetupFlow } from "../SetupFlow";
import { useFinishIfLoadedDone } from "../useFinishIfLoadedDone";
import {
  useVideoSetupFlow,
  type VideoSetupFlowOptions
} from "./useVideoSetupFlow";

export interface VideoSetupHostProps {
  sequenceId: string;
  /**
   * Runs when the flow's last step finishes — the host opens the timeline.
   * The flow saves and refreshes the cached sequence before calling it.
   */
  onFinish: () => void | Promise<void>;
  /** Hands the brief and the typed creative context to the script flow (E3). */
  onStartFromScript?: VideoSetupFlowOptions["onStartFromScript"];
  /**
   * Takes the creator back to the entry surface to pick a different card. The
   * shell shows it on step 1 only, and only when a host supplies it; what
   * happens to the draft sequence is the host's to decide (F31).
   *
   * The brief handed over is the one in the store: autosave is debounced, so
   * the server copy can be a keystroke or a failed save behind.
   */
  onChangeFlow?: (brief: string) => void | Promise<void>;
  /**
   * Whether the host is the visible surface. A hidden workspace tab passes
   * false so its instance does not take undo, save and generation statics
   * from the timeline the user is looking at. Defaults to true.
   */
  active?: boolean;
}

const VideoSetupBody = ({
  sequenceId,
  onFinish,
  onStartFromScript,
  onChangeFlow
}: VideoSetupHostProps) => {
  const query = trpc.timeline.get.useQuery({ id: sequenceId });
  useLoadTimelineIntoStore(query.data);
  const { flush } = useTimelineAutosave();
  useTimelineAgentBridge(sequenceId);
  const store = useTimelineStoreApi();
  const utils = trpc.useUtils();

  // The editor the host opens reads `timeline.get` from the cache, which still
  // holds the copy loaded before the flow. Save first, then put the flow's
  // final document there, so the editor neither reopens the flow nor settles
  // the new jobs as orphans. A failed save still hands over: jobs may be away.
  const finish = useCallback(async () => {
    try {
      const saved = await flush();
      const state = store.getState();
      if (state.sequenceId === sequenceId) {
        const updatedAt =
          (saved.ok ? saved.updatedAt : null) ?? state.baseUpdatedAt;
        utils.timeline.get.setData({ id: sequenceId }, (cached) =>
          cached
            ? ({
                ...cached,
                fps: state.fps,
                width: state.width,
                height: state.height,
                ...buildTimelineDocumentPayload(state),
                updatedAt: updatedAt ?? cached.updatedAt
              } as WireSequence)
            : cached
        );
      }
    } catch {
      // The editor falls back to the server copy; the closing flush still runs.
    }
    await onFinish();
  }, [flush, onFinish, sequenceId, store, utils]);

  const config = useVideoSetupFlow({ onFinish: finish, onStartFromScript });
  // The store starts empty and an empty store's stage reads `done`, so the flow
  // is only rendered once the server copy has landed in it.
  const loaded = useTimelineStore((state) => state.sequenceId === sequenceId);
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const submitting = useTimelineStore(
    (state) => state.setup?.prepared_generation !== undefined
  );

  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(brief),
    [brief, onChangeFlow]
  );
  useFinishIfLoadedDone(loaded, config.stage, onFinish);

  if (query.isError) {
    return <DocumentLoadStatus state="error" label="video" />;
  }
  if (!loaded) {
    return <DocumentLoadStatus state="loading" label="video" />;
  }
  // Generate writes `done` before it saves and sends the clips, and the host
  // opens the timeline only after that. The shell has no step for `done`, so
  // this covers the wait instead of a blank panel.
  if (config.stage === "done") {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ padding: PADDING.section }}
      >
        <ThinkingIndicator
          label={submitting ? "Starting your clips" : "Opening your timeline"}
          announce
        />
      </FlexColumn>
    );
  }
  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

const VideoSetupHost = ({ active = true, ...props }: VideoSetupHostProps) => (
  <TimelineProvider active={active}>
    <VideoSetupBody {...props} />
  </TimelineProvider>
);

export default VideoSetupHost;
