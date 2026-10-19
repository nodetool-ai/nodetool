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
import { useTranslation } from "react-i18next";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import {
  parseEasing,
  sourceRate,
  type ClipTimeRemap,
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
import { parseFiniteNumber } from "./InspectorPrimitives.helpers";

type RemapKeyframe = ClipTimeRemap["keyframes"][number];

const SCRUB_T = { step: 0.01, min: 0, max: 1 };
const SCRUB_SOURCE = { step: 10, min: 0 };

/** The whole clip playing its source once, which is what it did before. */
function defaultKeyframes(clip: TimelineClip): RemapKeyframe[] {
  const inPoint = clip.inPointMs ?? 0;
  return [
    { t: 0, sourceMs: inPoint },
    {
      t: 1,
      sourceMs: clip.outPointMs ?? inPoint + clip.durationMs * sourceRate(clip)
    }
  ];
}

const byTime = (a: RemapKeyframe, b: RemapKeyframe) => a.t - b.t;

interface ClipTimeRemapProps {
  clip: TimelineClip;
}

const TimeRemapEditor: React.FC<ClipTimeRemapProps> = memo(
  ({ clip }) => {
    const { t } = useTranslation();
    const [open, setOpen] = usePersistedFold("timeRemap");
    const patchClip = useTimelineStore((s) => s.patchClip);
    const trackLocked = useTimelineStore(
      (s) => s.tracks.find((track) => track.id === clip.trackId)?.locked ?? false
    );
    const locked = !!clip.locked || trackLocked;
    const [duplicate, setDuplicate] = useState(false);
    const easingList = "linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)";

    const clipRef = useRef(clip);
    clipRef.current = clip;
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    const keyframes = clip.timeRemap?.keyframes;

    // Row identity that survives the sort a `t` edit triggers, so a scrubbed
    // row keeps its DOM node (and pointer capture) while it passes its neighbour.
    const rowIdsRef = useRef<string[]>([]);
    const nextRowIdRef = useRef(0);
    const newRowId = () => `kf-${nextRowIdRef.current++}`;
    const count = keyframes?.length ?? 0;
    if (rowIdsRef.current.length !== count) {
      rowIdsRef.current = Array.from({ length: count }, newRowId);
    }

    /** Write `next`; `ids` names its rows in the same order. */
    const setKeyframes = useCallback(
      (next: RemapKeyframe[], ids: string[]) => {
        if (lockedRef.current) return;
        const order = next
          .map((frame, i) => ({ frame, id: ids[i] }))
          .sort((a, b) => byTime(a.frame, b.frame));
        rowIdsRef.current = order.map((o) => o.id);
        patchClip(clipRef.current.id, {
          timeRemap: { keyframes: order.map((o) => o.frame) }
        });
      },
      [patchClip]
    );

    const handleEnabled = useCallback(
      (next: boolean) => {
        if (lockedRef.current) return;
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
          current.map((frame, i) => (i === index ? { ...frame, ...patch } : frame)),
          rowIdsRef.current
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
      setKeyframes(
        [...current, { t, sourceMs: last?.sourceMs ?? 0 }],
        [...rowIdsRef.current, `kf-${nextRowIdRef.current++}`]
      );
    }, [setKeyframes]);

    const removeKeyframe = useCallback(
      (index: number) => {
        setDuplicate(false);
        setKeyframes(
          (clipRef.current.timeRemap?.keyframes ?? []).filter(
            (_, i) => i !== index
          ),
          rowIdsRef.current.filter((_, i) => i !== index)
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
              title={t("pass3_26.timelineInspector.timeRemap.title")}
              icon={<SpeedOutlinedIcon />}
              checked={keyframes !== undefined}
              onCheckedChange={handleEnabled}
              checkboxDisabled={locked}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            {keyframes === undefined ? (
              <Caption color="muted">
                {t("pass3_26.timelineInspector.timeRemap.enableHelp")}
              </Caption>
            ) : (
              <>
                {rowIdsRef.current.map((rowKey, index) => {
                  const keyframe = keyframes[index];
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
                            const t = parseFiniteNumber(raw);
                            if (t === null) return;
                            patchKeyframe(index, {
                              t: Math.min(1, Math.max(0, t))
                            });
                          }}
                          disabled={locked}
                          ariaLabel={t("pass3_26.timelineInspector.timeRemap.keyframeTime", { number: index + 1 })}
                        />
                        <InspectorPillInput
                          value={String(keyframe.sourceMs)}
                          unit="ms"
                          minWidth={72}
                          scrub={SCRUB_SOURCE}
                          onCommit={(raw) => {
                            const sourceMs = parseFiniteNumber(raw);
                            if (sourceMs === null) return;
                            patchKeyframe(index, {
                              sourceMs: Math.max(0, sourceMs)
                            });
                          }}
                          disabled={locked}
                          ariaLabel={t("pass3_26.timelineInspector.timeRemap.keyframeSourceTime", { number: index + 1 })}
                        />
                        <InspectorPillInput
                          value={keyframe.easing ?? ""}
                          placeholder={t("pass3_26.timelineInspector.timeRemap.easingPlaceholder")}
                          allowEmpty
                          minWidth={96}
                          onCommit={(raw) => {
                            const easing = raw.trim();
                            patchKeyframe(index, {
                              easing: easing === "" ? undefined : easing
                            });
                          }}
                          disabled={locked}
                          ariaLabel={t("pass3_26.timelineInspector.timeRemap.keyframeEasing", { number: index + 1 })}
                        />
                        <DeleteButton
                          onClick={() => removeKeyframe(index)}
                          disabled={locked}
                          tooltip={t("pass3_26.timelineInspector.timeRemap.deleteKeyframe", { number: index + 1 })}
                          ariaLabel={t("pass3_26.timelineInspector.timeRemap.deleteKeyframe", { number: index + 1 })}
                          iconVariant="clear"
                          sx={INSPECTOR_ROW_BUTTON_SX}
                        />
                      </FlexRow>
                      {easingUnparseable && (
                        <Caption color="muted">
                    {t("pass3_26.timelineInspector.timeRemap.unparseableEasingHelp")}
                        </Caption>
                      )}
                    </FlexColumn>
                  );
                })}
                {duplicate && (
                  <Caption color="muted">
                    {t("pass3_26.timelineInspector.timeRemap.duplicateTimeError")}
                  </Caption>
                )}
                <Caption color="muted">
                  {t("pass3_26.timelineInspector.timeRemap.columnsHelp", { easing: easingList })}
                </Caption>
                <Caption color="muted">
                  {t("pass3_26.timelineInspector.timeRemap.reversePlaybackHelp")}
                </Caption>
                <FlexRow gap={SPACING.md}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddOutlinedIcon />}
                    onClick={addKeyframe}
                    disabled={locked}
                  >
                    {t("pass3_26.timelineInspector.timeRemap.addKeyframe")}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={handleClear}
                    disabled={locked}
                  >
                    {t("pass3_26.timelineInspector.timeRemap.clear")}
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

TimeRemapEditor.displayName = "TimeRemapEditor";

// Keyed by clip so the duplicate warning and row ids never carry over.
export const ClipTimeRemapSection: React.FC<ClipTimeRemapProps> = memo(
  ({ clip }) => <TimeRemapEditor key={clip.id} clip={clip} />
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
    const { t } = useTranslation();
    const params = Object.entries(clip.compositionParams ?? {});
    if (clip.compositionId === undefined) return null;
    return (
      <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
        <InspectorRow label={t("pass3_26.timelineInspector.composition.title")}>
          <Caption color="muted">{clip.compositionId}</Caption>
        </InspectorRow>
        {params.map(([name, value]) => (
          <InspectorRow key={name} label={name}>
            <Caption color="muted">{String(value)}</Caption>
          </InspectorRow>
        ))}
        <Caption color="muted">
          {t("pass3_26.timelineInspector.composition.help")}
        </Caption>
      </FlexColumn>
    );
  }
);

ClipCompositionInfo.displayName = "ClipCompositionInfo";
