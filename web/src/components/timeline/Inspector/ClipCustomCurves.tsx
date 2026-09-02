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

import React, { memo, useCallback, useRef } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  ANIMATED_PROPERTIES,
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
  InspectorPillInput,
  InspectorRow,
  InspectorSelect
} from "./InspectorPrimitives";
import { EASING_HINT } from "./InspectorMotionFields";

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
        patchCurve(curveIndex, {
          keyframes: curve.keyframes.map((keyframe, i) =>
            i === keyIndex ? { ...keyframe, ...patch } : keyframe
          )
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
        patchCurve(curveIndex, {
          keyframes: [
            ...curve.keyframes,
            { t: Math.min(1, (last?.t ?? 0) + 0.1), value: last?.value ?? 0 }
          ]
        });
      },
      [patchCurve]
    );

    const removeKeyframe = useCallback(
      (curveIndex: number, keyIndex: number) => {
        const curve = customRef.current?.curves[curveIndex];
        if (!curve) return;
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
                sx={{ width: 24, height: 24 }}
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
            {curve.keyframes.map((keyframe, keyIndex) => {
              const name = `${labelPrefix} curve ${curveIndex + 1} keyframe ${keyIndex + 1}`;
              return (
                <FlexRow
                  key={keyIndex}
                  align="center"
                  gap={SPACING.micro}
                >
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
                    sx={{ width: 20, height: 20 }}
                  />
                </FlexRow>
              );
            })}
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
