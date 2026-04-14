/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Caption,
  Popover
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
    padding: "16px 18px",
    minWidth: 480,
    ".aspect-header": {
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 12
    },
    ".aspect-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(6, minmax(70px, 1fr))",
      gap: 10
    },
    ".aspect-option": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "8px 4px",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      borderRadius: 10,
      transition: "background-color 120ms ease",
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.04)"
      },
      "&.selected": {
        backgroundColor: "rgba(89, 135, 255, 0.12)"
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
      borderRadius: 6,
      boxSizing: "border-box"
    },
    ".aspect-option.selected .aspect-rect": {
      borderColor: theme.vars.palette.primary.light
    },
    ".aspect-label": {
      fontSize: 13,
      fontWeight: 500,
      color: theme.vars.palette.grey[200]
    },
    ".aspect-option.selected .aspect-label": {
      color: theme.vars.palette.primary.light
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
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="top-center"
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[800]}`,
        borderRadius: 3,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)"
      }}
    >
      <div css={styles(theme)} role="dialog" aria-label="Aspect ratio">
        <Caption className="aspect-header" size="small">
          Aspect Ratio
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
