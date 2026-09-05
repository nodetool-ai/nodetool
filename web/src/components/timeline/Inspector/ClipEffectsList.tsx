/**
 * Effects section: the shader-catalog effects a clip applies in order (D7).
 *
 * The Color and Blur sections above own one effect each, keyed by a fixed id
 * (`inspector:color`, `inspector:blur`), and those two are edited there rather
 * than twice. This list holds everything else in `clip.effects` — the eight
 * catalog effects plus anything a newer build wrote, which shows as a
 * read-only row so reordering or removing it stays possible.
 *
 * Order is the chain the compositor applies, so move-up/move-down operate on
 * the whole `clip.effects` array: a hidden colour or blur effect keeps its
 * slot while a listed one steps over it.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlinedIcon from "@mui/icons-material/ArrowDownwardOutlined";
import {
  isClipChromaKeyEffect,
  isClipCurvesEffect,
  isClipDropShadowEffect,
  isClipGlowEffect,
  isClipLevelsEffect,
  isClipLiftGammaGainEffect,
  isClipSharpenEffect,
  isClipVignetteEffect,
  parseClipEffectType,
  type ClipEffect,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  CollapsibleSection,
  DeleteButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text,
  TextInput,
  ToolbarIconButton
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { TextCommitField } from "./InspectorMotionFields";
import {
  formatCurvePoints,
  parseCurvePoints
} from "./InspectorPrimitives.helpers";

/** The two ids the Color and Blur sections own; never listed here. */
const SECTION_OWNED_IDS = new Set(["inspector:color", "inspector:blur"]);

/** Catalog effects this panel can add, in the order D7 lists them. */
const ADDABLE_EFFECTS = [
  { value: "glow", label: "Glow" },
  { value: "dropShadow", label: "Drop shadow" },
  { value: "vignette", label: "Vignette" },
  { value: "sharpen", label: "Sharpen" },
  { value: "chromaKey", label: "Chroma key" },
  { value: "curves", label: "Curves" },
  { value: "levels", label: "Levels" },
  { value: "liftGammaGain", label: "Lift / gamma / gain" }
] as const;

type AddableEffectType = (typeof ADDABLE_EFFECTS)[number]["value"];

/**
 * Spill suppression a chroma key starts at: `keyer.chromaKey@1`'s own default,
 * which is what `makeTrackEffect("chromaKey")` writes and what the renderer
 * applies when a document leaves the field out. Read here as well as written,
 * so the slider shows the number the frame was rendered with.
 */
const DEFAULT_SPILL = 0.5;

const EFFECT_LABELS: Record<string, string> = {
  ...Object.fromEntries(ADDABLE_EFFECTS.map((e) => [e.value, e.label])),
  color: "Color",
  blur: "Blur"
};

function makeEffect(type: AddableEffectType): ClipEffect {
  const id = crypto.randomUUID();
  switch (type) {
    case "glow":
      return { id, type, enabled: true, radius: 8, intensity: 1 };
    case "dropShadow":
      return {
        id,
        type,
        enabled: true,
        offsetX: 8,
        offsetY: 8,
        blur: 12,
        // Rendered into the exported picture, not into the editor's chrome, so
        // it is a document value rather than a palette token.
        // eslint-disable-next-line design-tokens/color-tokens
        color: "#000000",
        opacity: 0.6
      };
    case "vignette":
      return { id, type, enabled: true, amount: 0.4, softness: 0.5 };
    case "sharpen":
      return { id, type, enabled: true, amount: 0.5, radius: 1 };
    case "chromaKey":
      return {
        id,
        type,
        enabled: true,
        // The green a chroma key defaults to keying out — picture, not chrome.
        // eslint-disable-next-line design-tokens/color-tokens
        color: "#00ff00",
        tolerance: 0.2,
        softness: 0.1,
        spill: DEFAULT_SPILL
      };
    case "curves":
      return {
        id,
        type,
        enabled: true,
        master: [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ]
      };
    case "levels":
      return {
        id,
        type,
        enabled: true,
        inBlack: 0,
        inWhite: 1,
        gamma: 1,
        outBlack: 0,
        outWhite: 1
      };
    case "liftGammaGain":
      return {
        id,
        type,
        enabled: true,
        lift: [0, 0, 0],
        gamma: [1, 1, 1],
        gain: [1, 1, 1]
      };
  }
}

const SCRUB_PX = { step: 1 };
const SCRUB_UNIT = { step: 0.01 };

interface EffectFieldsProps {
  effect: ClipEffect;
  onPatch: (patch: Record<string, unknown>) => void;
}

/** The parameters one effect type carries, drawn from its narrowed shape. */
const EffectFields: React.FC<EffectFieldsProps> = memo(
  ({ effect, onPatch }) => {
    const name = EFFECT_LABELS[effect.type] ?? effect.type;

    if (isClipGlowEffect(effect)) {
      return (
        <>
          <InspectorRow label="Radius">
            <InspectorPillInput
              value={String(effect.radius)}
              unit="px"
              scrub={SCRUB_PX}
              onCommit={(raw) => commitNumber(raw, (radius) => onPatch({ radius }))}
              ariaLabel={`${name} radius`}
            />
          </InspectorRow>
          <InspectorSliderRow
            label="Intensity"
            min={0}
            max={2}
            step={0.01}
            value={effect.intensity}
            display={effect.intensity.toFixed(2)}
            onChange={(intensity) => onPatch({ intensity })}
          />
          <InspectorRow label="Color">
            <TextInput
              type="color"
              value={effect.color ?? "#ffffff"}
              onChange={(event) => onPatch({ color: event.target.value })}
              inputProps={{ "aria-label": `${name} color` }}
            />
          </InspectorRow>
        </>
      );
    }

    if (isClipDropShadowEffect(effect)) {
      return (
        <>
          <InspectorRow label="Offset">
            <InspectorPillInput
              value={String(effect.offsetX)}
              unit="px"
              minWidth={64}
              scrub={SCRUB_PX}
              onCommit={(raw) =>
                commitNumber(raw, (offsetX) => onPatch({ offsetX }))
              }
              ariaLabel={`${name} offset X`}
            />
            <InspectorPillInput
              value={String(effect.offsetY)}
              unit="px"
              minWidth={64}
              scrub={SCRUB_PX}
              onCommit={(raw) =>
                commitNumber(raw, (offsetY) => onPatch({ offsetY }))
              }
              ariaLabel={`${name} offset Y`}
            />
          </InspectorRow>
          <InspectorRow label="Blur">
            <InspectorPillInput
              value={String(effect.blur)}
              unit="px"
              scrub={SCRUB_PX}
              onCommit={(raw) => commitNumber(raw, (blur) => onPatch({ blur }))}
              ariaLabel={`${name} blur`}
            />
          </InspectorRow>
          <InspectorRow label="Color">
            <TextInput
              type="color"
              value={effect.color}
              onChange={(event) => onPatch({ color: event.target.value })}
              inputProps={{ "aria-label": `${name} color` }}
            />
          </InspectorRow>
          <InspectorSliderRow
            label="Opacity"
            min={0}
            max={1}
            step={0.01}
            value={effect.opacity ?? 1}
            display={(effect.opacity ?? 1).toFixed(2)}
            onChange={(opacity) => onPatch({ opacity })}
          />
        </>
      );
    }

    if (isClipVignetteEffect(effect)) {
      return (
        <>
          <InspectorSliderRow
            label="Amount"
            min={0}
            max={1}
            step={0.01}
            value={effect.amount}
            display={effect.amount.toFixed(2)}
            onChange={(amount) => onPatch({ amount })}
          />
          <InspectorSliderRow
            label="Softness"
            min={0}
            max={1}
            step={0.01}
            value={effect.softness}
            display={effect.softness.toFixed(2)}
            onChange={(softness) => onPatch({ softness })}
          />
        </>
      );
    }

    if (isClipSharpenEffect(effect)) {
      return (
        <>
          <InspectorSliderRow
            label="Amount"
            min={0}
            max={2}
            step={0.01}
            value={effect.amount}
            display={effect.amount.toFixed(2)}
            onChange={(amount) => onPatch({ amount })}
          />
          <InspectorRow label="Radius">
            <InspectorPillInput
              value={String(effect.radius ?? 1)}
              unit="px"
              scrub={SCRUB_PX}
              onCommit={(raw) => commitNumber(raw, (radius) => onPatch({ radius }))}
              ariaLabel={`${name} radius`}
            />
          </InspectorRow>
        </>
      );
    }

    if (isClipChromaKeyEffect(effect)) {
      return (
        <>
          <InspectorRow label="Key color">
            <TextInput
              type="color"
              value={effect.color}
              onChange={(event) => onPatch({ color: event.target.value })}
              inputProps={{ "aria-label": `${name} color` }}
            />
          </InspectorRow>
          <InspectorSliderRow
            label="Tolerance"
            min={0}
            max={1}
            step={0.01}
            value={effect.tolerance}
            display={effect.tolerance.toFixed(2)}
            onChange={(tolerance) => onPatch({ tolerance })}
          />
          <InspectorSliderRow
            label="Softness"
            min={0}
            max={1}
            step={0.01}
            value={effect.softness}
            display={effect.softness.toFixed(2)}
            onChange={(softness) => onPatch({ softness })}
          />
          <InspectorSliderRow
            label="Spill"
            min={0}
            max={1}
            step={0.01}
            value={effect.spill ?? DEFAULT_SPILL}
            display={(effect.spill ?? DEFAULT_SPILL).toFixed(2)}
            onChange={(spill) => onPatch({ spill })}
          />
        </>
      );
    }

    if (isClipCurvesEffect(effect)) {
      const channels = [
        { key: "master", label: "Master", points: effect.master },
        { key: "r", label: "Red", points: effect.r },
        { key: "g", label: "Green", points: effect.g },
        { key: "b", label: "Blue", points: effect.b }
      ] as const;
      return (
        <>
          {channels.map((channel) => (
            <InspectorRow key={channel.key} label={channel.label}>
              <TextCommitField
                value={formatCurvePoints(channel.points)}
                ariaLabel={`${name} ${channel.label.toLowerCase()} points`}
                placeholder="0,0 1,1"
                onCommit={(raw) => {
                  const points = parseCurvePoints(raw);
                  if (points === null) return;
                  onPatch({
                    [channel.key]:
                      channel.key === "master"
                        ? points
                        : points.length === 0
                          ? undefined
                          : points
                  });
                }}
              />
            </InspectorRow>
          ))}
          <Caption color="muted">
            Control points as x,y pairs in 0..1, e.g. 0,0 0.5,0.6 1,1.
          </Caption>
        </>
      );
    }

    if (isClipLevelsEffect(effect)) {
      return (
        <>
          <InspectorSliderRow
            label="In black"
            min={0}
            max={1}
            step={0.01}
            value={effect.inBlack}
            display={effect.inBlack.toFixed(2)}
            onChange={(inBlack) => onPatch({ inBlack })}
          />
          <InspectorSliderRow
            label="In white"
            min={0}
            max={1}
            step={0.01}
            value={effect.inWhite}
            display={effect.inWhite.toFixed(2)}
            onChange={(inWhite) => onPatch({ inWhite })}
          />
          <InspectorRow label="Gamma">
            <InspectorPillInput
              value={effect.gamma.toFixed(2)}
              scrub={SCRUB_UNIT}
              onCommit={(raw) => commitNumber(raw, (gamma) => onPatch({ gamma }))}
              ariaLabel={`${name} gamma`}
            />
          </InspectorRow>
          <InspectorSliderRow
            label="Out black"
            min={0}
            max={1}
            step={0.01}
            value={effect.outBlack}
            display={effect.outBlack.toFixed(2)}
            onChange={(outBlack) => onPatch({ outBlack })}
          />
          <InspectorSliderRow
            label="Out white"
            min={0}
            max={1}
            step={0.01}
            value={effect.outWhite}
            display={effect.outWhite.toFixed(2)}
            onChange={(outWhite) => onPatch({ outWhite })}
          />
        </>
      );
    }

    if (isClipLiftGammaGainEffect(effect)) {
      const triples = [
        { key: "lift", label: "Lift", value: effect.lift },
        { key: "gamma", label: "Gamma", value: effect.gamma },
        { key: "gain", label: "Gain", value: effect.gain }
      ] as const;
      const channelNames = ["R", "G", "B"] as const;
      return (
        <>
          {triples.map((triple) => (
            <InspectorRow key={triple.key} label={triple.label}>
              {channelNames.map((channel, index) => (
                <InspectorPillInput
                  key={channel}
                  value={triple.value[index].toFixed(2)}
                  minWidth={52}
                  scrub={SCRUB_UNIT}
                  onCommit={(raw) =>
                    commitNumber(raw, (next) => {
                      const updated: [number, number, number] = [
                        ...triple.value
                      ];
                      updated[index] = next;
                      onPatch({ [triple.key]: updated });
                    })
                  }
                  ariaLabel={`${name} ${triple.label.toLowerCase()} ${channel}`}
                />
              ))}
            </InspectorRow>
          ))}
        </>
      );
    }

    // Only `color` and `blur` reach this and are still drawn: the Color and
    // Blur sections edit the inspector's own two, not one written elsewhere.
    if (parseClipEffectType(effect.type)) {
      return (
        <Caption color="muted">
          Written outside the inspector. It still applies; the Color and Blur
          sections edit the inspector&apos;s own effects.
        </Caption>
      );
    }
    return (
      <Caption color="muted">
        This build does not draw &quot;{effect.type}&quot;. Its settings are kept
        as written.
      </Caption>
    );
  }
);
EffectFields.displayName = "EffectFields";

const ROW_SX = {
  borderTop: (theme: Theme) => `1px solid ${theme.vars.palette.divider}`,
  pt: SPACING.md
};
const DELETE_SX = { width: 24, height: 24 };

interface EffectRowProps {
  effect: ClipEffect;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}

/**
 * One effect's header and fields. Bound to its own id so the callbacks handed
 * down stay identical across a sibling's edit — dragging one effect's slider
 * re-renders that effect, not every other effect's whole field set.
 */
const EffectRow: React.FC<EffectRowProps> = memo(
  ({ effect, isFirst, isLast, onPatch, onRemove, onMove }) => {
    const { id } = effect;
    const name = EFFECT_LABELS[effect.type] ?? effect.type;

    const patch = useCallback(
      (next: Record<string, unknown>) => onPatch(id, next),
      [id, onPatch]
    );
    const setEnabled = useCallback(
      (enabled: boolean) => onPatch(id, { enabled }),
      [id, onPatch]
    );
    const remove = useCallback(() => onRemove(id), [id, onRemove]);
    const moveUp = useCallback(() => onMove(id, -1), [id, onMove]);
    const moveDown = useCallback(() => onMove(id, 1), [id, onMove]);

    return (
      <FlexColumn gap={SPACING.xs} sx={ROW_SX}>
        <FlexRow align="center" justify="space-between" gap={SPACING.md}>
          <Text size="small">{name}</Text>
          <FlexRow align="center" gap={SPACING.micro}>
            <ToolbarIconButton
              icon={<ArrowUpwardOutlinedIcon />}
              tooltip={`Move ${name} up`}
              aria-label={`Move ${name} up`}
              size="small"
              disabled={isFirst}
              onClick={moveUp}
            />
            <ToolbarIconButton
              icon={<ArrowDownwardOutlinedIcon />}
              tooltip={`Move ${name} down`}
              aria-label={`Move ${name} down`}
              size="small"
              disabled={isLast}
              onClick={moveDown}
            />
            <DeleteButton
              onClick={remove}
              tooltip={`Remove ${name} effect`}
              ariaLabel={`Remove ${name} effect`}
              iconVariant="clear"
              sx={DELETE_SX}
            />
          </FlexRow>
        </FlexRow>
        <InspectorToggleRow
          label="Enabled"
          checked={effect.enabled}
          onChange={setEnabled}
        />
        <EffectFields effect={effect} onPatch={patch} />
      </FlexColumn>
    );
  }
);
EffectRow.displayName = "EffectRow";

interface ClipEffectsListProps {
  clip: TimelineClip;
}

export const ClipEffectsList: React.FC<ClipEffectsListProps> = memo(
  ({ clip }) => {
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [open, setOpen] = usePersistedFold("effects");
    const [newType, setNewType] = useState<AddableEffectType>("glow");

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const setEffects = useCallback(
      (effects: ClipEffect[]) => {
        patchClip(clipRef.current.id, { effects });
      },
      [patchClip]
    );

    const handleAdd = useCallback(() => {
      setEffects([...(clipRef.current.effects ?? []), makeEffect(newType)]);
    }, [newType, setEffects]);

    const patchEffect = useCallback(
      (id: string, patch: Record<string, unknown>) => {
        setEffects(
          (clipRef.current.effects ?? []).map((effect) =>
            // Merging into the effect keeps its discriminant and the fields the
            // authoring build wrote; the fields come from that type's controls.
            effect.id === id ? ({ ...effect, ...patch } as ClipEffect) : effect
          )
        );
      },
      [setEffects]
    );

    const removeEffect = useCallback(
      (id: string) => {
        setEffects(
          (clipRef.current.effects ?? []).filter((effect) => effect.id !== id)
        );
      },
      [setEffects]
    );

    /** Swap an effect with the nearest listed neighbour in that direction. */
    const moveEffect = useCallback(
      (id: string, delta: -1 | 1) => {
        const effects = [...(clipRef.current.effects ?? [])];
        const from = effects.findIndex((effect) => effect.id === id);
        if (from < 0) return;
        let to = from + delta;
        while (to >= 0 && to < effects.length) {
          if (!SECTION_OWNED_IDS.has(effects[to].id)) break;
          to += delta;
        }
        if (to < 0 || to >= effects.length) return;
        [effects[from], effects[to]] = [effects[to], effects[from]];
        setEffects(effects);
      },
      [setEffects]
    );

    const handleNewType = useCallback(
      (value: string) => setNewType(value as AddableEffectType),
      []
    );

    const listed = useMemo(
      () =>
        (clip.effects ?? []).filter(
          (effect) => !SECTION_OWNED_IDS.has(effect.id)
        ),
      [clip.effects]
    );

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Effects"
              icon={<AutoAwesomeOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.md} sx={{ py: SPACING.xs }}>
            <FlexRow gap={SPACING.md} align="center">
              <InspectorSelect
                label="New effect type"
                value={newType}
                options={ADDABLE_EFFECTS}
                onChange={handleNewType}
                grow
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                onClick={handleAdd}
              >
                Add
              </Button>
            </FlexRow>

            {listed.length === 0 ? (
              <Caption color="muted">
                Glow, drop shadow, vignette, sharpen, chroma key and the grading
                effects apply in list order.
              </Caption>
            ) : (
              listed.map((effect, index) => (
                <EffectRow
                  key={effect.id}
                  effect={effect}
                  isFirst={index === 0}
                  isLast={index === listed.length - 1}
                  onPatch={patchEffect}
                  onRemove={removeEffect}
                  onMove={moveEffect}
                />
              ))
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);

/** Commit a numeric field, ignoring anything that does not parse. */
function commitNumber(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (Number.isFinite(value)) apply(value);
}

ClipEffectsList.displayName = "ClipEffectsList";
