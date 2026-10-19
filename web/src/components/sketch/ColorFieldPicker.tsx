/**
 * ColorFieldPicker — inline saturation/value square + linear hue strip.
 *
 * The two-control picker the image-editor design uses for the COLOR panel.
 * The SV-square + hue geometry mirrors the popover picker
 * ({@link ColorPickerPopover}), but reimplemented as plain draggable Boxes so
 * the always-open inline panel needs no raw MUI Slider (primitives-first).
 *
 * Controlled: takes the current `color` and emits every drag via
 * `onColorChange`. Hue is tracked locally so the cursor stays put when the
 * color drifts into desaturated (white/black/grey) regions where hue is
 * mathematically ambiguous.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, FlexColumn, BORDER_RADIUS } from "../ui_primitives";
import { parseColorToRgba, rgbaToCss, rgbToHsv, hsvToRgb } from "./types";

/** Below this saturation/value, hue is ambiguous — don't resync from color. */
const MIN_SV_FOR_HUE_SYNC = 0.05;

interface ColorFieldPickerProps {
  color: string;
  onColorChange: (color: string) => void;
}

const ColorFieldPickerInner: React.FC<ColorFieldPickerProps> = ({
  color,
  onColorChange
}) => {
  const { t } = useTranslation();
  const { r, g, b, a } = parseColorToRgba(color);
  const hsv = rgbToHsv(r, g, b);

  const [localHue, setLocalHue] = useState(hsv.h);
  // Keep hue in sync with external color changes only when the color carries
  // enough saturation+value for hue to be meaningful.
  useEffect(() => {
    if (hsv.s > MIN_SV_FOR_HUE_SYNC && hsv.v > MIN_SV_FOR_HUE_SYNC) {
      setLocalHue(hsv.h);
    }
  }, [hsv.h, hsv.s, hsv.v]);

  // ── SV square drag ───────────────────────────────────────────────────────
  const svRef = useRef<HTMLDivElement>(null);
  const draggingSv = useRef(false);
  const svFromXY = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(
        0,
        Math.min(1, 1 - (clientY - rect.top) / rect.height)
      );
      const { r: nr, g: ng, b: nb } = hsvToRgb(localHue, s, v);
      onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
    },
    [localHue, a, onColorChange]
  );

  // ── Hue strip drag ───────────────────────────────────────────────────────
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingHue = useRef(false);
  const hueFromX = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h =
        Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360;
      setLocalHue(h);
      const { r: nr, g: ng, b: nb } = hsvToRgb(h, hsv.s, hsv.v);
      onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
    },
    [hsv.s, hsv.v, a, onColorChange]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingSv.current) {
        svFromXY(e.clientX, e.clientY);
      } else if (draggingHue.current) {
        hueFromX(e.clientX);
      }
    };
    const onUp = () => {
      draggingSv.current = false;
      draggingHue.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [svFromXY, hueFromX]);

  const huePure = hsvToRgb(localHue, 1, 1);
  const huePureCss = `rgb(${huePure.r},${huePure.g},${huePure.b})`;
  const cursorLeftPct = hsv.s * 100;
  const cursorTopPct = (1 - hsv.v) * 100;
  const hueLeftPct = (localHue / 360) * 100;

  return (
    <FlexColumn gap={1} sx={{ width: "100%", userSelect: "none" }}>
      {/* Saturation (x) × value (y) square */}
      <Box
        ref={svRef}
        className="color-field__sv"
        role="group"
        aria-label={t("screens4_24.sketch.colorPicker.saturationBrightness")}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          let saturation = hsv.s;
          let value = hsv.v;
          if (e.key === "ArrowLeft") {
            saturation = Math.max(0, saturation - step);
          } else if (e.key === "ArrowRight") {
            saturation = Math.min(1, saturation + step);
          } else if (e.key === "ArrowDown") {
            value = Math.max(0, value - step);
          } else if (e.key === "ArrowUp") {
            value = Math.min(1, value + step);
          } else {
            return;
          }
          e.preventDefault();
          const { r: nr, g: ng, b: nb } = hsvToRgb(localHue, saturation, value);
          onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
        }}
        onMouseDown={(e: React.MouseEvent) => {
          e.preventDefault();
          draggingSv.current = true;
          svFromXY(e.clientX, e.clientY);
        }}
        sx={{
          position: "relative",
          width: "100%",
          height: 140,
          borderRadius: BORDER_RADIUS.sm,
          overflow: "hidden",
          cursor: "crosshair",
          flexShrink: 0
        }}
      >
        <Box
          sx={{ position: "absolute", inset: 0, backgroundColor: huePureCss }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right, #fff 0%, transparent 100%)"
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #000 0%, transparent 100%)"
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: `${cursorLeftPct}%`,
            top: `${cursorTopPct}%`,
            width: 12,
            height: 12,
            borderRadius: BORDER_RADIUS.circle,
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none"
          }}
        />
      </Box>

      {/* Linear hue strip */}
      <Box
        ref={hueRef}
        className="color-field__hue"
        role="slider"
        aria-label={t("screens4_24.sketch.colorPicker.hue")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(localHue)}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          let hue = localHue;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            hue = Math.max(0, hue - 1);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            hue = Math.min(360, hue + 1);
          } else if (e.key === "Home") {
            hue = 0;
          } else if (e.key === "End") {
            hue = 360;
          } else {
            return;
          }
          e.preventDefault();
          setLocalHue(hue);
          const { r: nr, g: ng, b: nb } = hsvToRgb(hue, hsv.s, hsv.v);
          onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
        }}
        onMouseDown={(e: React.MouseEvent) => {
          e.preventDefault();
          draggingHue.current = true;
          hueFromX(e.clientX);
        }}
        sx={{
          position: "relative",
          width: "100%",
          height: 12,
          borderRadius: BORDER_RADIUS.sm,
          cursor: "pointer",
          flexShrink: 0,
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: `${hueLeftPct}%`,
            width: 14,
            height: 14,
            borderRadius: BORDER_RADIUS.circle,
            backgroundColor: huePureCss,
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none"
          }}
        />
      </Box>
    </FlexColumn>
  );
};

export const ColorFieldPicker = memo(ColorFieldPickerInner);
ColorFieldPicker.displayName = "ColorFieldPicker";

export default ColorFieldPicker;
