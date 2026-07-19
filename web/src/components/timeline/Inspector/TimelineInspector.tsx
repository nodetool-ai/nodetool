/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelineInstance";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { usePersistedFold } from "./usePersistedFold";
import {
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  Panel,
  Text,
  Toast,
  SPACING,
  getSpacingPx,
  Z_INDEX
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
import { ClipActions } from "./ClipActions";
import { ClipAdjustments } from "./ClipAdjustments";
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

// Identity + clip action toolbar, pinned to the top of the scrolling panel so
// actions stay reachable (matching the generated-clip panels). Full-bleed via
// negative margins that cancel the panel's padding.
const stickyTopStyles = (theme: Theme) =>
  css({
    position: "sticky",
    top: 0,
    zIndex: Z_INDEX.sticky,
    backgroundColor: theme.vars.palette.background.default,
    marginTop: `-${getSpacingPx(SPACING.md)}`,
    marginLeft: `-${getSpacingPx(SPACING.lg)}`,
    marginRight: `-${getSpacingPx(SPACING.lg)}`,
    paddingTop: getSpacingPx(SPACING.md),
    paddingLeft: getSpacingPx(SPACING.lg),
    paddingRight: getSpacingPx(SPACING.lg),
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

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
  const track = useTimelineStore((s) =>
    clip ? s.tracks.find((t) => t.id === clip.trackId) : null
  );
  const fps = useTimelineStore((s) => s.fps);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);
  const patchClip = useTimelineStore((s) => s.patchClip);
  // The playhead is read imperatively only when splitting (a click). Subscribing
  // reactively would re-render this large panel on every seek/scrub for no
  // visible benefit.
  const playbackApi = useTimelinePlaybackStoreApi();
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const [toast, setToast] = useState<string | null>(null);

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

  // ── Header action handlers ──────────────────────────────────────────────

  const handleSplitAtPlayhead = useCallback(() => {
    if (!clip) return;
    const at = playbackApi.getState().getTimeMs();
    if (at > clip.startMs && at < clip.startMs + clip.durationMs) {
      splitClipAtTime(clip.id, at);
    } else {
      setToast("Move the playhead inside the clip to split it.");
    }
  }, [clip, playbackApi, splitClipAtTime]);

  const handleDelete = useCallback(() => {
    if (!clipId) return;
    deleteSelected(new Set([clipId]));
    setSelection([]);
  }, [clipId, deleteSelected, setSelection]);

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
        <Text size="small" sx={{ px: 0.5, color: "text.secondary" }}>
          Multi-clip editing is not yet supported.
        </Text>
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
      <div css={stickyTopStyles(theme)}>
        <InspectorHeader
          eyebrow="Clip"
          actions={[
            {
              icon: <ContentCutOutlinedIcon />,
              label: "Split at playhead",
              onClick: handleSplitAtPlayhead
            },
            {
              icon: <DeleteOutlineOutlinedIcon />,
              label: "Delete clip",
              onClick: handleDelete,
              variant: "danger"
            }
          ]}
        />
        <ClipActions clipId={clip.id} />
      </div>

      <ClipIdentityCard
        name={clip.name}
        metadata={identityMeta}
        accentColor={accentColor}
      />

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
              onCommit={(raw) => {
                const ms = parseTimecode(raw, fps);
                if (ms == null) return;
                patchClip(clip.id, { startMs: Math.max(0, ms) });
              }}
              minWidth={112}
              ariaLabel="Start timecode"
            />
          </InspectorRow>
          <InspectorRow label="Duration">
            <InspectorPillInput
              value={(clip.durationMs / 1000).toFixed(2)}
              unit="s"
              scrub={{ step: 0.02, min: 0.01 }}
              onCommit={(raw) => {
                const ms = parseSeconds(raw);
                if (ms == null || ms < 1) return;
                patchClip(clip.id, { durationMs: ms });
              }}
              ariaLabel="Duration in seconds"
            />
          </InspectorRow>
          <InspectorRow label="Speed">
            <InspectorPillInput
              value={(clip.speedMultiplier ?? 1).toFixed(2)}
              unit="×"
              scrub={{ step: 0.01, min: 0.1, max: 8 }}
              onCommit={(raw) =>
                onPatchNumber("speedMultiplier", raw, 0.1, 8)
              }
              ariaLabel="Playback speed"
            />
          </InspectorRow>
          <InspectorToggleRow
            label="Hidden"
            checked={!!clip.hidden}
            onChange={(next) => patchClip(clip.id, { hidden: next })}
          />
        </FlexColumn>
      </CollapsibleSection>

      <ClipAdjustments clip={clip} />

      <Toast
        open={toast !== null}
        message={toast ?? ""}
        onClose={() => setToast(null)}
        severity="info"
      />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
