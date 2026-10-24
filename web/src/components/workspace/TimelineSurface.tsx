/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import TimelineEditor from "../timeline/TimelineEditor";
import TimelinePlayer from "../timeline/TimelinePlayer";
import VideoSetupHost from "../setup/video/VideoSetupHost";
import DocumentLoadStatus from "./DocumentLoadStatus";
import WorkspaceDocumentBar from "./WorkspaceDocumentBar";
import { FlexColumn } from "../ui_primitives";

interface TimelineSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab. Without one (the Studio route) there is no bar. */
  tab?: WorkspaceTab;
}

/** The generic document bar over a state that is not the editor. */
const WithDocumentBar = ({
  tab,
  children
}: {
  tab?: WorkspaceTab;
  children: React.ReactNode;
}) =>
  !tab ? (
    <>{children}</>
  ) : (
  <>
    <WorkspaceDocumentBar tab={tab} />
    <FlexColumn sx={{ flex: 1, minHeight: 0, position: "relative" }}>
      {children}
    </FlexColumn>
  </>
);

/**
 * Workspace surface for a timeline tab. `refId` is the sequenceId. The
 * editor draws its own document bar. The viewer, the loading states and the
 * setup flow get the generic one, so View/Edit is always in reach.
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
const TimelineSurface = ({ refId, mode, active, tab }: TimelineSurfaceProps) => {
  const { t } = useTranslation();
  // Keyed by sequence, so a finished flow does not carry over to another one.
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const finished = finishedId === refId;
  // Read before the mode branch: view tabs of a mid-flow sequence stay the
  // viewer, and the query warms the cache the editor will read on switch.
  const query = trpc.timeline.get.useQuery({ id: refId });

  if (mode === "view") {
    return (
      <WithDocumentBar tab={tab}>
        <TimelinePlayer sequenceId={refId} active={active} />
      </WithDocumentBar>
    );
  }

  if (query.isPending) {
    return (
      <WithDocumentBar tab={tab}>
        <DocumentLoadStatus state="loading" label={t("i18n-next51.timeline.video")} />
      </WithDocumentBar>
    );
  }
  if (query.isError) {
    return (
      <WithDocumentBar tab={tab}>
        <DocumentLoadStatus state="error" label={t("i18n-next51.timeline.video")} />
      </WithDocumentBar>
    );
  }

  // The flow's last step writes stage `done` to the store, and autosave
  // carries it to the server; the flag switches to the editor without waiting
  // for either.
  const stage = query.data?.setup?.stage ?? "done";
  if (!finished && stage !== "done") {
    return (
      <WithDocumentBar tab={tab}>
        <VideoSetupHost
          key={refId}
          sequenceId={refId}
          active={active}
          onFinish={() => setFinishedId(refId)}
        />
      </WithDocumentBar>
    );
  }

  // Keyed by sequence: switching sequences unmounts the editor, and its
  // closing autosave flush writes the previous sequence's pending edits.
  return (
    <TimelineEditor key={refId} sequenceId={refId} active={active} tab={tab} />
  );
};

export default TimelineSurface;
