/** @jsxImportSource @emotion/react */
/**
 * Studio timeline page: the full timeline editor — the product's finishing
 * surface — inside the Studio chrome. The editor brings its own top bar,
 * preview, tracks, inspector, and agent panel; Studio only adds the way home.
 *
 * A sequence still in guided setup renders the flow instead, at the stage the
 * document carries (PRD § 6.4) — the same rule the board page follows. Studio's
 * Video card creates a sequence at stage `idea` and navigates here, so without
 * this the card would land on an empty editor and the flow would never appear.
 */

import { Suspense, lazy, useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { LoadingSpinner } from "../components/ui_primitives";
import { trpc } from "../trpc/client";
import VideoSetupHost from "../components/setup/video/VideoSetupHost";
import StudioShell from "./StudioShell";

const TimelineEditor = lazy(
  () => import("../components/timeline/TimelineEditor")
);

const StudioTimelinePage = () => {
  const { sequenceId = "" } = useParams<{ sequenceId: string }>();
  const utils = trpc.useUtils();
  const query = trpc.timeline.get.useQuery(
    { id: sequenceId },
    { enabled: sequenceId !== "" }
  );

  // The flow's last step writes stage `done` to the store, and autosave carries
  // it to the server; this switches the page over without waiting for either.
  // Keyed by sequence, so a finished flow does not carry over to another one.
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const finished = finishedId === sequenceId;
  const handleFinish = useCallback(() => {
    setFinishedId(sequenceId);
    void utils.timeline.get.invalidate({ id: sequenceId });
  }, [sequenceId, utils]);

  // A sequence with no `setup` reads `done` and opens as the editor, exactly as
  // it did before the flow existed (D3).
  const stage = query.data?.setup?.stage ?? "done";
  const inSetup = !finished && query.isSuccess && stage !== "done";

  return (
    <StudioShell title="Edit video">
      {query.isPending ? (
        <LoadingSpinner />
      ) : inSetup ? (
        <VideoSetupHost
          key={sequenceId}
          sequenceId={sequenceId}
          onFinish={handleFinish}
        />
      ) : (
        <Suspense fallback={<LoadingSpinner />}>
          {/* Keyed by sequence: switching sequences unmounts the editor, and
              its closing autosave flush writes the previous one's edits. */}
          <TimelineEditor key={sequenceId} sequenceId={sequenceId} active />
        </Suspense>
      )}
    </StudioShell>
  );
};

export default StudioTimelinePage;
