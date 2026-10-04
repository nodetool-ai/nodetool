/** @jsxImportSource @emotion/react */
/**
 * Display widgets for the two editor documents a workflow can emit: a sketch
 * (an image document with layers) and a timeline (a sequence of tracks and
 * clips).
 *
 * A node emits these as a ref — `{ type: "sketch", id }` — so without a widget
 * that resolves the ref they land in an app as an opaque JSON blob. Each widget
 * takes the same two shapes the node editor's OutputRenderer accepts: an inline
 * document payload, or an id it fetches. The renderers are the read-only ones
 * the editors already ship; the timeline one is lazy because it pulls in the
 * preview compositor.
 */
import React from "react";
import { useNavigate } from "react-router-dom";

import {
  Caption,
  EmptyState,
  LoadingSpinner,
  Box,
  FlexColumn,
  EditorButton,
  SPACING,
  BORDER_RADIUS
} from "../../ui_primitives";
import { AppEvent } from "../types";
import { trpc } from "../../../trpc/client";
import {
  getSketchId,
  getTimelineId,
  resolveSketchDocument,
  resolveTimelineSequence
} from "../../node/outputValueResolvers";
import SketchRenderer from "../../sketch/SketchRenderer";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useWidgetRuntime } from "./useWidgetRuntime";

const LazyTimelineRenderer = React.lazy(async () => ({
  default: (await import("../../timeline/TimelineRenderer")).default
}));

interface DocumentWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  height?: number;
  placeholder?: string;
}

/** A bound output may hold the ref alone or an accumulated list of them. */
const firstItem = (value: unknown): unknown =>
  Array.isArray(value) ? value[value.length - 1] : value;

const useReadBinding = (props: DocumentWidgetProps) =>
  useWidgetRuntime({
    id: props.id,
    bindingMode: "read",
    binding: props.binding,
    events: props.events
  });

/** Constrains a preview to the widget's height without cropping its aspect. */
const frame = (height?: number): React.CSSProperties => ({
  width: "100%",
  maxHeight: height ? `${height}px` : undefined,
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.md
});

/** The Puck default for a Timeline widget's height, in px. */
const TIMELINE_PREVIEW_HEIGHT = 360;

/**
 * The timeline preview fills its parent's height, so the frame must have one.
 * A max-height alone collapses it to the transport bar.
 */
const timelineFrame = (height?: number): React.CSSProperties => ({
  ...frame(height),
  height: `${height ?? TIMELINE_PREVIEW_HEIGHT}px`
});

export const SketchWidget: React.FC<
  DocumentWidgetProps & { showDimensions?: boolean }
> = (props) => {
  const { value, designMode } = useReadBinding(props);
  const bound = firstItem(value);

  const inlineDocument = React.useMemo(
    () => resolveSketchDocument(bound),
    [bound]
  );
  const sketchId = React.useMemo(() => getSketchId(bound), [bound]);
  const shouldLoad = Boolean(sketchId && !inlineDocument);
  const query = trpc.sketch.get.useQuery(
    { id: sketchId ?? "" },
    { enabled: shouldLoad, staleTime: 30_000 }
  );
  const loadedDocument = React.useMemo(
    () => resolveSketchDocument(query.data),
    [query.data]
  );
  const document = inlineDocument ?? loadedDocument;

  if (document) {
    return (
      <Box sx={frame(props.height)}>
        <SketchRenderer
          document={document}
          ariaLabel="Sketch"
          showDimensions={props.showDimensions ?? false}
        />
      </Box>
    );
  }
  if (shouldLoad && query.isLoading) {
    return <LoadingSpinner size="small" text="Loading sketch" />;
  }
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title="Could not load sketch"
        description={query.error.message}
      />
    );
  }
  if (designMode) {
    return (
      <Caption color="secondary">
        Bind this to a sketch output to preview it.
      </Caption>
    );
  }
  return (
    <Caption color="secondary">{props.placeholder ?? "No sketch yet"}</Caption>
  );
};

export const TimelineWidget: React.FC<
  DocumentWidgetProps & { showMetadata?: boolean }
> = (props) => {
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const openForegroundTab = useWorkspaceTabsStore(
    (state) => state.openForegroundTab
  );
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const { value, designMode } = useReadBinding(props);
  const bound = firstItem(value);

  const inlineSequence = React.useMemo(
    () => resolveTimelineSequence(bound),
    [bound]
  );
  const timelineId = React.useMemo(() => getTimelineId(bound), [bound]);
  const shouldLoad = Boolean(timelineId && !inlineSequence);
  const query = trpc.timeline.get.useQuery(
    { id: timelineId ?? "" },
    { enabled: shouldLoad, staleTime: 30_000 }
  );
  const loadedSequence = React.useMemo(
    () => resolveTimelineSequence(query.data),
    [query.data]
  );
  const sequence = inlineSequence ?? loadedSequence;

  if (sequence) {
    return (
      <FlexColumn gap={SPACING.sm}>
        <Box sx={timelineFrame(props.height)}>
          <React.Suspense
            fallback={<LoadingSpinner size="small" text="Loading preview" />}
          >
            <LazyTimelineRenderer
              sequence={sequence}
              ariaLabel="Timeline"
              showMetadata={props.showMetadata ?? true}
            />
          </React.Suspense>
        </Box>
        {!designMode && timelineId ? (
          <EditorButton
            onClick={() => {
              // A tab outside the active project is hidden, so open it in
              // the timeline's own project and bring that project forward.
              const projectId = sequence.projectId ?? activeProjectId;
              const input = {
                type: "timeline" as const,
                ref: timelineId,
                mode: "edit" as const,
                title: sequence.name
              };
              if (projectId) {
                openForegroundTab({ ...input, projectId });
              } else {
                openTab(input);
              }
              navigate("/workspace");
            }}
          >
            Open editable timeline
          </EditorButton>
        ) : null}
      </FlexColumn>
    );
  }
  if (shouldLoad && query.isLoading) {
    return <LoadingSpinner size="small" text="Loading timeline" />;
  }
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title="Could not load timeline"
        description={query.error.message}
      />
    );
  }
  if (designMode) {
    return (
      <Caption color="secondary">
        Bind this to a timeline output to preview it.
      </Caption>
    );
  }
  return (
    <Caption color="secondary">
      {props.placeholder ?? "No timeline yet"}
    </Caption>
  );
};
