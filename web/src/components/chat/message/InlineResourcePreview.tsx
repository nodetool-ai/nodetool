/**
 * InlineResourcePreview — a sketch or timeline rendered directly in chat prose.
 *
 * The agent embeds a document with image syntax (`![Label](sketch://sk_1)`,
 * `![Label](timeline://tl_7)`); ChatMarkdown routes those two kinds here. The
 * component fetches the document and renders the same read-only renderer the
 * editors ship, with a ResourceChip beneath it to open the document in its
 * editor. Anything that cannot be previewed — unknown kind, load failure, a
 * document today's renderer cannot resolve — degrades to the chip alone.
 */
import React, { useMemo } from "react";
import { parseResourceUri, type ResourceKind } from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import {
  resolveSketchDocument,
  resolveTimelineSequence
} from "../../node/outputValueResolvers";
import ResourceChip from "./ResourceChip";

const LazySketchRenderer = React.lazy(
  () => import("../../sketch/SketchRenderer")
);
const LazyTimelineRenderer = React.lazy(
  () => import("../../timeline/TimelineRenderer")
);

const PREVIEW_KINDS: readonly ResourceKind[] = ["sketch", "timeline"];

/** True when the URI names a resource kind chat can render inline. */
export const isInlinePreviewUri = (uri: string): boolean => {
  const ref = parseResourceUri(uri);
  return ref !== null && PREVIEW_KINDS.includes(ref.kind);
};

const PREVIEW_HEIGHT = 280;

const frameSx = {
  width: "100%",
  height: PREVIEW_HEIGHT,
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.md
} as const;

const SketchPreview: React.FC<{ id: string }> = ({ id }) => {
  const query = trpc.sketch.get.useQuery({ id }, { staleTime: 30_000 });
  const document = useMemo(
    () => resolveSketchDocument(query.data),
    [query.data]
  );

  if (document) {
    return (
      <Box sx={frameSx}>
        <React.Suspense
          fallback={<LoadingSpinner size="small" text="Loading preview" />}
        >
          <LazySketchRenderer
            document={document}
            ariaLabel="Sketch preview"
            showDimensions
          />
        </React.Suspense>
      </Box>
    );
  }
  if (query.isLoading) {
    return <LoadingSpinner size="small" text="Loading sketch" />;
  }
  if (query.isError) {
    return <Caption color="secondary">Could not load this sketch.</Caption>;
  }
  return null;
};

const TimelinePreview: React.FC<{ id: string }> = ({ id }) => {
  const query = trpc.timeline.get.useQuery({ id }, { staleTime: 30_000 });
  const sequence = useMemo(
    () => resolveTimelineSequence(query.data),
    [query.data]
  );

  if (sequence) {
    return (
      <Box sx={frameSx}>
        <React.Suspense
          fallback={<LoadingSpinner size="small" text="Loading preview" />}
        >
          <LazyTimelineRenderer
            sequence={sequence}
            ariaLabel="Timeline preview"
            showMetadata
          />
        </React.Suspense>
      </Box>
    );
  }
  if (query.isLoading) {
    return <LoadingSpinner size="small" text="Loading timeline" />;
  }
  if (query.isError) {
    return <Caption color="secondary">Could not load this timeline.</Caption>;
  }
  return null;
};

interface InlineResourcePreviewProps {
  uri: string;
  label: string;
}

const InlineResourcePreview: React.FC<InlineResourcePreviewProps> = ({
  uri,
  label
}) => {
  const ref = useMemo(() => parseResourceUri(uri), [uri]);

  if (!ref || !PREVIEW_KINDS.includes(ref.kind)) {
    return <ResourceChip uri={uri} label={label} />;
  }

  return (
    <FlexColumn
      gap={SPACING.xs}
      align="flex-start"
      sx={{ width: "100%", minWidth: 0 }}
      data-testid="inline-resource-preview"
    >
      {ref.kind === "sketch" ? (
        <SketchPreview id={ref.id} />
      ) : (
        <TimelinePreview id={ref.id} />
      )}
      <ResourceChip uri={uri} label={label} />
    </FlexColumn>
  );
};

InlineResourcePreview.displayName = "InlineResourcePreview";

export default InlineResourcePreview;
