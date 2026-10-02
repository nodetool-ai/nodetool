/**
 * The picture on a project document card.
 *
 * Four ways a document shows what it is, in the order the summary can answer:
 * the stills a board or a sketch has rendered, a script's opening lines with
 * their voicing state, a cut's tracks as bars, and — for the kinds that carry
 * no glance of their own — the type's glyph.
 */

import { memo, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  SPACING,
  SPACING_PX,
  getSpacingPx,
  TYPOGRAPHY
} from "../ui_primitives";
import { trackTypeAccent, trackTypeMeta } from "../timeline/Tracks/trackVisuals";
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
          preferThumbnail
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
              width: getSpacingPx(SPACING.sm),
              height: getSpacingPx(SPACING.sm),
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

/** Where the faint time grid falls behind each lane, as a share of the span. */
const GRID_STOPS = [0.25, 0.5, 0.75];

/** Width of the track-name column; wide enough for "V1 Main" before it ellipsizes. */
const TRACK_LABEL_WIDTH = `${SPACING_PX.xxxl * 2}px`;

const TrackBars = ({ preview }: { preview: TimelinePreview }) => {
  const theme = useTheme();
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
        sx={{ px: SPACING.lg, py: SPACING.md }}
      >
        {preview.tracks.map((track, trackIndex) => {
          const accent = trackTypeAccent(theme, track.type);
          return (
            <FlexRow
              key={`${trackIndex}-${track.name}`}
              align="center"
              gap={SPACING.md}
              sx={{
                flex: 1,
                minHeight: 0,
                maxHeight: getSpacingPx(SPACING.xxl)
              }}
            >
              <FlexRow
                align="center"
                gap={SPACING.sm}
                sx={{ flex: `0 0 ${TRACK_LABEL_WIDTH}`, minWidth: 0 }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: getSpacingPx(SPACING.sm),
                    height: getSpacingPx(SPACING.sm),
                    flexShrink: 0,
                    borderRadius: BORDER_RADIUS.circle,
                    bgcolor: accent
                  }}
                />
                <Box
                  component="span"
                  title={track.name || trackTypeMeta(track.type).label}
                  sx={{
                    ...TYPOGRAPHY.sans.caption,
                    color: "text.secondary",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {track.name || trackTypeMeta(track.type).label}
                </Box>
              </FlexRow>
              <Box
                sx={{
                  position: "relative",
                  flex: 1,
                  alignSelf: "stretch",
                  borderRadius: BORDER_RADIUS.xs,
                  bgcolor: `color-mix(in srgb, ${accent} 6%, transparent)`,
                  overflow: "hidden"
                }}
              >
                {GRID_STOPS.map((stop) => (
                  <Box
                    key={stop}
                    aria-hidden
                    sx={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${stop * 100}%`,
                      borderLeft: "1px solid",
                      borderColor: "divider",
                      opacity: 0.5
                    }}
                  />
                ))}
                {span > 0 &&
                  track.clips.map((clip, index) => (
                    <Box
                      key={index}
                      data-testid="preview-clip"
                      sx={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${(clip.startMs / span) * 100}%`,
                        width: `${Math.max((clip.durationMs / span) * 100, 1)}%`,
                        minWidth: getSpacingPx(SPACING.xs),
                        borderRadius: BORDER_RADIUS.xs,
                        bgcolor: `color-mix(in srgb, ${accent} 32%, transparent)`,
                        borderLeft: "2px solid",
                        borderColor: accent,
                        // A hairline of lane colour between butted clips keeps
                        // back-to-back cuts readable as separate clips.
                        boxShadow: `inset -1px 0 0 color-mix(in srgb, ${accent} 12%, transparent)`
                      }}
                    />
                  ))}
              </Box>
            </FlexRow>
          );
        })}
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
  if (
    document.preview?.kind === "timeline" &&
    document.preview.tracks.length > 0
  ) {
    return <TrackBars preview={document.preview} />;
  }
  return <GlyphPlaceholder document={document} />;
};

export default memo(ProjectDocumentPreview);
