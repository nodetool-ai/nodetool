/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Caption, FlexColumn, SPACING_PX } from "../ui_primitives";
import { looksLikeSvg, sanitizeSvgMarkup } from "../../utils/sanitizeSvg";

interface SvgPreviewProps {
  /** SVG markup to paint. */
  markup: string;
}

/** Checkerboard tile, on the 4px grid. */
const CHECKER_PX = SPACING_PX.xxl;

const styles = (theme: Theme) => {
  const checker = theme.vars.palette.grey[700];
  return css({
    width: "100%",
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING_PX.xl,
    // A checkerboard, so transparent regions read as transparent rather than
    // as whatever the app theme happens to paint behind them.
    backgroundColor: theme.vars.palette.grey[800],
    backgroundImage: [
      `linear-gradient(45deg, ${checker} 25%, transparent 25%, transparent 75%, ${checker} 75%)`,
      `linear-gradient(45deg, ${checker} 25%, transparent 25%, transparent 75%, ${checker} 75%)`
    ].join(", "),
    backgroundSize: `${CHECKER_PX}px ${CHECKER_PX}px`,
    backgroundPosition: `0 0, ${CHECKER_PX / 2}px ${CHECKER_PX / 2}px`,
    ".svg-host": {
      maxWidth: "100%",
      maxHeight: "100%",
      display: "flex"
    },
    ".svg-host svg": {
      maxWidth: "100%",
      maxHeight: "100%",
      height: "auto"
    }
  });
};

/**
 * Paints SVG markup inline, sanitized.
 *
 * Inline rather than an `<img>` because the edit surface previews markup that
 * has not been saved yet — there is no stored file to point at. Everything
 * passes through `sanitizeSvgMarkup` first: the markup is written by an agent
 * or pasted by a user, and inlining it puts it on the app's own origin, where
 * the sandbox CSP the storage route sets does not apply.
 */
const SvgPreview = ({ markup }: SvgPreviewProps) => {
  const theme = useTheme();
  const previewStyles = useMemo(() => styles(theme), [theme]);
  const html = useMemo(
    () => (looksLikeSvg(markup) ? sanitizeSvgMarkup(markup) : null),
    [markup]
  );

  if (html === null) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Caption>No &lt;svg&gt; element to render</Caption>
      </FlexColumn>
    );
  }

  return (
    <div css={previewStyles}>
      <div className="svg-host" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export default SvgPreview;
