import type { Theme } from "@mui/material/styles";

/**
 * Checkerboard pattern for transparent-image preview surfaces. Dark,
 * low-contrast squares so opaque images look normal while transparent regions
 * show a quiet grid. Works with any `object-fit`; the checkerboard tiles via
 * `background-size` independently of the image element.
 */

// Two low-contrast dark tones – visible in transparent regions,
// invisible behind opaque content.
const CHECKER_A = "#1e1e1e";
const CHECKER_B = "#2a2a2a";

const CHECKER_SIZE = "12px";
const HALF_SIZE = "6px";

const checkerboardPattern = `
  linear-gradient(45deg, ${CHECKER_B} 25%, transparent 25%),
  linear-gradient(-45deg, ${CHECKER_B} 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, ${CHECKER_B} 75%),
  linear-gradient(-45deg, transparent 75%, ${CHECKER_B} 75%)
`;

/** Theme-aware CSS property object for transparent-image preview surfaces. */
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
