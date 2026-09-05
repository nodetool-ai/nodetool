/**
 * Curve list for a `preset: "custom"` animation (D2).
 *
 * A first-class keyframe animation is `custom.curves` written directly, with
 * no code behind it — so this is a list of curves, each a table of
 * `{t, value, easing}` rows, and deliberately not a graph editor (a non-goal
 * of the motion-graphics plan). `t` is normalized 0..1 over the animation's own
 * window; `value` is in the channel's units.
 *
 * A curve baked from JavaScript is read-only here: editing the keyframes would
 * silently disagree with the code that produced them, so the editor says where
 * the motion came from and leaves it alone (I4).
 */

import React, { memo, useCallback, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  ANIMATED_PROPERTIES,
  parseEasing,
  type CustomClipAnimation
} from "@nodetool-ai/timeline";

import {
  Button,
  Caption,
  DeleteButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../../ui_primitives";
import {
  INSPECTOR_ROW_BUTTON_SX,
  InspectorPillInput,
  InspectorRow,
  InspectorSelect
} from "./InspectorPrimitives";
import { keyframeRowKeys } from "./InspectorPrimitives.helpers";
import {
  EASING_HINT,
  UNPARSEABLE_EASING_HINT
} from "./InspectorMotionFields";

type CustomCurve = CustomClipAnimation["curves"][number];
type CustomKeyframe = CustomCurve["keyframes"][number];

const PROPERTY_OPTIONS = ANIMATED_PROPERTIES.map((property) => ({
  value: property,
  label: property
}));

const DEFAULT_KEYFRAMES: CustomKeyframe[] = [
  { t: 0, value: 0 },
  { t: 1, value: 1 }
];

/** A fresh `custom` payload: one opacity ramp, which is the common case. */
export function makeCustomAnimation(): CustomClipAnimation {
  return { curves: [{ property: "opacity", keyframes: DEFAULT_KEYFRAMES }] };
}

/** Keyframes are sampled in array order, so every commit re-sorts by `t`. */
const byTime = (a: CustomKeyframe, b: CustomKeyframe) => a.t - b.t;

const SCRUB_T = { step: 0.01, min: 0, max: 1 };
const SCRUB_VALUE = { step: 0.01 };

interface ClipCustomCurvesProps {
  /** The animation's `custom` payload, absent until the first curve. */
  custom: CustomClipAnimation | undefined;
  /** Distinguishes this animation's controls from the others on the panel. */
  labelPrefix: string;
  onChange: (next: CustomClipAnimation) => void;
}

export const ClipCustomCurves: React.FC<ClipCustomCurvesProps> = memo(
  ({ custom, labelPrefix, onChange }) => {
    const curves = custom?.curves ?? [];
    // Set when a `t` edit collided with an existing keyframe, cleared by the
    // next successful edit. A caption under the rows says so.
    const [duplicateTime, setDuplicateTime] = useState(false);
    const bakedFromCode = custom?.code !== undefined;

    // Latest-payload ref, the pattern the rest of the inspector uses: the
    // handlers below merge onto the current curves without taking a new
    // identity every time one of them changes.
    const customRef = useRef(custom);
    customRef.current = custom;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const setCurves = useCallback((next: CustomCurve[]) => {
      onChangeRef.current({ ...customRef.current, curves: next });
    }, []);

    const patchCurve = useCallback(
      (index: number, patch: Partial<CustomCurve>) => {
        setCurves(
          (customRef.current?.curves ?? []).map((curve, i) =>
            i === index ? { ...curve, ...patch } : curve
          )
        );
      },
      [setCurves]
    );

    const patchKeyframe = useCallback(
      (curveIndex: number, keyIndex: number, patch: Partial<CustomKeyframe>) => {
        const curve = customRef.current?.curves[curveIndex];
        if (!curve) return;
        // Two keyframes at one `t` make a zero-length segment the sampler
        // reads as an instant jump, and the rows become indistinguishable, so
        // the edit is refused rather than merged behind the user's back.
        if (
          patch.t !== undefined &&
          curve.keyframes.some((keyframe, i) => i !== keyIndex && keyframe.t === patch.t)
        ) {
          setDuplicateTime(true);
          return;
        }
        setDuplicateTime(false);
        patchCurve(curveIndex, {
          keyframes: curve.keyframes
            .map((keyframe, i) =>
              i === keyIndex ? { ...keyframe, ...patch } : keyframe
            )
            .sort(byTime)
        });
      },
      [patchCurve]
    );

    const addCurve = useCallback(() => {
      setCurves([
        ...(customRef.current?.curves ?? []),
        { property: "opacity", keyframes: DEFAULT_KEYFRAMES }
      ]);
    }, [setCurves]);

    const removeCurve = useCallback(
      (index: number) => {
        setDuplicateTime(false);
        setCurves(
          (customRef.current?.curves ?? []).filter((_, i) => i !== index)
        );
      },
      [setCurves]
    );

    const addKeyframe = useCallback(
      (curveIndex: number) => {
        const curve = customRef.current?.curves[curveIndex];
        if (!curve) return;
        const last = curve.keyframes[curve.keyframes.length - 1];
        const taken = new Set(curve.keyframes.map((keyframe) => keyframe.t));
        const candidate = Math.min(1, (last?.t ?? 0) + 0.1);
        const previous = curve.keyframes[curve.keyframes.length - 2]?.t ?? 0;
        // The tail is already at 1, so the new row splits the last gap.
        const t = taken.has(candidate)
          ? (previous + (last?.t ?? 1)) / 2
          : candidate;
        if (taken.has(t)) return;
        patchCurve(curveIndex, {
          keyframes: [
            ...curve.keyframes,
            { t, value: last?.value ?? 0 }
          ].sort(byTime)
        });
      },
      [patchCurve]
    );

    const removeKeyframe = useCallback(
      (curveIndex: number, keyIndex: number) => {
        const curve = customRef.current?.curves[curveIndex];
        if (!curve) return;
        setDuplicateTime(false);
        patchCurve(curveIndex, {
          keyframes: curve.keyframes.filter((_, i) => i !== keyIndex)
        });
      },
      [patchCurve]
    );

    if (bakedFromCode) {
      return (
        <Caption color="muted">
          Baked from JavaScript{custom?.bakedAt ? ` on ${custom.bakedAt}` : ""}.
          Re-bake the script to change these curves.
        </Caption>
      );
    }

    return (
      <FlexColumn gap={SPACING.md}>
        {curves.map((curve, curveIndex) => (
          <FlexColumn key={`${curve.property}-${curveIndex}`} gap={SPACING.xs}>
            <FlexRow align="center" justify="space-between" gap={SPACING.md}>
              <Text size="small">Curve {curveIndex + 1}</Text>
              <DeleteButton
                onClick={() => removeCurve(curveIndex)}
                tooltip={`Remove ${labelPrefix} curve ${curveIndex + 1}`}
                ariaLabel={`Remove ${labelPrefix} curve ${curveIndex + 1}`}
                iconVariant="clear"
                sx={INSPECTOR_ROW_BUTTON_SX}
              />
            </FlexRow>
            <InspectorRow label="Property">
              <InspectorSelect
                label={`${labelPrefix} curve ${curveIndex + 1} property`}
                value={curve.property}
                options={PROPERTY_OPTIONS}
                onChange={(property) => patchCurve(curveIndex, { property })}
                grow
              />
            </InspectorRow>
            {keyframeRowKeys(curve.keyframes.map((k) => k.t)).map((rowKey, keyIndex) => {
              const keyframe = curve.keyframes[keyIndex];
              const name = `${labelPrefix} curve ${curveIndex + 1} keyframe ${keyIndex + 1}`;
              const easingUnparseable =
                keyframe.easing !== undefined &&
                keyframe.easing !== "" &&
                parseEasing(keyframe.easing) === null;
              return (
                // `t` is unique within a curve (duplicates are refused above)
                // and the rows are sorted by it, so it is the row's identity —
                // an index would hand a removed row's draft to its neighbour.
                <FlexColumn key={rowKey} gap={SPACING.micro}>
                <FlexRow align="center" gap={SPACING.micro}>
                  <InspectorPillInput
                    value={keyframe.t.toFixed(2)}
                    minWidth={52}
                    scrub={SCRUB_T}
                    onCommit={(raw) => {
                      const t = Number(raw);
                      if (!Number.isFinite(t)) return;
                      patchKeyframe(curveIndex, keyIndex, {
                        t: Math.min(1, Math.max(0, t))
                      });
                    }}
                    ariaLabel={`${name} time`}
                  />
                  <InspectorPillInput
                    value={String(keyframe.value)}
                    minWidth={64}
                    scrub={SCRUB_VALUE}
                    onCommit={(raw) => {
                      const value = Number(raw);
                      if (!Number.isFinite(value)) return;
                      patchKeyframe(curveIndex, keyIndex, { value });
                    }}
                    ariaLabel={`${name} value`}
                  />
                  <InspectorPillInput
                    value={keyframe.easing ?? ""}
                    placeholder="linear"
                    minWidth={96}
                    onCommit={(raw) => {
                      const easing = raw.trim();
                      patchKeyframe(curveIndex, keyIndex, {
                        easing: easing === "" ? undefined : easing
                      });
                    }}
                    ariaLabel={`${name} easing`}
                  />
                  <DeleteButton
                    onClick={() => removeKeyframe(curveIndex, keyIndex)}
                    tooltip={`Remove ${name}`}
                    ariaLabel={`Remove ${name}`}
                    iconVariant="clear"
                    sx={INSPECTOR_ROW_BUTTON_SX}
                  />
                </FlexRow>
                {easingUnparseable && (
                  <Caption color="muted">{UNPARSEABLE_EASING_HINT}</Caption>
                )}
                </FlexColumn>
              );
            })}
            {duplicateTime && (
              <Caption color="muted">
                Another keyframe already sits at that time. Keyframe times must
                differ.
              </Caption>
            )}
            <Button
              size="small"
              variant="text"
              startIcon={<AddOutlinedIcon />}
              onClick={() => addKeyframe(curveIndex)}
            >
              {`Add keyframe to curve ${curveIndex + 1}`}
            </Button>
          </FlexColumn>
        ))}
        <Caption color="muted">
          Columns are time (0..1 across the animation), value, and easing:{" "}
          {EASING_HINT}
        </Caption>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddOutlinedIcon />}
          onClick={addCurve}
        >
          Add curve
        </Button>
      </FlexColumn>
    );
  }
);

ClipCustomCurves.displayName = "ClipCustomCurves";
