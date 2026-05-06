/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  FormField,
  NodeSelect,
  NodeSlider,
  NodeTextField,
  NodeMenuItem,
  Panel,
  Text,
  Toast
} from "../../ui_primitives";

const containerStyles = css({ width: "100%", padding: 8, overflow: "auto" });
const sectionContentStyles = css({ padding: 8 });

const BLEND_MODES = ["normal", "screen", "multiply", "add", "overlay"] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const TimelineInspector: React.FC = memo(() => {
  const navigate = useNavigate();
  const theme = useTheme();
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  const selectedCount = selectedClipIds.size;

  const clip = useTimelineStore((s) => (clipId ? s.clips.find((c) => c.id === clipId) : null));
  const track = useTimelineStore((s) => (clip ? s.tracks.find((t) => t.id === clip.trackId) : null));
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
  const setClipLocked = useTimelineStore((s) => s.setClipLocked);
  const patchClip = useTimelineStore((s) => s.patchClip);
  const [toast, setToast] = useState<string | null>(null);

  const onPatchNumber = useCallback((field: string, raw: string, min?: number, max?: number) => {
    if (!clipId) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = min != null && max != null ? clamp(parsed, min, max) : parsed;
    patchClip(clipId, { [field]: value });
  }, [clipId, patchClip]);

  const isAudio = clip?.mediaType === "audio";
  const isOverlay = track?.type === "overlay";

  const renderField = useCallback((label: string, value: number | undefined, onCommit: (value: string) => void) => (
    <FormField label={label}>
      <NodeTextField size="small" value={value ?? ""} onChange={(e) => onCommit(e.target.value)} />
    </FormField>
  ), []);

  if (selectedCount === 0) {
    return <EmptyState variant="empty" size="small" title="Inspector" description="Select a clip to inspect" />;
  }

  if (selectedCount > 1) {
    return (
      <Panel sx={{ width: "100%", p: 1 }}>
        <Text weight="medium">{selectedCount} clips selected</Text>
        <FlexRow sx={{ gap: theme.spacing(1), mt: 1 }}>
          <EditorButton onClick={() => deleteSelected(selectedClipIds)}>Delete</EditorButton>
          <EditorButton disabled>Lock</EditorButton>
          <EditorButton disabled>Mute</EditorButton>
        </FlexRow>
      </Panel>
    );
  }

  if (!clip) return null;

  return (
    <Panel css={containerStyles}>
      <FlexColumn gap={1}>
        <CollapsibleSection title="Media" defaultOpen>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <Text size="small">Name: {clip.name}</Text>
            <Text size="small">Type: {clip.mediaType}</Text>
            <Text size="small">Asset: {clip.currentAssetId ?? "—"}</Text>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Timing" defaultOpen>
          <FlexColumn css={sectionContentStyles} gap={1}>
            {renderField("Start (ms)", clip.startMs, (v) => onPatchNumber("startMs", v, 0, Number.MAX_SAFE_INTEGER))}
            {renderField("Duration (ms)", clip.durationMs, (v) => onPatchNumber("durationMs", v, 1, Number.MAX_SAFE_INTEGER))}
            {renderField("In point (ms)", clip.inPointMs ?? 0, (v) => onPatchNumber("inPointMs", v, 0, Number.MAX_SAFE_INTEGER))}
            {renderField("Out point (ms)", clip.outPointMs ?? clip.durationMs, (v) => onPatchNumber("outPointMs", v, 1, Number.MAX_SAFE_INTEGER))}
            {renderField("Speed", clip.speedMultiplier ?? 1, (v) => onPatchNumber("speedMultiplier", v, 0.1, 8))}
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Render" defaultOpen>
          <FlexColumn css={sectionContentStyles} gap={1}>
            {!isAudio && (
              <FormField label="Opacity">
                <NodeSlider min={0} max={1} step={0.01} value={clip.opacity ?? 1} onChange={(_e, value) => patchClip(clip.id, { opacity: Array.isArray(value) ? value[0] : value })} />
              </FormField>
            )}
            {isOverlay && !isAudio && (
              <FormField label="Blend mode">
                <NodeSelect value={clip.blendMode ?? "normal"} onChange={(e) => patchClip(clip.id, { blendMode: e.target.value as (typeof BLEND_MODES)[number] })}>
                  {BLEND_MODES.map((mode) => <NodeMenuItem key={mode} value={mode}>{mode}</NodeMenuItem>)}
                </NodeSelect>
              </FormField>
            )}
            {isAudio && (
              <>
                {renderField("Volume (dB)", clip.volumeDb ?? 0, (v) => onPatchNumber("volumeDb", v, -60, 12))}
                {renderField("Fade in (ms)", clip.fadeInMs ?? 0, (v) => onPatchNumber("fadeInMs", v, 0, Math.floor(clip.durationMs / 2)))}
                {renderField("Fade out (ms)", clip.fadeOutMs ?? 0, (v) => onPatchNumber("fadeOutMs", v, 0, Math.floor(clip.durationMs / 2)))}
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Actions" defaultOpen>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <EditorButton onClick={() => setToast("Replace media picker coming soon")}>Replace Media</EditorButton>
            <EditorButton onClick={() => navigate("/assets")}>Reveal in Library</EditorButton>
            <EditorButton onClick={() => setToast("Convert to Generated Clip will be wired in NOD-306")}>Convert to Generated Clip</EditorButton>
            <EditorButton onClick={() => setClipLocked(clip.id, !clip.locked)}>{clip.locked ? "Unlock" : "Lock"}</EditorButton>
          </FlexColumn>
        </CollapsibleSection>
      </FlexColumn>
      <Toast open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} severity="info" />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
