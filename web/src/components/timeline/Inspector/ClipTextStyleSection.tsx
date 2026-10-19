/**
 * Text section: everything `ClipTextStyle` carries (T14).
 *
 * The three decorations — stroke, shadow, background scrim — are
 * absent-or-present objects rather than flags, so each gets a toggle that adds
 * it with defaults and removes it again. The gradient fill wins over `color`
 * when set, which is why both stay visible.
 */

import React, { memo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import TitleOutlinedIcon from "@mui/icons-material/TitleOutlined";
import type { ClipTextStyle, ShapeFill, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  TextArea,
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
    const { t } = useTranslation();
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

    const textAlignments = [
      { value: "left", label: t("pass3_26.timelineInspector.text.alignments.left") },
      { value: "center", label: t("pass3_26.timelineInspector.text.alignments.center") },
      { value: "right", label: t("pass3_26.timelineInspector.text.alignments.right") }
    ];
    const verticalAlignments = [
      { value: "top", label: t("pass3_26.timelineInspector.text.verticalAlignments.top") },
      { value: "middle", label: t("pass3_26.timelineInspector.text.verticalAlignments.middle") },
      { value: "bottom", label: t("pass3_26.timelineInspector.text.verticalAlignments.bottom") }
    ];
    const fontWeights = [
      { value: "100", label: t("pass3_26.timelineInspector.text.weights.thin") },
      { value: "200", label: t("pass3_26.timelineInspector.text.weights.extraLight") },
      { value: "300", label: t("pass3_26.timelineInspector.text.weights.light") },
      { value: "400", label: t("pass3_26.timelineInspector.text.weights.regular") },
      { value: "500", label: t("pass3_26.timelineInspector.text.weights.medium") },
      { value: "600", label: t("pass3_26.timelineInspector.text.weights.semibold") },
      { value: "700", label: t("pass3_26.timelineInspector.text.weights.bold") },
      { value: "800", label: t("pass3_26.timelineInspector.text.weights.extraBold") },
      { value: "900", label: t("pass3_26.timelineInspector.text.weights.black") }
    ];
    const weightOptions = (weight: number) =>
      fontWeights.some((option) => option.value === String(weight))
        ? fontWeights
        : [...fontWeights, { value: String(weight), label: t("pass3_26.timelineInspector.text.weights.custom", { weight }) }];
    const fontStyles = [
      { value: "normal", label: t("pass3_26.timelineInspector.text.styles.normal") },
      { value: "italic", label: t("pass3_26.timelineInspector.text.styles.italic") }
    ];

    const handleFillChange = useCallback(
      (fill: ShapeFill | undefined) => patchStyle({ fill }),
      [patchStyle]
    );

    // A stable callback per field, so an edit re-renders only the field whose
    // value changed rather than every memoized control in the section.
    // One undo entry per focused typing session, not one per keystroke.
    const textHistory = useTimelineHistoryBatch();
    const handleTextFocus = useCallback(
      () => textHistory.begin(),
      [textHistory]
    );
    const handleTextBlur = useCallback(() => textHistory.end(), [textHistory]);
    const handleTextChange = useCallback(
      (value: string) => {
        patchStyle({ text: value });
        textHistory.mark();
      },
      [patchStyle, textHistory]
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
            <InspectorSectionTitle title={t("pass3_26.timelineInspector.text.title")} icon={<TitleOutlinedIcon />} />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            <TextArea
              value={textStyle.text}
              minRows={3}
              fullWidth
              onChange={handleTextChange}
              onFocus={handleTextFocus}
              onBlur={handleTextBlur}
              inputProps={{ "aria-label": t("pass3_26.timelineInspector.text.content") }}
            />
            <InspectorRow label={t("pass3_26.timelineInspector.text.font")}>
              <FontPicker
                label={t("pass3_26.timelineInspector.text.fontFamily")}
                value={textStyle.fontFamily}
                onChange={handleFontFamilyChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.fontSize")}>
              <InspectorPillInput
                value={String(textStyle.fontSizePx)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={handleFontSizeCommit}
                ariaLabel={t("pass3_26.timelineInspector.text.fontSize")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.weight")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.text.fontWeight")}
                value={String(textStyle.fontWeight ?? 400)}
                options={weightOptions(textStyle.fontWeight ?? 400)}
                onChange={handleFontWeightChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.style")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.text.fontStyle")}
                value={textStyle.fontStyle ?? "normal"}
                options={fontStyles}
                onChange={handleFontStyleChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.color")}>
              <BatchedColorInput
                value={textStyle.color}
                onChange={handleColorChange}
                ariaLabel={t("pass3_26.timelineInspector.text.color")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.align")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.text.alignment")}
                value={textStyle.align ?? "center"}
                options={textAlignments}
                onChange={handleAlignChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.verticalAlign")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.text.verticalAlignment")}
                value={textStyle.verticalAlign ?? "middle"}
                options={verticalAlignments}
                onChange={handleVerticalAlignChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.letterSpacing")}>
              <InspectorPillInput
                value={String(textStyle.letterSpacingPx ?? 0)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={handleLetterSpacingCommit}
                ariaLabel={t("pass3_26.timelineInspector.text.letterSpacing")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.text.lineHeight")}>
              <InspectorPillInput
                value={(textStyle.lineHeight ?? 1.2).toFixed(2)}
                unit="×"
                scrub={SCRUB_UNIT}
                onCommit={handleLineHeightCommit}
                ariaLabel={t("pass3_26.timelineInspector.text.lineHeight")}
              />
            </InspectorRow>

            <InspectorToggleRow
              label={t("pass3_26.timelineInspector.text.strikethrough")}
              checked={textStyle.strikethrough === true}
              onChange={handleStrikethroughToggle}
            />
            <InspectorToggleRow
              label={t("pass3_26.timelineInspector.text.stroke")}
              checked={textStyle.stroke !== undefined}
              onChange={handleStrokeToggle}
            />
            {textStyle.stroke && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.text.strokeColor")}>
                  <BatchedColorInput
                    value={textStyle.stroke.color}
                    onChange={handleStrokeColorChange}
                    ariaLabel={t("pass3_26.timelineInspector.text.strokeColor")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.text.strokeWidth")}>
                  <InspectorPillInput
                    value={String(textStyle.stroke.widthPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleStrokeWidthCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.strokeWidth")}
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label={t("pass3_26.timelineInspector.text.shadow")}
              checked={textStyle.shadow !== undefined}
              onChange={handleShadowToggle}
            />
            {textStyle.shadow && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.text.shadowColor")}>
                  <BatchedColorInput
                    value={textStyle.shadow.color}
                    onChange={handleShadowColorChange}
                    ariaLabel={t("pass3_26.timelineInspector.text.shadowColor")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.text.shadowBlur")}>
                  <InspectorPillInput
                    value={String(textStyle.shadow.blurPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleShadowBlurCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.shadowBlur")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.text.shadowOffset")}>
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetX)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={handleShadowOffsetXCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.shadowOffsetX")}
                  />
                  <InspectorPillInput
                    value={String(textStyle.shadow.offsetY)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PX}
                    onCommit={handleShadowOffsetYCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.shadowOffsetY")}
                  />
                </InspectorRow>
              </>
            )}

            <InspectorToggleRow
              label={t("pass3_26.timelineInspector.text.background")}
              checked={textStyle.background !== undefined}
              onChange={handleBackgroundToggle}
            />
            {textStyle.background && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.text.backgroundColor")}>
                  <BatchedColorInput
                    value={textStyle.background.color}
                    onChange={handleBackgroundColorChange}
                    ariaLabel={t("pass3_26.timelineInspector.text.backgroundColor")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.text.backgroundPadding")}>
                  <InspectorPillInput
                    value={String(textStyle.background.paddingPx)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleBackgroundPaddingCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.backgroundPadding")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.text.backgroundRadius")}>
                  <InspectorPillInput
                    value={String(textStyle.background.radiusPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleBackgroundRadiusCommit}
                    ariaLabel={t("pass3_26.timelineInspector.text.backgroundRadius")}
                  />
                </InspectorRow>
              </>
            )}

            <FillFields
              fill={textStyle.fill}
              labelPrefix={t("pass3_26.timelineInspector.text.fill")}
              onChange={handleFillChange}
            />
            <Caption color="muted">
              {t("pass3_26.timelineInspector.text.gradientHelp")}
            </Caption>
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

ClipTextStyleSection.displayName = "ClipTextStyleSection";
