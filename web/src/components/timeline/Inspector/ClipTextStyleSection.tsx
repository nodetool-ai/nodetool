/**
 * Text section: everything `ClipTextStyle` carries (T14).
 *
 * The three decorations — stroke, shadow, background scrim — are
 * absent-or-present objects rather than flags, so each gets a toggle that adds
 * it with defaults and removes it again. The gradient fill wins over `color`
 * when set, which is why both stay visible.
 */

import React, { memo, useCallback, useRef } from "react";
import TitleOutlinedIcon from "@mui/icons-material/TitleOutlined";
import type { ClipTextStyle, ShapeFill, TimelineClip } from "@nodetool-ai/timeline";

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
  InspectorToggleRow
} from "./InspectorPrimitives";
import { FillFields } from "./InspectorMotionFields";

const TEXT_ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
] as const;

const VERTICAL_ALIGNMENTS = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" }
] as const;

const FONT_STYLES = [
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" }
] as const;

// These colours are drawn into the exported frame by the compositor, not into
// the editor's chrome: a palette token would make the render follow the user's
// theme. They are document defaults, so they stay literal.
/* eslint-disable design-tokens/color-tokens */
const DEFAULT_STROKE = { color: "#000000", widthPx: 2 };
const DEFAULT_SHADOW = {
  color: "#000000",
  blurPx: 8,
  offsetX: 0,
  offsetY: 4
};
const DEFAULT_BACKGROUND = { color: "#000000", paddingPx: 16, radiusPx: 8 };
/* eslint-enable design-tokens/color-tokens */

const SCRUB_PX = { step: 1 };
const SCRUB_UNIT = { step: 0.01, min: 0 };

interface ClipTextStyleSectionProps {
  clip: TimelineClip;
  textStyle: ClipTextStyle;
}

export const ClipTextStyleSection: React.FC<ClipTextStyleSectionProps> = memo(
  ({ clip, textStyle }) => {
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [open, setOpen] = usePersistedFold("text");

    const styleRef = useRef(textStyle);
    styleRef.current = textStyle;
    const clipIdRef = useRef(clip.id);
    clipIdRef.current = clip.id;

    const patchStyle = useCallback(
      (patch: Partial<ClipTextStyle>) => {
        patchClip(clipIdRef.current, {
          textStyle: { ...styleRef.current, ...patch }
        });
      },
      [patchClip]
    );

    // Each decoration is an object that is either there or not, so a field
    // edit merges into the current one and does nothing when it is gone.
    const patchStroke = useCallback(
      (patch: Partial<NonNullable<ClipTextStyle["stroke"]>>) => {
        const stroke = styleRef.current.stroke;
        if (!stroke) return;
        patchStyle({ stroke: { ...stroke, ...patch } });
      },
      [patchStyle]
    );
    const patchShadow = useCallback(
      (patch: Partial<NonNullable<ClipTextStyle["shadow"]>>) => {
        const shadow = styleRef.current.shadow;
        if (!shadow) return;
        patchStyle({ shadow: { ...shadow, ...patch } });
      },
      [patchStyle]
    );
    const patchBackground = useCallback(
      (patch: Partial<NonNullable<ClipTextStyle["background"]>>) => {
        const background = styleRef.current.background;
        if (!background) return;
        patchStyle({ background: { ...background, ...patch } });
      },
      [patchStyle]
    );

    const handleFillChange = useCallback(
      (fill: ShapeFill | undefined) => patchStyle({ fill }),
      [patchStyle]
    );

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle title="Text" icon={<TitleOutlinedIcon />} />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <TextInput
              value={textStyle.text}
              multiline
              minRows={3}
              fullWidth
              onChange={(event) => patchStyle({ text: event.target.value })}
              inputProps={{ "aria-label": "Text content" }}
            />
            <InspectorRow label="Font">
              <TextInput
                value={textStyle.fontFamily ?? ""}
                fullWidth
                placeholder="Inter"
                onChange={(event) =>
                  patchStyle({ fontFamily: event.target.value || undefined })
                }
                inputProps={{ "aria-label": "Text font family" }}
              />
            </InspectorRow>
            <InspectorRow label="Font size">
              <InspectorPillInput
                value={String(textStyle.fontSizePx)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={(raw) => {
                  const fontSizePx = Number(raw);
                  if (!Number.isFinite(fontSizePx) || fontSizePx < 1) return;
                  patchStyle({ fontSizePx });
                }}
                ariaLabel="Text font size"
              />
            </InspectorRow>
            <InspectorRow label="Weight">
              <InspectorPillInput
                value={String(textStyle.fontWeight ?? 400)}
                onCommit={(raw) => {
                  const fontWeight = Number(raw);
                  if (!Number.isFinite(fontWeight) || fontWeight < 1) return;
                  patchStyle({ fontWeight });
                }}
                ariaLabel="Text font weight"
              />
            </InspectorRow>
            <InspectorRow label="Style">
              <InspectorSelect
                label="Text font style"
                value={textStyle.fontStyle ?? "normal"}
                options={FONT_STYLES}
                onChange={(fontStyle) => patchStyle({ fontStyle })}
              />
            </InspectorRow>
            <InspectorRow label="Color">
              <TextInput
                type="color"
                value={textStyle.color}
                onChange={(event) => patchStyle({ color: event.target.value })}
                inputProps={{ "aria-label": "Text color" }}
              />
            </InspectorRow>
            <InspectorRow label="Align">
              <InspectorSelect
                label="Text alignment"
                value={textStyle.align ?? "center"}
                options={TEXT_ALIGNMENTS}
                onChange={(value) =>
                  patchStyle({ align: value as "left" | "center" | "right" })
                }
              />
            </InspectorRow>
            <InspectorRow label="Vertical align">
              <InspectorSelect
                label="Text vertical alignment"
                value={textStyle.verticalAlign ?? "middle"}
                options={VERTICAL_ALIGNMENTS}
                onChange={(verticalAlign) => patchStyle({ verticalAlign })}
              />
            </InspectorRow>
            <InspectorRow label="Letter spacing">
              <InspectorPillInput
                value={String(textStyle.letterSpacingPx ?? 0)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={(raw) => {
                  const letterSpacingPx = Number(raw);
                  if (!Number.isFinite(letterSpacingPx)) return;
                  patchStyle({ letterSpacingPx });
                }}
                ariaLabel="Text letter spacing"
              />
            </InspectorRow>
            <InspectorRow label="Line height">
              <InspectorPillInput
                value={(textStyle.lineHeight ?? 1.2).toFixed(2)}
                unit="×"
                scrub={SCRUB_UNIT}
                onCommit={(raw) => {
                  const lineHeight = Number(raw);
                  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
                  patchStyle({ lineHeight });
                }}
                ariaLabel="Text line height"
              />
            </InspectorRow>

            <InspectorToggleRow
              label="Stroke"
              checked={textStyle.stroke !== undefined}
              onChange={(on) =>
                patchStyle({ stroke: on ? DEFAULT_STROKE : undefined })
              }
            />
            {textStyle.stroke && (
              <>
                <InspectorRow label="Stroke color">
                  <TextInput
                    type="color"
                    value={textStyle.stroke.color}
                    onChange={(event) =>
                      patchStroke({ color: event.target.value })
                    }
                    inputProps={{ "aria-label": "Text stroke color" }}
                  />
                </InspectorRow>
                <InspectorRow label="Stroke width">
                  <InspectorPillInput
                    value={String(textStyle.stroke.widthPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const widthPx = Number(raw);
                      if (!Number.isFinite(widthPx) || widthPx < 0) return;
                      patchStroke({ widthPx });
                    }}
                    ariaLabel="Text stroke width"
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label="Shadow"
              checked={textStyle.shadow !== undefined}
              onChange={(on) =>
                patchStyle({ shadow: on ? DEFAULT_SHADOW : undefined })
              }
            />
            {textStyle.shadow && (
              <>
                <InspectorRow label="Shadow color">
                  <TextInput
                    type="color"
                    value={textStyle.shadow.color}
                    onChange={(event) =>
                      patchShadow({ color: event.target.value })
                    }
                    inputProps={{ "aria-label": "Text shadow color" }}
                  />
                </InspectorRow>
                <InspectorRow label="Shadow blur">
                  <InspectorPillInput
                    value={String(textStyle.shadow.blurPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const blurPx = Number(raw);
                      if (!Number.isFinite(blurPx) || blurPx < 0) return;
                      patchShadow({ blurPx });
                    }}
                    ariaLabel="Text shadow blur"
                  />
                </InspectorRow>
                <InspectorRow label="Shadow offset">
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetX)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const offsetX = Number(raw);
                      if (!Number.isFinite(offsetX)) return;
                      patchShadow({ offsetX });
                    }}
                    ariaLabel="Text shadow offset X"
                  />
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetY)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const offsetY = Number(raw);
                      if (!Number.isFinite(offsetY)) return;
                      patchShadow({ offsetY });
                    }}
                    ariaLabel="Text shadow offset Y"
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label="Background"
              checked={textStyle.background !== undefined}
              onChange={(on) =>
                patchStyle({ background: on ? DEFAULT_BACKGROUND : undefined })
              }
            />
            {textStyle.background && (
              <>
                <InspectorRow label="Background color">
                  <TextInput
                    type="color"
                    value={textStyle.background.color}
                    onChange={(event) =>
                      patchBackground({ color: event.target.value })
                    }
                    inputProps={{ "aria-label": "Text background color" }}
                  />
                </InspectorRow>
                <InspectorRow label="Background padding">
                  <InspectorPillInput
                    value={String(textStyle.background.paddingPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const paddingPx = Number(raw);
                      if (!Number.isFinite(paddingPx) || paddingPx < 0) return;
                      patchBackground({ paddingPx });
                    }}
                    ariaLabel="Text background padding"
                  />
                </InspectorRow>
                <InspectorRow label="Background radius">
                  <InspectorPillInput
                    value={String(textStyle.background.radiusPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={(raw) => {
                      const radiusPx = Number(raw);
                      if (!Number.isFinite(radiusPx) || radiusPx < 0) return;
                      patchBackground({ radiusPx });
                    }}
                    ariaLabel="Text background radius"
                  />
                </InspectorRow>
              </>
            )}

            <FillFields
              fill={textStyle.fill}
              labelPrefix="Text fill"
              onChange={handleFillChange}
            />
            <Caption color="muted">
              A gradient fill is drawn instead of the colour above.
            </Caption>
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

ClipTextStyleSection.displayName = "ClipTextStyleSection";
