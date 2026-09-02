/**
 * Transition section: the incoming cut this clip owns (D5).
 *
 * `transitionIn` sits on the incoming clip and the scene model resolves the
 * outgoing partner from it, so one clip's inspector is the whole control
 * surface for a cut. "Auto" is the absent field — an overlap cross-fades by
 * itself — and "None" is a zero-length cross-fade, which is a hard cut even
 * where the clips overlap.
 */

import React, { memo, useCallback, useRef } from "react";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import type { ClipTransition, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  SPACING,
  TextInput
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";
import { parseSeconds } from "./InspectorPrimitives.helpers";
import { DIRECTION_OPTIONS, EasingField } from "./InspectorMotionFields";

/** "auto" is no `transitionIn`; "none" is a zero-length cross-fade. */
type TransitionMode =
  | "auto"
  | "none"
  | "crossfade"
  | "dipToColor"
  | "wipe"
  | "push"
  | "slide"
  | "zoom";

const TRANSITION_MODES = [
  { value: "auto", label: "Auto" },
  { value: "none", label: "None (hard cut)" },
  { value: "crossfade", label: "Crossfade" },
  { value: "dipToColor", label: "Dip to color" },
  { value: "wipe", label: "Wipe" },
  { value: "push", label: "Push" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" }
] as const;

const MODE_HINTS: Record<TransitionMode, string> = {
  auto: "Overlap this clip with the previous one on the same track to cross-fade.",
  none: "Always a hard cut, even when clips overlap.",
  crossfade: "Both clips fade across the window, measured from this clip's start.",
  dipToColor: "Both clips fade through a solid colour that peaks at the midpoint.",
  wipe: "A feathered edge reveals this clip over the outgoing one.",
  push: "This clip pushes the outgoing one off the frame.",
  slide: "This clip slides in over a stationary outgoing one.",
  zoom: "The outgoing clip scales up while this one scales in."
};

const DEFAULT_DURATION_MS = 500;
const SCRUB_SECONDS = { step: 0.02, min: 0 };

function modeOf(transition: ClipTransition | undefined): TransitionMode {
  if (!transition) return "auto";
  if (transition.durationMs <= 0) return "none";
  const known = TRANSITION_MODES.find(
    (mode) => mode.value === transition.type
  );
  return known ? (known.value as TransitionMode) : "crossfade";
}

/** A transition of `mode`, carrying over what the previous one already set. */
function buildTransition(
  mode: TransitionMode,
  previous: ClipTransition | undefined
): ClipTransition | undefined {
  if (mode === "auto") return undefined;
  if (mode === "none") return { type: "crossfade", durationMs: 0 };
  const durationMs =
    previous && previous.durationMs > 0
      ? previous.durationMs
      : DEFAULT_DURATION_MS;
  const easing = previous?.easing;
  switch (mode) {
    case "crossfade":
      return { type: "crossfade", durationMs, easing };
    case "dipToColor":
      return {
        type: "dipToColor",
        durationMs,
        color: readString(previous, "color") ?? "#000000",
        easing
      };
    case "wipe":
      return {
        type: "wipe",
        durationMs,
        direction: readString(previous, "direction") ?? "left",
        softness: readNumber(previous, "softness") ?? 0.1,
        easing
      };
    case "push":
      return {
        type: "push",
        durationMs,
        direction: readString(previous, "direction") ?? "left",
        easing
      };
    case "slide":
      return {
        type: "slide",
        durationMs,
        direction: readString(previous, "direction") ?? "left",
        easing
      };
    case "zoom":
      return { type: "zoom", durationMs, easing };
  }
}

// A transition is a union whose members carry different fields, so reading one
// that only some types have goes through a checked accessor rather than a cast.
function readString(
  transition: ClipTransition | undefined,
  key: string
): string | undefined {
  const value = (transition as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : undefined;
}
function readNumber(
  transition: ClipTransition | undefined,
  key: string
): number | undefined {
  const value = (transition as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" ? value : undefined;
}

interface ClipTransitionSectionProps {
  clip: TimelineClip;
}

export const ClipTransitionSection: React.FC<ClipTransitionSectionProps> = memo(
  ({ clip }) => {
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [open, setOpen] = usePersistedFold("transition");

    // Same latest-clip ref ClipAdjustments uses: the handlers stay
    // referentially stable so one row's edit does not re-render the rest.
    const clipRef = useRef(clip);
    clipRef.current = clip;

    const setTransition = useCallback(
      (next: ClipTransition | undefined) => {
        patchClip(clipRef.current.id, { transitionIn: next });
      },
      [patchClip]
    );

    const handleModeChange = useCallback(
      (value: string) => {
        setTransition(
          buildTransition(value as TransitionMode, clipRef.current.transitionIn)
        );
      },
      [setTransition]
    );

    const handleDurationCommit = useCallback(
      (raw: string) => {
        const ms = parseSeconds(raw);
        const current = clipRef.current.transitionIn;
        if (ms == null || !current) return;
        setTransition({ ...current, durationMs: Math.max(0, ms) });
      },
      [setTransition]
    );

    const patchField = useCallback(
      (patch: Record<string, unknown>) => {
        const current = clipRef.current.transitionIn;
        if (!current) return;
        setTransition({ ...current, ...patch } as ClipTransition);
      },
      [setTransition]
    );

    const handleEasingChange = useCallback(
      (easing: string | undefined) => patchField({ easing }),
      [patchField]
    );

    const transition = clip.transitionIn;
    const mode = modeOf(transition);
    const durationMs =
      transition && transition.durationMs > 0
        ? transition.durationMs
        : DEFAULT_DURATION_MS;
    const configurable = mode !== "auto" && mode !== "none";
    const hasDirection = mode === "wipe" || mode === "push" || mode === "slide";

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Transition"
              icon={<CompareArrowsOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Type">
              <InspectorSelect
                label="Transition type"
                value={mode}
                options={TRANSITION_MODES}
                onChange={handleModeChange}
              />
            </InspectorRow>

            {configurable && (
              <InspectorRow label="Duration">
                <InspectorPillInput
                  value={(durationMs / 1000).toFixed(2)}
                  unit="s"
                  scrub={SCRUB_SECONDS}
                  onCommit={handleDurationCommit}
                  ariaLabel="Transition duration"
                />
              </InspectorRow>
            )}

            {mode === "dipToColor" && (
              <InspectorRow label="Color">
                <TextInput
                  type="color"
                  value={readString(transition, "color") ?? "#000000"}
                  onChange={(event) =>
                    patchField({ color: event.target.value })
                  }
                  inputProps={{ "aria-label": "Transition color" }}
                />
              </InspectorRow>
            )}

            {hasDirection && (
              <InspectorRow label="Direction">
                <InspectorSelect
                  label="Transition direction"
                  value={readString(transition, "direction") ?? "left"}
                  options={DIRECTION_OPTIONS}
                  onChange={(direction) => patchField({ direction })}
                />
              </InspectorRow>
            )}

            {mode === "wipe" && (
              <InspectorSliderRow
                label="Softness"
                min={0}
                max={1}
                step={0.01}
                value={readNumber(transition, "softness") ?? 0}
                display={(readNumber(transition, "softness") ?? 0).toFixed(2)}
                onChange={(softness) => patchField({ softness })}
              />
            )}

            {configurable && (
              <EasingField
                value={transition?.easing}
                ariaLabel="Transition easing"
                onChange={handleEasingChange}
              />
            )}

            <Caption color="muted">{MODE_HINTS[mode]}</Caption>
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);

ClipTransitionSection.displayName = "ClipTransitionSection";
