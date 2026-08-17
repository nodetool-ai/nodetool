/** @jsxImportSource @emotion/react */
/**
 * The timeline editor's chrome, as a replay mounts it: the production `TopBar`,
 * `TimelineInspector`, and `BottomStatusBar`, wired to the stores the replay
 * engine seeds instead of to a live sequence.
 *
 * Kept apart from `TimelineDemoPlayer` so the chrome can be mounted — and
 * asserted on — without the preview compositor, which needs a canvas backend a
 * test environment has no way to give it.
 */
import React from "react";

import { BottomStatusBar } from "../../components/timeline/BottomStatusBar";
import { TimelineInspector } from "../../components/timeline/Inspector/TimelineInspector";
import { TopBar } from "../../components/timeline/TopBar";
import {
  useFailedCount,
  useGeneratingCount
} from "../../stores/timeline/TimelineGenerationStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

/** Share of the middle row the inspector takes, matching the editor's split. */
export const INSPECTOR_WIDTH_PCT = 30;

/** The editor's zoom baseline: `zoom = DEFAULT_MS_PER_PX / msPerPx`. */
const DEFAULT_MS_PER_PX = 10;

/** Nothing in a replay clicks a top-bar action; they render to be seen. */
const noop = (): void => {};

/**
 * The editor's top bar with every action present and inert — a tutorial should
 * show where Save and Export live, and a replay must not run them.
 */
export function DemoTopBar(): React.JSX.Element {
  return (
    <TopBar
      onSave={noop}
      onExportVideo={noop}
      onSaveToAssets={noop}
      onOpenSettings={noop}
    />
  );
}

/** The inspector column beside the preview. Fills in from the cast's selection. */
export function DemoInspectorPane(): React.JSX.Element {
  return (
    <div
      style={{
        width: `${INSPECTOR_WIDTH_PCT}%`,
        flexShrink: 0,
        minWidth: 0,
        overflow: "hidden"
      }}
    >
      <TimelineInspector />
    </div>
  );
}

/**
 * The status bar, reading the stores the editor reads — the cast's zoom through
 * `msPerPx`, and any generation the cast put in flight.
 */
export function DemoStatusBar(): React.JSX.Element {
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const generatingCount = useGeneratingCount();
  const failedCount = useFailedCount();
  return (
    <BottomStatusBar
      mode="local"
      zoom={DEFAULT_MS_PER_PX / msPerPx}
      generatingCount={generatingCount}
      failedCount={failedCount}
    />
  );
}
