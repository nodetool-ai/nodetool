import { css, type SerializedStyles } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Subtle checkerboard pattern for transparent-image preview surfaces.
 *
 * The pattern uses dark, low-contrast squares so opaque images look normal
 * while transparent regions show a quiet grid.  Two presets are provided:
 *
 *  • `alphaSurfaceBg`  – raw CSS properties to spread into any style object
 *  • `alphaSurfaceCss` – a ready-made Emotion `css` block
 *
 * Both work with any `object-fit` value; the checkerboard tiles via
 * `background-size` independently of the image element.
 */

// ── colours ──────────────────────────────────────────────────────────
// Two low-contrast dark tones – visible in transparent regions,
// invisible behind opaque content.
const CHECKER_A = "#1e1e1e";
const CHECKER_B = "#2a2a2a";

// ── pattern ──────────────────────────────────────────────────────────
const CHECKER_SIZE = "12px";
const HALF_SIZE = "6px";

const checkerboardPattern = `
  linear-gradient(45deg, ${CHECKER_B} 25%, transparent 25%),
  linear-gradient(-45deg, ${CHECKER_B} 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, ${CHECKER_B} 75%),
  linear-gradient(-45deg, transparent 75%, ${CHECKER_B} 75%)
`;

// ── exports ──────────────────────────────────────────────────────────

/**
 * Theme-aware plain CSS property object for transparent-image preview surfaces.
 */
export const getAlphaSurfaceBg = (theme: Theme) => {
  const baseColor = theme.vars.palette.background.default;
  const checkerColor = theme.vars.palette.action.hover;
  const checkerboardPattern = `
  linear-gradient(45deg, ${checkerColor} 25%, transparent 25%),
  linear-gradient(-45deg, ${checkerColor} 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, ${checkerColor} 75%),
  linear-gradient(-45deg, transparent 75%, ${checkerColor} 75%)
`;

  return {
    backgroundColor: baseColor,
    backgroundImage: checkerboardPattern,
    backgroundSize: `${CHECKER_SIZE} ${CHECKER_SIZE}`,
    backgroundPosition: `0 0, 0 ${HALF_SIZE}, ${HALF_SIZE} -${HALF_SIZE}, -${HALF_SIZE} 0px`
  } as const;
};

/**
 * Plain CSS property object – spread into `sx`, `style`, or emotion `css`.
 *
 * @example
 * ```tsx
 * <Box sx={{ ...alphaSurfaceBg, width: 200, height: 200 }}>
 *   <img src={src} />
 * </Box>
 * ```
 */
export const alphaSurfaceBg = {
  backgroundColor: CHECKER_A,
  backgroundImage: checkerboardPattern,
  backgroundSize: `${CHECKER_SIZE} ${CHECKER_SIZE}`,
  backgroundPosition: `0 0, 0 ${HALF_SIZE}, ${HALF_SIZE} -${HALF_SIZE}, -${HALF_SIZE} 0px`
} as const;

/**
 * Emotion `css` block ready to apply via the `css` prop.
 *
 * @example
 * ```tsx
 * <div css={alphaSurfaceCss}>
 *   <img src={src} style={{ objectFit: "contain" }} />
 * </div>
 * ```
 */
export const alphaSurfaceCss: SerializedStyles = css(alphaSurfaceBg);
