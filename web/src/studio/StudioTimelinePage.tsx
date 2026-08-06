/** @jsxImportSource @emotion/react */
/**
 * Studio timeline page: the full timeline editor — the product's finishing
 * surface — inside the Studio chrome. The editor brings its own top bar,
 * preview, tracks, inspector, and agent panel; Studio only adds the way home.
 */

import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";
import { LoadingSpinner } from "../components/ui_primitives";
import StudioShell from "./StudioShell";

const TimelineEditor = lazy(
  () => import("../components/timeline/TimelineEditor")
);

const StudioTimelinePage = () => {
  const { sequenceId = "" } = useParams<{ sequenceId: string }>();
  return (
    <StudioShell title="Edit video">
      <Suspense fallback={<LoadingSpinner />}>
        <TimelineEditor sequenceId={sequenceId} active />
      </Suspense>
    </StudioShell>
  );
};

export default StudioTimelinePage;
