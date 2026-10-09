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
  TextInput,
  BatchedColorInput
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorToggleRow,
  INSPECTOR_SECTION_CONTENT_SX
} from "./InspectorPrimitives";
import { parseFiniteNumber } from "./InspectorPrimitives.helpers";
import { FillFields } from "./InspectorMotionFields";
import { FontPicker } from "./FontPicker";

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

const FONT_WEIGHTS = [
  { value: "100", label: "Thin (100)" },
  { value: "200", label: "Extra light (200)" },
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semibold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "Extra bold (800)" },
  { value: "900", label: "Black (900)" }
] as const;

/**
 * The weight menu, plus the stored weight when it is off the 100 grid (an
 * agent or an import can write 450), so the select still shows what renders.
 */
const fontWeightOptions = (weight: number) =>
  FONT_WEIGHTS.some((option) => option.value === String(weight))
    ? FONT_WEIGHTS
    : [...FONT_WEIGHTS, { value: String(weight), label: `Custom (${weight})` }];

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

const TEXT_CONTENT_INPUT_PROPS = { "aria-label": "Text content" };

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

    // A stable callback per field, so an edit re-renders only the field whose
    // value changed rather than every memoized control in the section.
    const handleTextChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) =>
        patchStyle({ text: event.target.value }),
      [patchStyle]
    );
    const handleFontFamilyChange = useCallback(
      (fontFamily: string | undefined) => patchStyle({ fontFamily }),
      [patchStyle]
    );
    const handleFontSizeCommit = useCallback(
      (raw: string) => {
        const fontSizePx = parseFiniteNumber(raw);
        if (fontSizePx === null || fontSizePx < 1) return;
        patchStyle({ fontSizePx });
      },
      [patchStyle]
    );
    const handleFontWeightChange = useCallback(
      (raw: string) => {
        const fontWeight = parseFiniteNumber(raw);
        if (fontWeight === null || fontWeight < 1) return;
        patchStyle({ fontWeight });
      },
      [patchStyle]
    );
    const handleFontStyleChange = useCallback(
      (fontStyle: string) =>
        patchStyle({ fontStyle: fontStyle as ClipTextStyle["fontStyle"] }),
      [patchStyle]
    );
    const handleColorChange = useCallback(
      (color: string) =>
        patchStyle({ color: color }),
      [patchStyle]
    );
    const handleAlignChange = useCallback(
      (align: string) =>
        patchStyle({ align: align as ClipTextStyle["align"] }),
      [patchStyle]
    );
    const handleVerticalAlignChange = useCallback(
      (verticalAlign: string) =>
        patchStyle({
          verticalAlign: verticalAlign as ClipTextStyle["verticalAlign"]
        }),
      [patchStyle]
    );
    const handleLetterSpacingCommit = useCallback(
      (raw: string) => {
        const letterSpacingPx = parseFiniteNumber(raw);
        if (letterSpacingPx === null) return;
        patchStyle({ letterSpacingPx });
      },
      [patchStyle]
    );
    const handleLineHeightCommit = useCallback(
      (raw: string) => {
        const lineHeight = parseFiniteNumber(raw);
        if (lineHeight === null || lineHeight <= 0) return;
        patchStyle({ lineHeight });
      },
      [patchStyle]
    );

    const handleStrikethroughToggle = useCallback(
      (on: boolean) => patchStyle({ strikethrough: on ? true : undefined }),
      [patchStyle]
    );

    const handleStrokeToggle = useCallback(
      (on: boolean) => patchStyle({ stroke: on ? DEFAULT_STROKE : undefined }),
      [patchStyle]
    );
    const handleStrokeColorChange = useCallback(
      (color: string) =>
        patchStroke({ color: color }),
      [patchStroke]
    );
    const handleStrokeWidthCommit = useCallback(
      (raw: string) => {
        const widthPx = parseFiniteNumber(raw);
        if (widthPx === null || widthPx < 0) return;
        patchStroke({ widthPx });
      },
      [patchStroke]
    );

    const handleShadowToggle = useCallback(
      (on: boolean) => patchStyle({ shadow: on ? DEFAULT_SHADOW : undefined }),
      [patchStyle]
    );
    const handleShadowColorChange = useCallback(
      (color: string) =>
        patchShadow({ color: color }),
      [patchShadow]
    );
    const handleShadowBlurCommit = useCallback(
      (raw: string) => {
        const blurPx = parseFiniteNumber(raw);
        if (blurPx === null || blurPx < 0) return;
        patchShadow({ blurPx });
      },
      [patchShadow]
    );
    const handleShadowOffsetXCommit = useCallback(
      (raw: string) => {
        const offsetX = parseFiniteNumber(raw);
        if (offsetX === null) return;
        patchShadow({ offsetX });
      },
      [patchShadow]
    );
    const handleShadowOffsetYCommit = useCallback(
      (raw: string) => {
        const offsetY = parseFiniteNumber(raw);
        if (offsetY === null) return;
        patchShadow({ offsetY });
      },
      [patchShadow]
    );

    const handleBackgroundToggle = useCallback(
      (on: boolean) =>
        patchStyle({ background: on ? DEFAULT_BACKGROUND : undefined }),
      [patchStyle]
    );
    const handleBackgroundColorChange = useCallback(
      (color: string) =>
        patchBackground({ color: color }),
      [patchBackground]
    );
    const handleBackgroundPaddingCommit = useCallback(
      (raw: string) => {
        const paddingPx = parseFiniteNumber(raw);
        if (paddingPx === null || paddingPx < 0) return;
        patchBackground({ paddingPx });
      },
      [patchBackground]
    );
    const handleBackgroundRadiusCommit = useCallback(
      (raw: string) => {
        const radiusPx = parseFiniteNumber(raw);
        if (radiusPx === null || radiusPx < 0) return;
        patchBackground({ radiusPx });
      },
      [patchBackground]
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
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            <TextInput
              value={textStyle.text}
              multiline
              minRows={3}
              fullWidth
              onChange={handleTextChange}
              inputProps={TEXT_CONTENT_INPUT_PROPS}
            />
            <InspectorRow label="Font">
              <FontPicker
                label="Text font family"
                value={textStyle.fontFamily}
                onChange={handleFontFamilyChange}
              />
            </InspectorRow>
            <InspectorRow label="Font size">
              <InspectorPillInput
                value={String(textStyle.fontSizePx)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={handleFontSizeCommit}
                ariaLabel="Text font size"
              />
            </InspectorRow>
            <InspectorRow label="Weight">
              <InspectorSelect
                label="Text font weight"
                value={String(textStyle.fontWeight ?? 400)}
                options={fontWeightOptions(textStyle.fontWeight ?? 400)}
                onChange={handleFontWeightChange}
              />
            </InspectorRow>
            <InspectorRow label="Style">
              <InspectorSelect
                label="Text font style"
                value={textStyle.fontStyle ?? "normal"}
                options={FONT_STYLES}
                onChange={handleFontStyleChange}
              />
            </InspectorRow>
            <InspectorRow label="Color">
              <BatchedColorInput
                value={textStyle.color}
                onChange={handleColorChange}
                ariaLabel="Text color"
              />
            </InspectorRow>
            <InspectorRow label="Align">
              <InspectorSelect
                label="Text alignment"
                value={textStyle.align ?? "center"}
                options={TEXT_ALIGNMENTS}
                onChange={handleAlignChange}
              />
            </InspectorRow>
            <InspectorRow label="Vertical align">
              <InspectorSelect
                label="Text vertical alignment"
                value={textStyle.verticalAlign ?? "middle"}
                options={VERTICAL_ALIGNMENTS}
                onChange={handleVerticalAlignChange}
              />
            </InspectorRow>
            <InspectorRow label="Letter spacing">
              <InspectorPillInput
                value={String(textStyle.letterSpacingPx ?? 0)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={handleLetterSpacingCommit}
                ariaLabel="Text letter spacing"
              />
            </InspectorRow>
            <InspectorRow label="Line height">
              <InspectorPillInput
                value={(textStyle.lineHeight ?? 1.2).toFixed(2)}
                unit="×"
                scrub={SCRUB_UNIT}
                onCommit={handleLineHeightCommit}
                ariaLabel="Text line height"
              />
            </InspectorRow>

            <InspectorToggleRow
              label="Strikethrough"
              checked={textStyle.strikethrough === true}
              onChange={handleStrikethroughToggle}
            />
            <InspectorToggleRow
              label="Stroke"
              checked={textStyle.stroke !== undefined}
              onChange={handleStrokeToggle}
            />
            {textStyle.stroke && (
              <>
                <InspectorRow label="Stroke color">
                  <BatchedColorInput
                    value={textStyle.stroke.color}
                    onChange={handleStrokeColorChange}
                    ariaLabel="Text stroke color"
                  />
                </InspectorRow>
                <InspectorRow label="Stroke width">
                  <InspectorPillInput
                    value={String(textStyle.stroke.widthPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleStrokeWidthCommit}
                    ariaLabel="Text stroke width"
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label="Shadow"
              checked={textStyle.shadow !== undefined}
              onChange={handleShadowToggle}
            />
            {textStyle.shadow && (
              <>
                <InspectorRow label="Shadow color">
                  <BatchedColorInput
                    value={textStyle.shadow.color}
                    onChange={handleShadowColorChange}
                    ariaLabel="Text shadow color"
                  />
                </InspectorRow>
                <InspectorRow label="Shadow blur">
                  <InspectorPillInput
                    value={String(textStyle.shadow.blurPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleShadowBlurCommit}
                    ariaLabel="Text shadow blur"
                  />
                </InspectorRow>
                <InspectorRow label="Shadow offset">
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetX)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={handleShadowOffsetXCommit}
                    ariaLabel="Text shadow offset X"
                  />
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetY)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={handleShadowOffsetYCommit}
                    ariaLabel="Text shadow offset Y"
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label="Background"
              checked={textStyle.background !== undefined}
              onChange={handleBackgroundToggle}
            />
            {textStyle.background && (
              <>
                <InspectorRow label="Background color">
                  <BatchedColorInput
                    value={textStyle.background.color}
                    onChange={handleBackgroundColorChange}
                    ariaLabel="Text background color"
                  />
                </InspectorRow>
                <InspectorRow label="Background padding">
                  <InspectorPillInput
                    value={String(textStyle.background.paddingPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleBackgroundPaddingCommit}
                    ariaLabel="Text background padding"
                  />
                </InspectorRow>
                <InspectorRow label="Background radius">
                  <InspectorPillInput
                    value={String(textStyle.background.radiusPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleBackgroundRadiusCommit}
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
              A gradient fill is drawn instead of the color above.
            </Caption>
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

ClipTextStyleSection.displayName = "ClipTextStyleSection";
