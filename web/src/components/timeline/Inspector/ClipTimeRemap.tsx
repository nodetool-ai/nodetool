/**
 * Time remap section (D13).
 *
 * `timeRemap` says where in the source each instant of the clip sits: a list of
 * `{t, sourceMs, easing}` keyframes with `t` normalized 0..1 over the clip's own
 * window. It replaces `speedMultiplier` entirely, and the sampler reads the
 * keyframes in array order — the validator reports a non-ascending `t` as
 * `time_remap_not_monotonic` — so every commit here re-sorts by `t` rather than
 * leaving a broken document behind.
 *
 * `sourceMs` may descend, which is reverse playback, so only `t` is constrained.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import { parseEasing, type ClipTimeRemap, type TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  CollapsibleSection,
  DeleteButton,
  FlexColumn,
  FlexRow,
  SPACING
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  INSPECTOR_ROW_BUTTON_SX,
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle
} from "./InspectorPrimitives";
import { keyframeRowKeys } from "./InspectorPrimitives.helpers";
import {
  EASING_HINT,
  UNPARSEABLE_EASING_HINT
} from "./InspectorMotionFields";

type RemapKeyframe = ClipTimeRemap["keyframes"][number];

const SCRUB_T = { step: 0.01, min: 0, max: 1 };
const SCRUB_SOURCE = { step: 10, min: 0 };

/** The whole clip playing its source once, which is what it did before. */
function defaultKeyframes(clip: TimelineClip): RemapKeyframe[] {
  const inPoint = clip.inPointMs ?? 0;
  return [
    { t: 0, sourceMs: inPoint },
    { t: 1, sourceMs: inPoint + clip.durationMs }
  ];
}

const byTime = (a: RemapKeyframe, b: RemapKeyframe) => a.t - b.t;

interface ClipTimeRemapProps {
  clip: TimelineClip;
}

export const ClipTimeRemapSection: React.FC<ClipTimeRemapProps> = memo(
  ({ clip }) => {
    const [open, setOpen] = usePersistedFold("timeRemap");
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [duplicate, setDuplicate] = useState(false);

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const keyframes = clip.timeRemap?.keyframes;

    const setKeyframes = useCallback(
      (next: RemapKeyframe[]) => {
        patchClip(clipRef.current.id, {
          timeRemap: { keyframes: [...next].sort(byTime) }
        });
      },
      [patchClip]
    );

    const handleEnabled = useCallback(
      (next: boolean) => {
        setDuplicate(false);
        patchClip(clipRef.current.id, {
          timeRemap: next
            ? (clipRef.current.timeRemap ?? {
                keyframes: defaultKeyframes(clipRef.current)
              })
            : undefined
        });
      },
      [patchClip]
    );

    const handleClear = useCallback(() => handleEnabled(false), [handleEnabled]);

    const patchKeyframe = useCallback(
      (index: number, patch: Partial<RemapKeyframe>) => {
        const current = clipRef.current.timeRemap?.keyframes ?? [];
        // Two keyframes at the same `t` make the segment between them zero
        // long, which the sampler reads as an instant jump — so the field
        // refuses rather than writing a curve nobody can edit back apart.
        if (
          patch.t !== undefined &&
          current.some((frame, i) => i !== index && frame.t === patch.t)
        ) {
          setDuplicate(true);
          return;
        }
        setDuplicate(false);
        setKeyframes(
          current.map((frame, i) => (i === index ? { ...frame, ...patch } : frame))
        );
      },
      [setKeyframes]
    );

    const addKeyframe = useCallback(() => {
      const current = clipRef.current.timeRemap?.keyframes ?? [];
      const last = current[current.length - 1];
      const taken = new Set(current.map((frame) => frame.t));
      const candidate = Math.min(1, (last?.t ?? 0) + 0.1);
      const previous = current[current.length - 2]?.t ?? 0;
      const t = taken.has(candidate)
        ? (previous + (last?.t ?? 1)) / 2
        : candidate;
      if (taken.has(t)) return;
      setKeyframes([...current, { t, sourceMs: last?.sourceMs ?? 0 }]);
    }, [setKeyframes]);

    const removeKeyframe = useCallback(
      (index: number) => {
        setDuplicate(false);
        setKeyframes(
          (clipRef.current.timeRemap?.keyframes ?? []).filter(
            (_, i) => i !== index
          )
        );
      },
      [setKeyframes]
    );

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Time remap"
              icon={<SpeedOutlinedIcon />}
              checked={keyframes !== undefined}
              onCheckedChange={handleEnabled}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            {keyframes === undefined ? (
              <Caption color="muted">
                Enable the remap to drive the source position with a curve
                instead of a speed. It replaces Speed for this clip.
              </Caption>
            ) : (
              <>
                {keyframeRowKeys(keyframes.map((k) => k.t)).map((rowKey, index) => {
                  const keyframe = keyframes[index];
                  const name = `Time remap keyframe ${index + 1}`;
                  const easingUnparseable =
                    keyframe.easing !== undefined &&
                    keyframe.easing !== "" &&
                    parseEasing(keyframe.easing) === null;
                  return (
                    <FlexColumn key={rowKey} gap={SPACING.micro}>
                      <FlexRow align="center" gap={SPACING.micro}>
                        <InspectorPillInput
                          value={keyframe.t.toFixed(2)}
                          minWidth={52}
                          scrub={SCRUB_T}
                          onCommit={(raw) => {
                            const t = Number(raw);
                            if (!Number.isFinite(t)) return;
                            patchKeyframe(index, {
                              t: Math.min(1, Math.max(0, t))
                            });
                          }}
                          ariaLabel={`${name} time`}
                        />
                        <InspectorPillInput
                          value={String(keyframe.sourceMs)}
                          unit="ms"
                          minWidth={72}
                          scrub={SCRUB_SOURCE}
                          onCommit={(raw) => {
                            const sourceMs = Number(raw);
                            if (!Number.isFinite(sourceMs)) return;
                            patchKeyframe(index, { sourceMs });
                          }}
                          ariaLabel={`${name} source time`}
                        />
                        <InspectorPillInput
                          value={keyframe.easing ?? ""}
                          placeholder="linear"
                          minWidth={96}
                          onCommit={(raw) => {
                            const easing = raw.trim();
                            patchKeyframe(index, {
                              easing: easing === "" ? undefined : easing
                            });
                          }}
                          ariaLabel={`${name} easing`}
                        />
                        <DeleteButton
                          onClick={() => removeKeyframe(index)}
                          tooltip={`Remove ${name.toLowerCase()}`}
                          ariaLabel={`Remove ${name.toLowerCase()}`}
                          iconVariant="clear"
                          sx={INSPECTOR_ROW_BUTTON_SX}
                        />
                      </FlexRow>
                      {easingUnparseable && (
                        <Caption color="muted">
                          {UNPARSEABLE_EASING_HINT}
                        </Caption>
                      )}
                    </FlexColumn>
                  );
                })}
                {duplicate && (
                  <Caption color="muted">
                    Another keyframe already sits at that time. Keyframe times
                    must differ.
                  </Caption>
                )}
                <Caption color="muted">
                  Columns are time (0..1 across the clip), source position, and
                  easing: {EASING_HINT}
                </Caption>
                <Caption color="muted">
                  Source times may descend, which plays the clip backwards.
                  Split and trim refuse a remapped clip until the remap is
                  baked.
                </Caption>
                <FlexRow gap={SPACING.md}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddOutlinedIcon />}
                    onClick={addKeyframe}
                  >
                    Add keyframe
                  </Button>
                  <Button size="small" variant="text" onClick={handleClear}>
                    Clear
                  </Button>
                </FlexRow>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);

ClipTimeRemapSection.displayName = "ClipTimeRemapSection";

interface ClipCompositionProps {
  clip: TimelineClip;
}

/**
 * Composition provenance, read-only: `insert_composition` stamps the id and the
 * parameter values it instantiated with, and editing either here would say the
 * clip came from a composition it did not. Re-inserting the composition is the
 * way to change them.
 */
export const ClipCompositionInfo: React.FC<ClipCompositionProps> = memo(
  ({ clip }) => {
    const params = Object.entries(clip.compositionParams ?? {});
    if (clip.compositionId === undefined) return null;
    return (
      <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
        <InspectorRow label="Composition">
          <Caption color="muted">{clip.compositionId}</Caption>
        </InspectorRow>
        {params.map(([name, value]) => (
          <InspectorRow key={name} label={name}>
            <Caption color="muted">{String(value)}</Caption>
          </InspectorRow>
        ))}
        <Caption color="muted">
          Stamped when the composition was inserted. Re-insert it to change
          these values.
        </Caption>
      </FlexColumn>
    );
  }
);

ClipCompositionInfo.displayName = "ClipCompositionInfo";
