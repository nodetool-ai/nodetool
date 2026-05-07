/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ClipActions } from "./ClipActions";
import { NodePropertyEditor } from "./NodePropertyEditor";
import { GeneratedClipPanel } from "./GeneratedClipPanel";

const containerStyles = css({ width: "100%", padding: 8, overflow: "auto" });
const sectionContentStyles = css({ padding: 8 });

const BLEND_MODES = ["normal", "screen", "multiply", "add", "overlay"] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Numeric field with local draft state — only commits on blur or Enter.
 * Avoids patching the store on every keystroke.
 */
const NumericField: React.FC<{
  label: string;
  value: number | undefined;
  onCommit: (raw: string) => void;
}> = ({ label, value, onCommit }) => {
  const initial = value ?? "";
  const [draft, setDraft] = useState<string>(String(initial));

  // Re-sync when the underlying value changes (e.g. clip selection swap).
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    if (draft === String(value ?? "")) return;
    onCommit(draft);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <FormField label={label}>
      <NodeTextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </FormField>
  );
};

export const TimelineInspector: React.FC = memo(() => {
  const navigate = useNavigate();
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  const selectedCount = selectedClipIds.size;

  const clip = useTimelineStore((s) => (clipId ? s.clips.find((c) => c.id === clipId) : null));
  const track = useTimelineStore((s) => (clip ? s.tracks.find((t) => t.id === clip.trackId) : null));
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
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

  if (selectedCount === 0) {
    return <EmptyState variant="empty" size="small" title="Inspector" description="Select a clip to inspect" />;
  }

  if (selectedCount > 1) {
    return (
      <Panel sx={{ width: "100%", p: 1 }}>
        <Text weight={500}>{selectedCount} clips selected</Text>
        <FlexRow gap={1} sx={{ mt: 1 }}>
          <EditorButton onClick={() => deleteSelected(selectedClipIds)}>Delete</EditorButton>
          <EditorButton disabled>Lock</EditorButton>
          <EditorButton disabled>Mute</EditorButton>
        </FlexRow>
      </Panel>
    );
  }

  if (!clip) return null;

  // Generated clips get the full GeneratedClipPanel with node stack + property editor.
  if (clip.sourceType === "generated") {
    return <GeneratedClipPanel clipId={clip.id} />;
  }

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
            <NumericField label="Start (ms)" value={clip.startMs} onCommit={(v) => onPatchNumber("startMs", v, 0, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Duration (ms)" value={clip.durationMs} onCommit={(v) => onPatchNumber("durationMs", v, 1, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="In point (ms)" value={clip.inPointMs ?? 0} onCommit={(v) => onPatchNumber("inPointMs", v, 0, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Out point (ms)" value={clip.outPointMs ?? clip.durationMs} onCommit={(v) => onPatchNumber("outPointMs", v, 1, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Speed" value={clip.speedMultiplier ?? 1} onCommit={(v) => onPatchNumber("speedMultiplier", v, 0.1, 8)} />
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
                <NumericField label="Volume (dB)" value={clip.volumeDb ?? 0} onCommit={(v) => onPatchNumber("volumeDb", v, -60, 12)} />
                <NumericField label="Fade in (ms)" value={clip.fadeInMs ?? 0} onCommit={(v) => onPatchNumber("fadeInMs", v, 0, Math.floor(clip.durationMs / 2))} />
                <NumericField label="Fade out (ms)" value={clip.fadeOutMs ?? 0} onCommit={(v) => onPatchNumber("fadeOutMs", v, 0, Math.floor(clip.durationMs / 2))} />
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Actions" defaultOpen>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <ClipActions clipId={clip.id} />
            <EditorButton onClick={() => setToast("Replace media picker coming soon")}>Replace Media</EditorButton>
            <EditorButton onClick={() => navigate("/assets")}>Reveal in Library</EditorButton>
            <EditorButton onClick={() => setToast("Convert to Generated Clip will be wired in NOD-306")}>Convert to Generated Clip</EditorButton>
          </FlexColumn>
        </CollapsibleSection>

        {clip.workflowId && (
          <CollapsibleSection title="Parameters" defaultOpen>
            <FlexColumn css={sectionContentStyles} gap={1}>
              <NodePropertyEditor
                clipId={clip.id}
                workflowId={clip.workflowId}
              />
            </FlexColumn>
          </CollapsibleSection>
        )}
      </FlexColumn>
      <Toast open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} severity="info" />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
