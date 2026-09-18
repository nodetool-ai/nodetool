/**
 * Effects section: the shader-catalog effects a clip applies in order (D7).
 *
 * The Color section above owns one effect keyed by `inspector:color`, which is
 * edited there rather than twice. This list holds everything else in
 * `clip.effects` — the catalog effects plus anything a newer build wrote,
 * which shows as a read-only row so reordering or removing it stays possible.
 *
 * Order is the chain the compositor applies, so move-up/move-down operate on
 * the whole `clip.effects` array: the hidden colour effect keeps its slot while
 * a listed one steps over it.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import {
  isClipBlurEffect,
  isClipChromaKeyEffect,
  isClipCurvesEffect,
  isClipDropShadowEffect,
  isClipGlowEffect,
  isClipGrainEffect,
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
  Checkbox,
  CollapsibleSection,
  CONTROL,
  DeleteButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  SPACING,
  Popover,
  SearchInput,
  TruncatedText,
  TYPOGRAPHY,
  TextInput,
  ToolbarIconButton
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSliderRow,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { ToneCurveEditor } from "./ToneCurveEditor";

/** The fixed effect the dedicated Color section owns; never listed here. */
const SECTION_OWNED_IDS = new Set(["inspector:color"]);

/** Catalog effects this panel can add, in the order D7 lists them. */
const ADDABLE_EFFECTS = [
  { value: "blur", label: "Blur" },
  { value: "glow", label: "Glow" },
  { value: "dropShadow", label: "Drop shadow" },
  { value: "vignette", label: "Vignette" },
  { value: "sharpen", label: "Sharpen" },
  { value: "chromaKey", label: "Chroma key" },
  { value: "curves", label: "Curves" },
  { value: "levels", label: "Levels" },
  { value: "liftGammaGain", label: "Lift / gamma / gain" },
  { value: "grain", label: "Film grain" }
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
    case "blur":
      return { id, type, enabled: true, radius: 8 };
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
    case "grain":
      // Fine, monochrome and rolling — the stock a shot gets when somebody
      // asks for "some grain" rather than for a look.
      return {
        id,
        type,
        enabled: true,
        amount: 0.25,
        size: 1,
        colorAmount: 0,
        animate: true
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

    if (isClipBlurEffect(effect)) {
      return (
        <InspectorSliderRow
          label="Radius"
          min={0}
          max={20}
          step={0.5}
          value={effect.radius}
          display={`${effect.radius.toFixed(1)}px`}
          onChange={(radius) => onPatch({ radius })}
        />
      );
    }

    if (isClipGlowEffect(effect)) {
      return (
        <>
          <InspectorRow label="Radius">
            <InspectorPillInput
              value={String(effect.radius)}
              unit="px"
              scrub={SCRUB_PX}
              onCommit={(raw) =>
                commitNumber(raw, (radius) => onPatch({ radius }))
              }
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

    if (isClipGrainEffect(effect)) {
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
            label="Size"
            min={1}
            max={16}
            step={0.5}
            value={effect.size ?? 1}
            display={`${(effect.size ?? 1).toFixed(1)}px`}
            onChange={(size) => onPatch({ size })}
          />
          <InspectorSliderRow
            label="Colour"
            min={0}
            max={1}
            step={0.01}
            value={effect.colorAmount ?? 0}
            display={(effect.colorAmount ?? 0).toFixed(2)}
            onChange={(colorAmount) => onPatch({ colorAmount })}
          />
          <InspectorToggleRow
            label="Animate"
            checked={effect.animate ?? false}
            onChange={(animate) => onPatch({ animate })}
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
              onCommit={(raw) =>
                commitNumber(raw, (radius) => onPatch({ radius }))
              }
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
      return (
        <ToneCurveEditor
          master={effect.master}
          r={effect.r}
          g={effect.g}
          b={effect.b}
          onPatch={onPatch}
        />
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
              onCommit={(raw) =>
                commitNumber(raw, (gamma) => onPatch({ gamma }))
              }
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

    // Only `color` reaches this and is still drawn: the dedicated Color
    // section edits the inspector's own effect, not one written elsewhere.
    if (parseClipEffectType(effect.type)) {
      return (
        <Caption color="muted">
          This effect still applies. Use the Color section to adjust color.
        </Caption>
      );
    }
    return (
      <Caption color="muted">
        This build does not draw &quot;{effect.type}&quot;. Its settings are
        kept as written.
      </Caption>
    );
  }
);
EffectFields.displayName = "EffectFields";

const ROW_SX = {
  borderTop: (theme: Theme) => `1px solid ${theme.vars.palette.divider}`,
  pt: SPACING.md
};
const DELETE_SX = { width: CONTROL.height.sm, height: CONTROL.height.sm };
const EFFECT_DRAG_TYPE = "application/x-nodetool-clip-effect";

interface EffectRowProps {
  effect: ClipEffect;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onExpand: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDrop: (fromId: string, toId: string) => void;
}

/**
 * One effect's header and fields. Bound to its own id so the callbacks handed
 * down stay identical across a sibling's edit — dragging one effect's slider
 * re-renders that effect, not every other effect's whole field set.
 */
const EffectRow: React.FC<EffectRowProps> = memo(
  ({
    effect,
    isFirst,
    isLast,
    expanded,
    onExpand,
    onPatch,
    onRemove,
    onMove,
    onDrop
  }) => {
    const { id } = effect;
    const name = EFFECT_LABELS[effect.type] ?? effect.type;

    const patch = useCallback(
      (next: Record<string, unknown>) => onPatch(id, next),
      [id, onPatch]
    );
    const remove = useCallback(() => onRemove(id), [id, onRemove]);

    return (
      <FlexColumn
        gap={SPACING.xs}
        sx={ROW_SX}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(EFFECT_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          const fromId = event.dataTransfer.getData(EFFECT_DRAG_TYPE);
          if (fromId) {
            event.preventDefault();
            onDrop(fromId, id);
          }
        }}
      >
        <FlexRow align="center" gap={SPACING.micro}>
          <ToolbarIconButton
            icon={<DragIndicatorOutlinedIcon />}
            tooltip="Drag to reorder, or use Alt + arrow keys"
            aria-label={`Reorder ${name}`}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            size="small"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(EFFECT_DRAG_TYPE, id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onKeyDown={(event) => {
              if (
                event.altKey &&
                (event.key === "ArrowUp" || event.key === "ArrowDown")
              ) {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "ArrowUp" && !isFirst) onMove(id, -1);
                if (event.key === "ArrowDown" && !isLast) onMove(id, 1);
              }
            }}
          />
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
              expanded ? (
                <ExpandMoreOutlinedIcon />
              ) : (
                <ChevronRightOutlinedIcon />
              )
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
          <DeleteButton
            onClick={remove}
            tooltip={`Remove ${name} effect`}
            ariaLabel={`Remove ${name} effect`}
            iconVariant="clear"
            sx={DELETE_SX}
          />
        </FlexRow>
        {expanded && <EffectFields effect={effect} onPatch={patch} />}
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
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [query, setQuery] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const setEffects = useCallback(
      (effects: ClipEffect[]) => {
        patchClip(clipRef.current.id, { effects });
      },
      [patchClip]
    );

    const handleAdd = (type: AddableEffectType) => {
      const effect = makeEffect(type);
      setEffects([...(clipRef.current.effects ?? []), effect]);
      setExpandedId(effect.id);
      setMenuAnchor(null);
      setQuery("");
    };
    const expandEffect = useCallback((id: string) => {
      setExpandedId((current) => (current === id ? null : id));
    }, []);

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

    const dropEffect = useCallback(
      (fromId: string, toId: string) => {
        const effects = clipRef.current.effects ?? [];
        const visible = effects.filter(
          (effect) => !SECTION_OWNED_IDS.has(effect.id)
        );
        const from = visible.findIndex((effect) => effect.id === fromId);
        const to = visible.findIndex((effect) => effect.id === toId);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = visible.splice(from, 1);
        visible.splice(to, 0, moved);
        let index = 0;
        setEffects(
          effects.map((effect) =>
            SECTION_OWNED_IDS.has(effect.id) ? effect : visible[index++]
          )
        );
      },
      [setEffects]
    );

    const listed = useMemo(
      () =>
        (clip.effects ?? []).filter(
          (effect) => !SECTION_OWNED_IDS.has(effect.id)
        ),
      [clip.effects]
    );
    const matchingEffects = ADDABLE_EFFECTS.filter((effect) =>
      effect.label.toLowerCase().includes(query.trim().toLowerCase())
    );

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <FlexRow align="center" gap={SPACING.md}>
              <InspectorSectionTitle
                title="Effects"
                icon={<AutoAwesomeOutlinedIcon />}
              />
              {listed.length > 0 && (
                <Caption color="muted">
                  {listed.filter((effect) => effect.enabled).length}/
                  {listed.length} active
                </Caption>
              )}
            </FlexRow>
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.md} sx={{ py: SPACING.xs }}>
            <Button
              size="small"
              variant="text"
              startIcon={<AddOutlinedIcon />}
              onClick={(event) => {
                setQuery("");
                setMenuAnchor(event.currentTarget);
              }}
              aria-haspopup="dialog"
              aria-expanded={Boolean(menuAnchor)}
              sx={{ alignSelf: "flex-start" }}
            >
              Add effect
            </Button>
            <Popover
              open={Boolean(menuAnchor)}
              anchorEl={menuAnchor}
              onClose={() => setMenuAnchor(null)}
            >
              <FlexColumn
                role="dialog"
                aria-label="Add effect"
                gap={SPACING.md}
                sx={{ p: SPACING.md }}
              >
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search effects"
                  autoFocus
                  fullWidth
                />
                <FlexColumn gap={SPACING.none}>
                  {matchingEffects.map((effect) => (
                    <Button
                      key={effect.value}
                      variant="text"
                      size="small"
                      onClick={() => handleAdd(effect.value)}
                      sx={{ justifyContent: "flex-start" }}
                    >
                      {effect.label}
                    </Button>
                  ))}
                  {matchingEffects.length === 0 && (
                    <EmptyState size="small" title="No matching effects" />
                  )}
                </FlexColumn>
              </FlexColumn>
            </Popover>
            {listed.map((effect, index) => (
              <EffectRow
                key={effect.id}
                effect={effect}
                isFirst={index === 0}
                isLast={index === listed.length - 1}
                expanded={effect.id === expandedId}
                onExpand={expandEffect}
                onPatch={patchEffect}
                onRemove={removeEffect}
                onMove={moveEffect}
                onDrop={dropEffect}
              />
            ))}
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
