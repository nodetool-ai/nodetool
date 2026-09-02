/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";

import { makeClip } from "@nodetool-ai/timeline";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { usePersistedFold } from "./usePersistedFold";
import {
  Button,
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  Panel,
  Text,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { trackTypeAccent } from "../Tracks/trackVisuals";
import {
  ClipIdentityCard,
  InspectorDivider,
  InspectorHeader,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorStaticValue,
  InspectorToggleRow
} from "./InspectorPrimitives";
import {
  formatTimecode,
  parseSeconds,
  parseTimecode
} from "./InspectorPrimitives.helpers";
import { ClipAdjustments } from "./ClipAdjustments";
import { ClipStoryboardLink } from "./ClipStoryboardLink";
import { ClipAnimations } from "./ClipAnimations";
import { ClipShapeSection } from "./ClipShapeSection";
import { ClipTextStyleSection } from "./ClipTextStyleSection";
import { GeneratedClipPanel } from "./GeneratedClipPanel";
import { DirectGenClipPanel } from "./DirectGenClipPanel";

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyles = css({
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
  overflow: "auto"
});

const sectionContentStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: theme.spacing(0.5, 0, 2)
  });

const inspectorPanelSx = {
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto",
  boxSizing: "border-box"
};

// Hoisted so InspectorPillInput's memo holds — see ClipAdjustments.
const SCRUB_DURATION = { step: 0.02, min: 0.01 };
const SCRUB_SPEED = { step: 0.01, min: 0.1, max: 8 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// ── Component ──────────────────────────────────────────────────────────────

export const TimelineInspector: React.FC = memo(() => {
  const theme = useTheme();

  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  const selectedCount = selectedClipIds.size;

  // Persisted fold state — closed by default, remembered across selections
  // and reloads via localStorage.
  const [mediaOpen, setMediaOpen] = usePersistedFold("media");
  const [timingOpen, setTimingOpen] = usePersistedFold("timing");

  const clip = useTimelineStore((s) =>
    clipId ? (findClipById(s.clips, clipId) ?? null) : null
  );
  const textStyle = clip?.mediaType === "text" ? clip.textStyle : undefined;
  const shapeStyle = clip?.mediaType === "shape" ? clip.shapeStyle : undefined;
  const track = useTimelineStore((s) =>
    clip ? s.tracks.find((t) => t.id === clip.trackId) : null
  );
  // The group this clip inherits its transform, opacity and window from (D4).
  // Read-only here: parenting is set from the lane and by the agent ops.
  const parentName = useTimelineStore((s) =>
    clip?.parentId
      ? (findClipById(s.clips, clip.parentId)?.name ?? clip.parentId)
      : null
  );
  const fps = useTimelineStore((s) => s.fps);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
  const patchClip = useTimelineStore((s) => s.patchClip);
  const addClip = useTimelineStore((s) => s.addClip);
  const storeApi = useTimelineStoreApi();
  const history = useTimelineHistoryBatch();

  /**
   * Wrap the selection in a group clip (D4): one clip with
   * `mediaType: "group"` spanning the selection, and a `parentId` on each
   * member. Children keep their own tracks, so layer order is untouched (I9);
   * the group takes the track of the topmost selected clip so its bracket
   * renders above what it holds. The whole thing is one undo entry.
   */
  const groupSelection = useCallback(() => {
    const state = storeApi.getState();
    const members = state.clips.filter((candidate) =>
      selectedClipIds.has(candidate.id)
    );
    if (members.length < 2) return;
    const startMs = Math.min(...members.map((member) => member.startMs));
    const endMs = Math.max(
      ...members.map((member) => member.startMs + member.durationMs)
    );
    const trackIndexOf = (trackId: string) => {
      const index = state.tracks.findIndex((track) => track.id === trackId);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    const topTrackId = members.reduce((top, member) =>
      trackIndexOf(member.trackId) < trackIndexOf(top.trackId) ? member : top
    ).trackId;

    const group = makeClip({
      trackId: topTrackId,
      name: "Group",
      mediaType: "group",
      sourceType: "imported",
      status: "generated",
      startMs,
      durationMs: Math.max(1, endMs - startMs)
    });

    history.begin();
    addClip(group);
    history.mark();
    for (const member of members) {
      patchClip(member.id, { parentId: group.id });
      history.mark();
    }
    history.end();
  }, [addClip, history, patchClip, selectedClipIds, storeApi]);

  const onPatchNumber = useCallback(
    (field: string, raw: string, min?: number, max?: number) => {
      if (!clipId) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const value =
        min != null && max != null ? clamp(parsed, min, max) : parsed;
      patchClip(clipId, { [field]: value });
    },
    [clipId, patchClip]
  );

  // The timing rows feed memoized pills, so these handlers need a stable
  // identity — otherwise editing one re-renders the other two.
  const handleStartCommit = useCallback(
    (raw: string) => {
      if (!clipId) return;
      const ms = parseTimecode(raw, fps);
      if (ms == null) return;
      patchClip(clipId, { startMs: Math.max(0, ms) });
    },
    [clipId, fps, patchClip]
  );

  const handleDurationCommit = useCallback(
    (raw: string) => {
      if (!clipId) return;
      const ms = parseSeconds(raw);
      if (ms == null || ms < 1) return;
      patchClip(clipId, { durationMs: ms });
    },
    [clipId, patchClip]
  );

  const handleSpeedCommit = useCallback(
    (raw: string) => onPatchNumber("speedMultiplier", raw, 0.1, 8),
    [onPatchNumber]
  );

  const handleHiddenChange = useCallback(
    (next: boolean) => {
      if (!clipId) return;
      patchClip(clipId, { hidden: next });
    },
    [clipId, patchClip]
  );

  // ── Identity metadata ───────────────────────────────────────────────────

  const accentColor = useMemo(
    () => (track ? trackTypeAccent(theme, track.type) : undefined),
    [track, theme]
  );

  const identityMeta = useMemo<string[]>(() => {
    if (!clip) return [];
    const parts: string[] = [clip.mediaType];
    const secs = clip.durationMs / 1000;
    parts.push(secs < 10 ? `${secs.toFixed(2)}s` : `${secs.toFixed(1)}s`);
    if (clip.width && clip.height) {
      parts.push(`${clip.width}×${clip.height}`);
    }
    return parts;
  }, [clip]);

  // ── Empty / multi-selection states ──────────────────────────────────────

  if (selectedCount === 0) {
    return (
      <Panel
        background="default"
        bordered={false}
        css={containerStyles}
        sx={inspectorPanelSx}
      >
        <InspectorHeader eyebrow="Inspector" />
        <EmptyState
          variant="empty"
          size="small"
          title="No selection"
          description="Select a clip on the timeline to edit its properties."
        />
      </Panel>
    );
  }

  if (selectedCount > 1) {
    return (
      <Panel
        background="default"
        bordered={false}
        css={containerStyles}
        sx={inspectorPanelSx}
      >
        <InspectorHeader
          eyebrow={`${selectedCount} Clips`}
          actions={[
            {
              icon: <DeleteOutlineOutlinedIcon />,
              label: "Delete selection",
              onClick: () => deleteSelected(selectedClipIds),
              variant: "danger"
            }
          ]}
        />
        <FlexColumn gap={SPACING.md} sx={{ px: SPACING.micro }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderOutlinedIcon />}
            onClick={groupSelection}
          >
            Group selected clips
          </Button>
          <Text size="small" sx={{ color: "text.secondary" }}>
            Grouping parents these clips to one group clip: it moves, trims and
            fades them together. Per-field editing of several clips at once is
            not yet supported.
          </Text>
        </FlexColumn>
      </Panel>
    );
  }

  if (!clip) return null;

  // Direct-gen and workflow-bound generated clips keep their bespoke panels.
  if (clip.sourceType === "generated") {
    if (
      clip.bindingKind === "text-to-image" ||
      clip.bindingKind === "image-to-image" ||
      clip.bindingKind === "text-to-video" ||
      clip.bindingKind === "text-to-audio"
    ) {
      return <DirectGenClipPanel clipId={clip.id} />;
    }
    return <GeneratedClipPanel clipId={clip.id} />;
  }

  // ── Imported-clip inspector ─────────────────────────────────────────────

  return (
    <Panel
      background="default"
      bordered={false}
      css={containerStyles}
      sx={inspectorPanelSx}
    >
      <ClipIdentityCard
        name={clip.name}
        metadata={identityMeta}
        accentColor={accentColor}
      />

      {/* Shot clips are assembled as imported media, so this branch is the
          only one a board link can reach. */}
      <ClipStoryboardLink clip={clip} />

      {textStyle && <ClipTextStyleSection clip={clip} textStyle={textStyle} />}

      {shapeStyle && <ClipShapeSection clip={clip} shapeStyle={shapeStyle} />}

      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Media"
            icon={<PermMediaOutlinedIcon />}
          />
        }
        open={mediaOpen}
        onToggle={setMediaOpen}
        unmountOnExit
      >
        <FlexColumn css={sectionContentStyles(theme)}>
          <InspectorRow label="Type">
            <InspectorStaticValue value={clip.mediaType} />
          </InspectorRow>
          <InspectorRow label="Asset">
            <InspectorStaticValue value={clip.currentAssetId ?? "—"} />
          </InspectorRow>
          {parentName !== null && (
            <InspectorRow label="Parent">
              <InspectorStaticValue value={parentName} />
            </InspectorRow>
          )}
        </FlexColumn>
      </CollapsibleSection>

      <InspectorDivider />

      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Timing"
            icon={<ScheduleOutlinedIcon />}
          />
        }
        open={timingOpen}
        onToggle={setTimingOpen}
        unmountOnExit
      >
        <FlexColumn css={sectionContentStyles(theme)}>
          <InspectorRow label="Start">
            <InspectorPillInput
              value={formatTimecode(clip.startMs, fps)}
              onCommit={handleStartCommit}
              minWidth={112}
              ariaLabel="Start timecode"
            />
          </InspectorRow>
          <InspectorRow label="Duration">
            <InspectorPillInput
              value={(clip.durationMs / 1000).toFixed(2)}
              unit="s"
              scrub={SCRUB_DURATION}
              onCommit={handleDurationCommit}
              ariaLabel="Duration in seconds"
            />
          </InspectorRow>
          <InspectorRow label="Speed">
            <InspectorPillInput
              value={(clip.speedMultiplier ?? 1).toFixed(2)}
              unit="×"
              scrub={SCRUB_SPEED}
              onCommit={handleSpeedCommit}
              ariaLabel="Playback speed"
            />
          </InspectorRow>
          <InspectorToggleRow
            label="Hidden"
            checked={!!clip.hidden}
            onChange={handleHiddenChange}
          />
        </FlexColumn>
      </CollapsibleSection>

      <ClipAdjustments clip={clip} />

      <ClipAnimations clip={clip} />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
