/**
 * Audio effects section for audio and midi clips: the real-time chain a clip
 * plays through before its track (`clip.audioEffects`), and a button that
 * opens the clip's audio in the audio editor for offline edits.
 *
 * The chain plays live in the preview and renders the same in both exports
 * (see `preview/audioEffectNodes.ts` and the server mix). Every change is one
 * `patchClip` call, so each is one undo step.
 */

import React, { lazy, memo, Suspense, useCallback, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowDownwardOutlinedIcon from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import type { Theme } from "@mui/material/styles";
import {
  makeClipAudioEffect,
  type ClipAudioEffect,
  type TimelineClip,
  type TrackFilterEffect
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  Checkbox,
  CollapsibleSection,
  DeleteButton,
  EditorMenu,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  ToolbarIconButton,
  TruncatedText,
  TYPOGRAPHY
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  INSPECTOR_ROW_BUTTON_SX,
  InspectorDivider,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";
import {
  CLIP_AUDIO_EFFECT_LABELS,
  CLIP_AUDIO_EFFECT_TYPES,
  CLIP_AUDIO_KNOBS,
  formatKnob,
  type ClipAudioKnob
} from "./clipAudioEffectKnobs";

const ClipAudioEditorDialog = lazy(() => import("./ClipAudioEditorDialog"));

const FILTER_MODE_OPTIONS = [
  { value: "lowpass", label: "Low-pass" },
  { value: "highpass", label: "High-pass" },
  { value: "bandpass", label: "Band-pass" }
] as const;

const ROW_SX = {
  borderTop: (theme: Theme) => `1px solid ${theme.vars.palette.divider}`,
  pt: SPACING.md
};

type EffectPatch = Record<string, number | string | boolean>;

interface EffectFieldsProps {
  effect: ClipAudioEffect;
  onPatch: (patch: EffectPatch) => void;
}

const EffectFields: React.FC<EffectFieldsProps> = memo(({ effect, onPatch }) => {
  // The table is keyed by type, so the knobs read fields `effect` carries.
  const knobs = CLIP_AUDIO_KNOBS[effect.type] as ClipAudioKnob<ClipAudioEffect>[];
  const values = effect as unknown as Record<string, number>;
  return (
    <FlexColumn gap={SPACING.xs}>
      {effect.type === "filter" && (
        <InspectorRow label="Mode">
          <InspectorSelect
            label="Filter mode"
            value={effect.mode}
            options={FILTER_MODE_OPTIONS}
            onChange={(mode) => onPatch({ mode: mode as TrackFilterEffect["mode"] })}
          />
        </InspectorRow>
      )}
      {knobs.map((knob) => {
        const key = String(knob.key);
        const value = values[key];
        return (
          <InspectorSliderRow
            key={key}
            label={knob.label}
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={value}
            origin={knob.origin}
            display={formatKnob(knob, value)}
            onChange={(next) => onPatch({ [key]: next })}
          />
        );
      })}
    </FlexColumn>
  );
});
EffectFields.displayName = "EffectFields";

interface EffectRowProps {
  effect: ClipAudioEffect;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onExpand: (id: string) => void;
  onPatch: (id: string, patch: EffectPatch) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}

/** One effect's header and, when expanded, its sliders. */
const EffectRow: React.FC<EffectRowProps> = memo(
  ({ effect, isFirst, isLast, expanded, onExpand, onPatch, onRemove, onMove }) => {
    const { id } = effect;
    const name = CLIP_AUDIO_EFFECT_LABELS[effect.type];
    const patch = useCallback(
      (next: EffectPatch) => onPatch(id, next),
      [id, onPatch]
    );

    return (
      <FlexColumn gap={SPACING.xs} sx={ROW_SX}>
        <FlexRow align="center" gap={SPACING.micro}>
          <Checkbox
            compact
            size="small"
            checked={effect.enabled}
            onChange={(_, enabled) => onPatch(id, { enabled })}
            slotProps={{ input: { "aria-label": `${name} enabled` } }}
          />
          <Button
            variant="text"
            size="small"
            aria-expanded={expanded}
            onClick={() => onExpand(id)}
            startIcon={
              expanded ? <ExpandMoreOutlinedIcon /> : <ChevronRightOutlinedIcon />
            }
            sx={{
              flex: 1,
              minWidth: 0,
              justifyContent: "flex-start",
              color: effect.enabled ? "text.primary" : "text.secondary",
              px: SPACING.xs
            }}
          >
            <TruncatedText component="span" sx={TYPOGRAPHY.sans.label}>
              {name}
            </TruncatedText>
          </Button>
          <ToolbarIconButton
            icon={<ArrowUpwardOutlinedIcon />}
            tooltip="Move earlier in the chain"
            aria-label={`Move ${name} up`}
            size="small"
            disabled={isFirst}
            onClick={() => onMove(id, -1)}
          />
          <ToolbarIconButton
            icon={<ArrowDownwardOutlinedIcon />}
            tooltip="Move later in the chain"
            aria-label={`Move ${name} down`}
            size="small"
            disabled={isLast}
            onClick={() => onMove(id, 1)}
          />
          <DeleteButton
            onClick={() => onRemove(id)}
            tooltip={`Remove ${name}`}
            ariaLabel={`Remove ${name}`}
            iconVariant="clear"
            sx={INSPECTOR_ROW_BUTTON_SX}
          />
        </FlexRow>
        {expanded && <EffectFields effect={effect} onPatch={patch} />}
      </FlexColumn>
    );
  }
);
EffectRow.displayName = "EffectRow";

interface ClipAudioEffectsProps {
  clip: TimelineClip;
}

export const ClipAudioEffects: React.FC<ClipAudioEffectsProps> = memo(({ clip }) => {
  const patchClip = useTimelineStore((s) => s.patchClip);
  const [open, setOpen] = usePersistedFold("audioEffects");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Handlers merge onto the latest clip without changing identity per edit.
  const clipRef = useRef(clip);
  clipRef.current = clip;

  const setEffects = useCallback(
    (audioEffects: ClipAudioEffect[]) => {
      patchClip(clipRef.current.id, { audioEffects });
    },
    [patchClip]
  );

  const handleAdd = (type: ClipAudioEffect["type"]) => {
    const effect = makeClipAudioEffect(type);
    setEffects([...(clipRef.current.audioEffects ?? []), effect]);
    setExpandedId(effect.id);
    setMenuAnchor(null);
  };

  const expandEffect = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const patchEffect = useCallback(
    (id: string, patch: EffectPatch) => {
      setEffects(
        (clipRef.current.audioEffects ?? []).map((effect) =>
          // The patch comes from this effect type's own controls.
          effect.id === id ? ({ ...effect, ...patch } as ClipAudioEffect) : effect
        )
      );
    },
    [setEffects]
  );

  const removeEffect = useCallback(
    (id: string) => {
      setEffects(
        (clipRef.current.audioEffects ?? []).filter((effect) => effect.id !== id)
      );
    },
    [setEffects]
  );

  const moveEffect = useCallback(
    (id: string, delta: -1 | 1) => {
      const effects = [...(clipRef.current.audioEffects ?? [])];
      const from = effects.findIndex((effect) => effect.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= effects.length) return;
      [effects[from], effects[to]] = [effects[to], effects[from]];
      setEffects(effects);
    },
    [setEffects]
  );

  const closeEditor = useCallback(() => setEditorOpen(false), []);

  const effects = clip.audioEffects ?? [];
  const canEditAudio = clip.mediaType === "audio" && !!clip.currentAssetId;
  const inPointMs = clip.inPointMs ?? 0;
  const sourceWindow = {
    start: inPointMs / 1000,
    end: (clip.outPointMs ?? inPointMs + clip.durationMs) / 1000
  };

  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <FlexRow align="center" gap={SPACING.md}>
            <InspectorSectionTitle
              title="Audio effects"
              icon={<GraphicEqOutlinedIcon />}
            />
            {effects.length > 0 && (
              <Caption color="muted">
                {effects.filter((effect) => effect.enabled).length}/
                {effects.length} active
              </Caption>
            )}
          </FlexRow>
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.md} sx={{ py: SPACING.xs }}>
          <FlexRow align="center" gap={SPACING.xs}>
            <Button
              size="small"
              variant="text"
              startIcon={<AddOutlinedIcon />}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAnchor)}
            >
              Add effect
            </Button>
            {canEditAudio && (
              <Button
                size="small"
                variant="text"
                startIcon={<EditOutlinedIcon />}
                onClick={() => setEditorOpen(true)}
              >
                Edit audio…
              </Button>
            )}
          </FlexRow>
          <EditorMenu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            {CLIP_AUDIO_EFFECT_TYPES.map((type) => (
              <MenuItemPrimitive
                key={type}
                label={CLIP_AUDIO_EFFECT_LABELS[type]}
                onClick={() => handleAdd(type)}
              />
            ))}
          </EditorMenu>
          {effects.length === 0 && (
            <Caption color="muted">
              Effects play live and render in the export.
              {canEditAudio &&
                " Edit audio opens the clip in the audio editor for offline effects."}
            </Caption>
          )}
          {effects.map((effect, index) => (
            <EffectRow
              key={effect.id}
              effect={effect}
              isFirst={index === 0}
              isLast={index === effects.length - 1}
              expanded={effect.id === expandedId}
              onExpand={expandEffect}
              onPatch={patchEffect}
              onRemove={removeEffect}
              onMove={moveEffect}
            />
          ))}
        </FlexColumn>
      </CollapsibleSection>
      {editorOpen && clip.currentAssetId && (
        <Suspense fallback={null}>
          <ClipAudioEditorDialog
            clipId={clip.id}
            clipName={clip.name}
            assetId={clip.currentAssetId}
            sourceWindow={sourceWindow}
            onClose={closeEditor}
          />
        </Suspense>
      )}
    </>
  );
});

ClipAudioEffects.displayName = "ClipAudioEffects";
