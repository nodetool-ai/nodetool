/** @jsxImportSource @emotion/react */
/**
 * ClipCaptionStyle
 *
 * The caption look, on the clip that carries the words: type, the two colours
 * a word takes depending on whether it is being spoken, how far the block sits
 * off the frame bottom, the outline under the glyphs and the scrim behind
 * them. Every field is optional in the document and an empty one here means
 * the built-in value, so this panel never has to restate a default the
 * renderer owns.
 *
 * The outline colour and the scrim's colour and radius appear once the field
 * that turns each on carries a value — an outline is a width and a scrim is a
 * padding, and neither exists without one.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined";

import type { CaptionStyle, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  CollapsibleSection,
  FlexColumn,
  BatchedColorInput
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  sectionContentStyles
} from "./InspectorPrimitives";
import { FontPicker } from "./FontPicker";

/** The colours `drawCaption` falls back to, so the swatches show what renders. */
const DEFAULT_COLOR = "#FFFFFF";
const DEFAULT_ACTIVE_COLOR = "#FFD60A";
const DEFAULT_SCRIM_COLOR = "#000000";
const DEFAULT_OUTLINE_COLOR = "#000000";

/** A fraction of the frame, shown as a percentage. Empty means unset. */
const asPercent = (value: number | undefined): string =>
  value === undefined ? "" : String(Number((value * 100).toFixed(2)));

/**
 * A committed percentage back as a fraction, or `undefined` for a cleared
 * field — which drops the key and restores the default.
 */
const fromPercent = (raw: string): number | undefined | null => {
  if (raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed / 100 : null;
};

interface ClipCaptionStyleProps {
  clip: TimelineClip;
}

export const ClipCaptionStyle: React.FC<ClipCaptionStyleProps> = memo(
  ({ clip }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const [open, setOpen] = usePersistedFold("caption");
    const patchClip = useTimelineStore((s) => s.patchClip);
    const caption = clip.caption;
    const style = caption?.style;

    const patchStyle = useCallback(
      (next: CaptionStyle) => {
        if (!caption) return;
        patchClip(clip.id, { caption: { ...caption, style: next } });
      },
      [caption, clip.id, patchClip]
    );

    /** Set one field, dropping the key when the value is cleared. */
    const setField = useCallback(
      <K extends keyof CaptionStyle>(
        key: K,
        value: CaptionStyle[K] | undefined
      ) => {
        const next: CaptionStyle = { ...style };
        if (value === undefined) delete next[key];
        else next[key] = value;
        patchStyle(next);
      },
      [patchStyle, style]
    );

    const handleFraction = useCallback(
      (key: "fontSizeFrac" | "bottomMarginFrac", raw: string) => {
        const parsed = fromPercent(raw);
        if (parsed === null) return;
        setField(key, parsed);
      },
      [setField]
    );

    const handleOutlineWidth = useCallback(
      (raw: string) => {
        if (raw.trim() === "") {
          setField("outline", undefined);
          return;
        }
        const widthPx = Number(raw);
        if (!Number.isFinite(widthPx) || widthPx < 0) return;
        setField("outline", {
          color: style?.outline?.color ?? DEFAULT_OUTLINE_COLOR,
          widthPx
        });
      },
      [setField, style?.outline?.color]
    );

    const handleScrimPadding = useCallback(
      (raw: string) => {
        if (raw.trim() === "") {
          setField("background", undefined);
          return;
        }
        const paddingPx = Number(raw);
        if (!Number.isFinite(paddingPx) || paddingPx < 0) return;
        setField("background", {
          ...style?.background,
          color: style?.background?.color ?? DEFAULT_SCRIM_COLOR,
          paddingPx
        });
      },
      [setField, style?.background]
    );

    if (!caption) return null;

    // Pulled out of `style` so the two blocks below narrow without an
    // assertion: each renders only when its own field is set.
    const outline = style?.outline;
    const scrim = style?.background;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_24.timeline.captionStyle.title")}
              icon={<ClosedCaptionOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn css={sectionContentStyles(theme)}>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.font")}>
              <FontPicker
                label={t("pass3_24.timeline.captionStyle.fontFamily")}
                value={style?.fontFamily}
                onChange={(fontFamily) => setField("fontFamily", fontFamily)}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.size")}>
              <InspectorPillInput
                value={asPercent(style?.fontSizeFrac)}
                unit="%"
                placeholder={t("pass3_24.timeline.captionStyle.sizePlaceholder")}
                allowEmpty
                onCommit={(raw) => handleFraction("fontSizeFrac", raw)}
                ariaLabel={t("pass3_24.timeline.captionStyle.sizeAriaLabel")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.color")}>
              <BatchedColorInput
                value={style?.color ?? DEFAULT_COLOR}
                onChange={(color) => setField("color", color)}
                ariaLabel={t("pass3_24.timeline.captionStyle.colorAriaLabel")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.spoken")}>
              <BatchedColorInput
                value={style?.activeColor ?? DEFAULT_ACTIVE_COLOR}
                onChange={(color) => setField("activeColor", color)}
                ariaLabel={t("pass3_24.timeline.captionStyle.spokenAriaLabel")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.bottom")}>
              <InspectorPillInput
                value={asPercent(style?.bottomMarginFrac)}
                unit="%"
                placeholder={t("pass3_24.timeline.captionStyle.bottomPlaceholder")}
                allowEmpty
                onCommit={(raw) => handleFraction("bottomMarginFrac", raw)}
                ariaLabel={t("pass3_24.timeline.captionStyle.bottomAriaLabel")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_24.timeline.captionStyle.outline")}>
              <InspectorPillInput
                value={outline ? String(outline.widthPx) : ""}
                unit="px"
                placeholder={t("pass3_24.timeline.captionStyle.autoPlaceholder")}
                allowEmpty
                onCommit={handleOutlineWidth}
                ariaLabel={t("pass3_24.timeline.captionStyle.outlineWidthAriaLabel")}
              />
            </InspectorRow>
            {outline && (
              <InspectorRow label={t("pass3_24.timeline.captionStyle.outlineColor")}>
                <BatchedColorInput
                  value={outline.color}
                  onChange={(color) =>
                    setField("outline", { color, widthPx: outline.widthPx })
                  }
                  ariaLabel={t("pass3_24.timeline.captionStyle.outlineColorAriaLabel")}
                />
              </InspectorRow>
            )}
            <InspectorRow label={t("pass3_24.timeline.captionStyle.scrim")}>
              <InspectorPillInput
                value={scrim ? String(scrim.paddingPx) : ""}
                unit="px"
                placeholder={t("pass3_24.timeline.captionStyle.nonePlaceholder")}
                allowEmpty
                onCommit={handleScrimPadding}
                ariaLabel={t("pass3_24.timeline.captionStyle.scrimPaddingAriaLabel")}
              />
            </InspectorRow>
            {scrim && (
              <>
                <InspectorRow label={t("pass3_24.timeline.captionStyle.scrimColor")}>
                  <BatchedColorInput
                    value={scrim.color}
                    onChange={(color) =>
                      setField("background", { ...scrim, color })
                    }
                    ariaLabel={t("pass3_24.timeline.captionStyle.scrimColorAriaLabel")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_24.timeline.captionStyle.scrimRadius")}>
                  <InspectorPillInput
                    value={String(scrim.radiusPx ?? 0)}
                    unit="px"
                    onCommit={(raw) => {
                      const radiusPx = Number(raw);
                      if (!Number.isFinite(radiusPx) || radiusPx < 0) return;
                      setField("background", { ...scrim, radiusPx });
                    }}
                    ariaLabel={t("pass3_24.timeline.captionStyle.scrimRadiusAriaLabel")}
                  />
                </InspectorRow>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);

ClipCaptionStyle.displayName = "ClipCaptionStyle";
