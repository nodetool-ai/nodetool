/**
 * The picture on a project document card.
 *
 * Four ways a document shows what it is, in the order the summary can answer:
 * the stills a board or a sketch has rendered, a script's opening lines with
 * their voicing state, a cut's tracks as bars, and — for the kinds that carry
 * no glance of their own — the type's glyph.
 */

import { memo, type ReactNode } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import type { ProjectDocument } from "./projectStatus";

/** Height of the media area, per the overview mockup's card geometry. */
const PREVIEW_HEIGHT = 120;

type Preview = NonNullable<ProjectDocument["preview"]>;
type ScriptPreview = Extract<Preview, { kind: "script" }>;
type TimelinePreview = Extract<Preview, { kind: "timeline" }>;

/** A line's dot: voiced reads as done, stale as needing another pass. */
const LINE_STATE_COLOR: Record<ScriptPreview["lines"][number]["state"], string> =
  {
    voiced: "var(--palette-success-main)",
    stale: "var(--palette-warning-main)",
    draft: "var(--palette-text-disabled)"
  };

const TRACK_COLOR: Record<TimelinePreview["tracks"][number]["type"], string> = {
  video: colorForType("video"),
  audio: colorForType("audio"),
  overlay: colorForType("image"),
  subtitle: colorForType("str")
};

const Frame = ({ children }: { children: ReactNode }) => (
  <Box
    sx={{
      height: `${PREVIEW_HEIGHT}px`,
      bgcolor: "background.default",
      overflow: "hidden"
    }}
  >
    {children}
  </Box>
);

const StillStrip = ({ document }: { document: ProjectDocument }) => (
  <Frame>
    <Box
      sx={{
        height: "100%",
        display: "grid",
        gap: SPACING.micro,
        gridTemplateColumns: `repeat(${document.thumbnails.length}, minmax(0, 1fr))`
      }}
    >
      {document.thumbnails.map((still, index) => (
        <ResponsiveImage
          key={still.asset_id ?? still.uri ?? index}
          locator={still}
          alt=""
          fit="cover"
          sx={{ width: "100%", height: "100%" }}
        />
      ))}
    </Box>
  </Frame>
);

const ScriptLines = ({ preview }: { preview: ScriptPreview }) => (
  <Frame>
    <FlexColumn gap={SPACING.md} sx={{ p: SPACING.lg, bgcolor: "background.paper" }}>
      {preview.lines.map((line, index) => (
        <FlexRow key={index} align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              width: "6px",
              height: "6px",
              flexShrink: 0,
              borderRadius: BORDER_RADIUS.circle,
              bgcolor: LINE_STATE_COLOR[line.state]
            }}
          />
          {line.speaker && (
            <Box
              component="span"
              sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}
            >
              {line.speaker}
            </Box>
          )}
          <Caption
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {line.text}
          </Caption>
          {line.state === "stale" && (
            <Box
              component="span"
              sx={{
                ...TYPOGRAPHY.mono.caption,
                color: "warning.main"
              }}
            >
              stale
            </Box>
          )}
        </FlexRow>
      ))}
    </FlexColumn>
  </Frame>
);

const TrackBars = ({ preview }: { preview: TimelinePreview }) => {
  // A cut with no duration recorded still has clips; lay them out against the
  // span they cover rather than dividing by zero.
  const span =
    preview.durationMs > 0
      ? preview.durationMs
      : preview.tracks.reduce(
          (max, track) =>
            track.clips.reduce(
              (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
              max
            ),
          0
        );
  return (
    <Frame>
      <FlexColumn
        gap={SPACING.sm}
        justify="center"
        fullHeight
        sx={{ p: SPACING.lg }}
      >
        {preview.tracks.map((track) => (
          <FlexRow key={track.name} align="center" gap={SPACING.sm}>
            <Box
              component="span"
              sx={{
                width: "30px",
                flexShrink: 0,
                ...TYPOGRAPHY.mono.caption,
                color: "text.disabled"
              }}
            >
              {track.name}
            </Box>
            <Box sx={{ position: "relative", flex: 1, height: "18px" }}>
              {span > 0 &&
                track.clips.map((clip, index) => (
                  <Box
                    key={index}
                    sx={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${(clip.startMs / span) * 100}%`,
                      width: `${Math.max((clip.durationMs / span) * 100, 1)}%`,
                      borderRadius: BORDER_RADIUS.xs,
                      border: "1px solid",
                      borderColor: TRACK_COLOR[track.type],
                      opacity: 0.7
                    }}
                  />
                ))}
            </Box>
          </FlexRow>
        ))}
      </FlexColumn>
    </Frame>
  );
};

const GlyphPlaceholder = ({ document }: { document: ProjectDocument }) => (
  <Frame>
    <FlexRow align="center" justify="center" fullHeight>
      <Box
        component="span"
        aria-hidden
        sx={{ color: TYPE_COLOR[document.type], ...TYPOGRAPHY.sans.title }}
      >
        {TYPE_GLYPH[document.type]}
      </Box>
    </FlexRow>
  </Frame>
);

const ProjectDocumentPreview = ({
  document
}: {
  document: ProjectDocument;
}) => {
  if (document.thumbnails.length > 0) {
    return <StillStrip document={document} />;
  }
  if (document.preview?.kind === "script") {
    return <ScriptLines preview={document.preview} />;
  }
  if (document.preview?.kind === "timeline") {
    return <TrackBars preview={document.preview} />;
  }
  return <GlyphPlaceholder document={document} />;
};

export default memo(ProjectDocumentPreview);
