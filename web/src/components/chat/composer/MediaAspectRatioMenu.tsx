/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Caption,
  Popover,
  EYEBROW,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import type { AspectRatioOption } from "../../../stores/MediaGenerationStore";

interface MediaAspectRatioMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: string;
  options: AspectRatioOption[];
  onChange: (value: string) => void;
}

const styles = (theme: Theme) =>
  css({
    padding: theme.spacing(4, 4),
    minWidth: 480,
    maxWidth: "100%",
    ".aspect-header": {
      ...EYEBROW,
      display: "block",
      color: theme.vars.palette.text.secondary,
      marginBottom: getSpacingPx(SPACING.md)
    },
    ".aspect-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(6, minmax(70px, 1fr))",
      gap: getSpacingPx(SPACING.md)
    },
    ".aspect-option": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xs)}`,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      borderRadius: BORDER_RADIUS.lg,
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_overlay_subtle
      },
      "&.selected": {
        backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.12)"
      }
    },
    ".aspect-glyph": {
      position: "relative",
      width: 48,
      height: 36,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".aspect-rect": {
      border: `2px solid ${theme.vars.palette.grey[400]}`,
      borderRadius: BORDER_RADIUS.md,
      boxSizing: "border-box"
    },
    ".aspect-option.selected .aspect-rect": {
      borderColor: theme.vars.palette.primary.light
    },
    ".aspect-label": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      color: theme.vars.palette.grey[200]
    },
    ".aspect-option.selected .aspect-label": {
      color: theme.vars.palette.primary.light
    },
    // Six 70px columns plus padding need ~520px, so on a phone the popover ran
    // off the screen. Drop to three columns and trim the padding.
    [theme.breakpoints.down("sm")]: {
      minWidth: 0,
      padding: theme.spacing(2, 2),
      ".aspect-grid": {
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
      }
    }
  });

/**
 * Render a single aspect ratio glyph (outlined rectangle sized proportionally).
 */
function AspectGlyph({
  width,
  height
}: {
  width: number;
  height: number;
}) {
  const max = 40;
  const ratio = width / height;
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = max;
    h = Math.max(14, max / ratio);
  } else {
    h = max;
    w = Math.max(14, max * ratio);
  }
  return (
    <span className="aspect-glyph">
      <span
        className="aspect-rect"
        style={{ width: `${w}px`, height: `${h}px` }}
      />
    </span>
  );
}

/**
 * Aspect ratio selector popover — 2-row grid of outlined rectangles
 * mirroring the reference screenshot (21:9, 16:9, 3:2, 7:5, 4:3, 5:4
 * / 1:1, 9:16, 2:3, 5:7, 3:4, 4:5).
 */
const MediaAspectRatioMenu: React.FC<MediaAspectRatioMenuProps> = ({
  anchorEl,
  open,
  onClose,
  value,
  options,
  onChange
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="top-center"
    >
      <div css={cssStyles} role="dialog" aria-label={t("i18n-next22.chat.composer.aspectRatio.title")}>
        <Caption className="aspect-header" size="small">
          {t("i18n-next22.chat.composer.aspectRatio.title")}
        </Caption>
        <div className="aspect-grid">
          {options.map((opt) => {
            const selected = opt.id === value;
            return (
              <button
                type="button"
                key={opt.id}
                className={`aspect-option${selected ? " selected" : ""}`}
                onClick={() => {
                  onChange(opt.id);
                  onClose();
                }}
                aria-pressed={selected}
              >
                <AspectGlyph width={opt.width} height={opt.height} />
                <span className="aspect-label">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
};

export default memo(MediaAspectRatioMenu);
